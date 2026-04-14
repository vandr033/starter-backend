import { MensajeApi } from '../types/MensajeApi';
import * as BookingRepo from '../repositories/booking.repo';
import { prisma } from '../prisma/client';
import { notifyBookingCreated } from '../utils/bookingNotifications';
import { BookingSource, PaymentStatus } from '@prisma/client';
import * as MarketplaceAnalyticsService from './marketplace-analytics.service';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';

interface GetSlotsParams {
    company_id: number;
    staff_id?: number;
    secondary_staff_id?: number;
    service_ids: number[];
    date: string; // "YYYY-MM-DD"
}

interface TimeSlot {
    time: string;
    staff_id: number;
    staff_name: string;
    available: boolean;
}

interface GetSlotsResult extends MensajeApi {
    data?: TimeSlot[];
}

export function resolveBookingPaymentStatus(paymentMethod: 'NONE' | 'CASH' | 'QR' | string): PaymentStatus {
    return paymentMethod === 'NONE'
        ? PaymentStatus.UNPAID
        : PaymentStatus.PENDING_CONFIRMATION;
}

/**
 * Validate that the chosen payment method is allowed by company settings.
 * Returns an error message if not allowed, or null if OK.
 */
async function validatePaymentMethod(companyId: number, paymentMethod: string): Promise<string | null> {
    if (paymentMethod === 'NONE') return null;
    const settings = await prisma.companySettings.findUnique({
        where: { company_id: companyId },
        select: { allow_cash_payment: true, allow_qr_payment: true },
    });
    if (!settings) return null; // No settings = allow all
    if (paymentMethod === 'CASH' && !settings.allow_cash_payment) {
        return 'Cash payment is not enabled for this business';
    }
    if (paymentMethod === 'QR' && !settings.allow_qr_payment) {
        return 'QR payment is not enabled for this business';
    }
    return null;
}

/**
 * Validate that the booking time respects advance booking limits.
 * Returns an error message if outside allowed window, or null if OK.
 */
async function validateAdvanceBookingLimits(companyId: number, startAt: Date): Promise<string | null> {
    const settings = await prisma.companySettings.findUnique({
        where: { company_id: companyId },
        select: { max_advance_booking_days: true, min_advance_booking_minutes: true },
    });
    if (!settings) return null;

    const now = new Date();
    const diffMs = startAt.getTime() - now.getTime();

    if (settings.min_advance_booking_minutes != null) {
        const minMs = settings.min_advance_booking_minutes * 60 * 1000;
        if (diffMs < minMs) {
            return `Bookings must be made at least ${settings.min_advance_booking_minutes} minute(s) in advance`;
        }
    }

    if (settings.max_advance_booking_days != null) {
        const maxMs = settings.max_advance_booking_days * 24 * 60 * 60 * 1000;
        if (diffMs > maxMs) {
            return `Bookings cannot be made more than ${settings.max_advance_booking_days} day(s) in advance`;
        }
    }

    return null;
}

function toAnalyticsSource(bookingSource: BookingSource | undefined): 'marketplace' | 'salon_site' | 'admin' | 'manual' {
    switch (bookingSource) {
        case BookingSource.MARKETPLACE:
            return 'marketplace';
        case BookingSource.ADMIN:
            return 'admin';
        case BookingSource.MANUAL:
            return 'manual';
        case BookingSource.SALON_SITE:
        default:
            return 'salon_site';
    }
}

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to "HH:MM" format
 */
function minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Check if a slot conflicts with any existing bookings
 */
function hasConflict(
    slotStart: Date,
    slotEnd: Date,
    bookings: Array<{ start_at: Date; end_at: Date }>,
    bufferMinutes: number
): boolean {
    // Add buffer to slot end
    const slotEndWithBuffer = new Date(slotEnd.getTime() + bufferMinutes * 60 * 1000);

    for (const booking of bookings) {
        const bookingStart = new Date(booking.start_at);
        const bookingEnd = new Date(booking.end_at);

        // Check for overlap: slot conflicts if it overlaps with booking (including buffer)
        // Overlap exists if: slotStart < bookingEnd AND slotEndWithBuffer > bookingStart
        if (slotStart < bookingEnd && slotEndWithBuffer > bookingStart) {
            return true;
        }
    }

    return false;
}

function normalizeDateOnly(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function isIntervalWithinWindows(
    startMinutes: number,
    endMinutes: number,
    windows: Array<{ start_time: string; end_time: string }>
): boolean {
    return windows.some((window) => {
        const windowStart = timeToMinutes(window.start_time);
        const windowEnd = timeToMinutes(window.end_time);
        return startMinutes >= windowStart && endMinutes <= windowEnd;
    });
}

function overlapsAnyInterval(
    startAt: Date,
    endAt: Date,
    intervals: Array<{ starts_at: Date; ends_at: Date }>
): boolean {
    return intervals.some((interval) => interval.starts_at < endAt && interval.ends_at > startAt);
}

async function isStaffAvailableForInterval(params: {
    companyId: number;
    staffId: number;
    startAt: Date;
    endAt: Date;
}): Promise<{ available: boolean; message?: string }> {
    const { companyId, staffId, startAt, endAt } = params;
    const staffList = await BookingRepo.getBookableStaff(companyId, staffId);
    if (staffList.length === 0) {
        return { available: false, message: 'Staff not found or not bookable' };
    }
    const staff = staffList[0];

    const requestDate = normalizeDateOnly(startAt);
    if (staff.start_date && requestDate < normalizeDateOnly(new Date(staff.start_date))) {
        return { available: false, message: 'Staff is not active yet for the selected date' };
    }
    if (staff.end_date && requestDate > normalizeDateOnly(new Date(staff.end_date))) {
        return { available: false, message: 'Staff is not available for the selected date' };
    }

    const dayOfWeek = requestDate.getDay();
    const companyHours = await BookingRepo.getCompanyHourWindowsForDay(companyId, dayOfWeek);
    const companyWindows = companyHours
        .filter((window) => !window.is_closed && window.open_time && window.close_time)
        .map((window) => ({ start_time: window.open_time as string, end_time: window.close_time as string }));
    if (companyWindows.length === 0) {
        return { available: false, message: 'Company is closed on this day' };
    }

    const startMinutes = startAt.getHours() * 60 + startAt.getMinutes();
    const endMinutes = endAt.getHours() * 60 + endAt.getMinutes();
    if (!isIntervalWithinWindows(startMinutes, endMinutes, companyWindows)) {
        return { available: false, message: 'Selected time is outside company opening hours' };
    }

    const [availabilityCounts, dayAvailability, timeOff, groupCommitments] = await Promise.all([
        BookingRepo.getStaffAvailabilityCounts(companyId, [staffId]),
        BookingRepo.getStaffAvailabilityForDay(companyId, [staffId], dayOfWeek),
        BookingRepo.getApprovedStaffTimeOffOverlaps(companyId, [staffId], startAt, endAt),
        BookingRepo.getGroupStaffCommitmentsForDateRange(companyId, [staffId], startAt, endAt),
    ]);

    const hasCustomSchedule = (availabilityCounts[0]?._count?.id || 0) > 0;
    if (hasCustomSchedule) {
        const staffWindows = dayAvailability.map((slot) => ({
            start_time: slot.start_time,
            end_time: slot.end_time,
        }));
        if (!isIntervalWithinWindows(startMinutes, endMinutes, staffWindows)) {
            return { available: false, message: 'Staff is not scheduled for that day/time' };
        }
    }

    if (timeOff.length > 0) {
        return { available: false, message: 'Staff is on time off for the selected time' };
    }

    if (groupCommitments.length > 0) {
        return { available: false, message: 'Staff is assigned to a group event or class at that time' };
    }

    return { available: true };
}

/**
 * Get available booking slots for a date
 */
export async function getAvailableSlots(params: GetSlotsParams): Promise<GetSlotsResult> {
    const { company_id, staff_id, secondary_staff_id, service_ids, date } = params;

    try {
        // 1. Validate company exists
        const company = await BookingRepo.getCompanyById(company_id);
        if (!company) {
            return {
                code: 404,
                message: 'Company not found',
                error: true,
            };
        }

        // 2. Get services and calculate total duration
        const services = await BookingRepo.getServicesByIds(service_ids, company_id);
        if (services.length === 0) {
            return {
                code: 400,
                message: 'No valid services found',
                error: true,
            };
        }

        const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0);

        // 3. Get company settings
        const settings = await BookingRepo.getCompanySettings(company_id);
        const bufferMinutes = settings?.booking_buffer_minutes ?? 10;
        const granularityMinutes = settings?.booking_time_granularity_minutes ?? 15;

        // 4. Parse date and get day of week (0 = Sunday, 6 = Saturday)
        // IMPORTANT: Use "T00:00:00" suffix to parse as local time, not UTC.
        // new Date("2026-02-23") parses as UTC midnight, but setHours() 
        // operates in local time, which can shift the date by a day.
        const requestedDate = new Date(date + 'T00:00:00');
        const dayOfWeek = requestedDate.getDay();

        // 5. Get company opening windows for that day
        const dayHours = await BookingRepo.getCompanyHourWindowsForDay(company_id, dayOfWeek);
        const companyWindows = dayHours
            .filter((hour) => !hour.is_closed && hour.open_time && hour.close_time)
            .map((hour) => ({
                start_time: hour.open_time as string,
                end_time: hour.close_time as string,
            }));

        if (companyWindows.length === 0) {
            return {
                code: 200,
                message: 'Company is closed on this day',
                error: false,
                data: [],
            };
        }

        // 6. Get bookable staff
        const staffList = await BookingRepo.getBookableStaff(company_id, staff_id);
        if (staffList.length === 0) {
            return {
                code: 400,
                message: staff_id ? 'Staff not found or not bookable' : 'No bookable staff found',
                error: true,
            };
        }

        const requestedDay = normalizeDateOnly(requestedDate);
        const eligibleStaff = staffList.filter((staff) => {
            if (staff.start_date && requestedDay < normalizeDateOnly(new Date(staff.start_date))) {
                return false;
            }
            if (staff.end_date && requestedDay > normalizeDateOnly(new Date(staff.end_date))) {
                return false;
            }
            return true;
        });

        if (eligibleStaff.length === 0) {
            return {
                code: 200,
                message: 'No staff available for selected date',
                error: false,
                data: [],
            };
        }

        const staffIds = eligibleStaff.map(s => s.id);

        // 7. Get existing bookings for the date
        const dateStart = new Date(date + 'T00:00:00');
        const dateEnd = new Date(date + 'T23:59:59.999');

        // Include secondary resource ID in bookings query so we can check its conflicts too
        const allResourceIds = secondary_staff_id ? [...staffIds, secondary_staff_id] : staffIds;

        const existingBookings = await BookingRepo.getBookingsForDateRange(
            company_id,
            allResourceIds,
            dateStart,
            dateEnd
        );

        // Group bookings by staff_id
        const bookingsByStaff = new Map<number, Array<{ start_at: Date; end_at: Date }>>();
        for (const booking of existingBookings) {
            if (!bookingsByStaff.has(booking.staff_id)) {
                bookingsByStaff.set(booking.staff_id, []);
            }
            bookingsByStaff.get(booking.staff_id)!.push({
                start_at: booking.start_at,
                end_at: booking.end_at,
            });
        }

        const [availabilityCounts, dayAvailability, timeOff, groupCommitments] = await Promise.all([
            BookingRepo.getStaffAvailabilityCounts(company_id, staffIds),
            BookingRepo.getStaffAvailabilityForDay(company_id, staffIds, dayOfWeek),
            BookingRepo.getApprovedStaffTimeOffOverlaps(company_id, staffIds, dateStart, dateEnd),
            BookingRepo.getGroupStaffCommitmentsForDateRange(company_id, staffIds, dateStart, dateEnd),
        ]);

        const hasCustomScheduleByStaff = new Map<number, boolean>();
        for (const entry of availabilityCounts) {
            hasCustomScheduleByStaff.set(entry.staff_id, (entry._count.id || 0) > 0);
        }

        const staffAvailabilityByStaff = new Map<number, Array<{ start_time: string; end_time: string }>>();
        for (const slot of dayAvailability) {
            if (!staffAvailabilityByStaff.has(slot.staff_id)) {
                staffAvailabilityByStaff.set(slot.staff_id, []);
            }
            staffAvailabilityByStaff.get(slot.staff_id)!.push({
                start_time: slot.start_time,
                end_time: slot.end_time,
            });
        }

        const timeOffByStaff = new Map<number, Array<{ starts_at: Date; ends_at: Date }>>();
        for (const item of timeOff) {
            if (!timeOffByStaff.has(item.staff_id)) {
                timeOffByStaff.set(item.staff_id, []);
            }
            timeOffByStaff.get(item.staff_id)!.push({
                starts_at: item.starts_at,
                ends_at: item.ends_at,
            });
        }

        const groupCommitmentsByStaff = new Map<number, Array<{ start_at: Date; end_at: Date }>>();
        for (const commitment of groupCommitments) {
            if (!groupCommitmentsByStaff.has(commitment.staff_id)) {
                groupCommitmentsByStaff.set(commitment.staff_id, []);
            }
            groupCommitmentsByStaff.get(commitment.staff_id)!.push({
                start_at: commitment.start_at,
                end_at: commitment.end_at,
            });
        }

        // Determine current time in company timezone to filter past slots
        const companyTimezone = company.timezone || 'America/La_Paz';
        const nowInCompanyTz = new Date(new Date().toLocaleString('en-US', { timeZone: companyTimezone }));
        const todayStr = nowInCompanyTz.toISOString().split('T')[0];
        const isToday = date === todayStr;
        const currentMinutes = isToday
            ? nowInCompanyTz.getHours() * 60 + nowInCompanyTz.getMinutes()
            : -1; // -1 means don't filter

        const slots: TimeSlot[] = [];

        // Generate slots at granularity intervals across each opening window
        for (const window of companyWindows) {
            const openMinutes = timeToMinutes(window.start_time);
            const closeMinutes = timeToMinutes(window.end_time);

            for (let slotMinutes = openMinutes; slotMinutes + totalDuration <= closeMinutes; slotMinutes += granularityMinutes) {
                // Skip slots in the past for today
                if (isToday && slotMinutes <= currentMinutes) {
                    continue;
                }

                const slotTime = minutesToTime(slotMinutes);

                // Create slot start and end times (using local-time parsing)
                const slotStart = new Date(date + 'T00:00:00');
                slotStart.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);

                const slotEnd = new Date(slotStart.getTime() + totalDuration * 60 * 1000);

                for (const staff of eligibleStaff) {
                    const hasCustomSchedule = hasCustomScheduleByStaff.get(staff.id) || false;
                    if (hasCustomSchedule) {
                        const staffWindows = staffAvailabilityByStaff.get(staff.id) || [];
                        const fitsSchedule = isIntervalWithinWindows(
                            slotMinutes,
                            slotMinutes + totalDuration,
                            staffWindows,
                        );
                        if (!fitsSchedule) {
                            continue;
                        }
                    }

                    const staffTimeOff = timeOffByStaff.get(staff.id) || [];
                    if (overlapsAnyInterval(slotStart, slotEnd, staffTimeOff)) {
                        continue;
                    }

                    const staffBookings = bookingsByStaff.get(staff.id) || [];
                    const staffGroupCommitments = groupCommitmentsByStaff.get(staff.id) || [];

                    const isAvailableForGroups = !hasConflict(slotStart, slotEnd, staffGroupCommitments, bufferMinutes);
                    if (!isAvailableForGroups) {
                        continue;
                    }

                    const isAvailable = !hasConflict(slotStart, slotEnd, staffBookings, bufferMinutes);
                    if (!isAvailable) continue;

                    // If a secondary resource (e.g. room) is required, also check it
                    if (secondary_staff_id) {
                        const secondaryBookings = bookingsByStaff.get(secondary_staff_id) || [];
                        const secondaryAvailable = !hasConflict(slotStart, slotEnd, secondaryBookings, bufferMinutes);
                        if (!secondaryAvailable) continue;
                    }

                    slots.push({
                        time: slotTime,
                        staff_id: staff.id,
                        staff_name: staff.display_name,
                        available: true,
                    });
                }
            }
        }

        return {
            code: 200,
            message: 'Available slots retrieved',
            error: false,
            data: slots,
        };
    } catch (error: any) {
        console.error('Error getting available slots:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

// ============================================
// CREATE BOOKING
// ============================================

interface CreateBookingParams {
    company_id: number;
    staff_id: number;
    secondary_staff_id?: number;
    service_ids: number[];
    start_at: string; // ISO datetime string
    payment_method: 'NONE' | 'CASH' | 'QR';
    notes?: string;
    user_id: string; // From authenticated session
    booking_source?: BookingSource;
    qr_proof_image_url?: string | null;
}

interface CreateBookingResult extends MensajeApi {
    data?: any;
}

/**
 * Create a new customer booking
 */
export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
    const { company_id, staff_id, secondary_staff_id, service_ids, start_at, payment_method, notes, user_id, booking_source, qr_proof_image_url } = params;

    try {
        // 1. Validate company exists and is active
        const company = await BookingRepo.getActiveCompanyById(company_id);
        if (!company) {
            return {
                code: 404,
                message: 'Company not found or inactive',
                error: true,
            };
        }

        // 1.5 Validate payment method is allowed
        const paymentError = await validatePaymentMethod(company_id, payment_method);
        if (paymentError) {
            return { code: 400, message: paymentError, error: true };
        }

        // 1.6 Fetch QR/confirm settings (plan-gated)
        const bookingSettings = await prisma.companySettings.findUnique({
            where: { company_id },
            select: { require_comprobante_for_qr: true, auto_confirm_bookings: true },
        });
        const canCustomizeFlow = await isFeatureEnabledForCompany(company_id, 'BOOKING_FLOW_CUSTOMIZATION');
        // STARTER plan: force defaults (auto-confirm ON, comprobante required)
        const requireComprobante = canCustomizeFlow ? (bookingSettings?.require_comprobante_for_qr ?? true) : true;
        const autoConfirm = canCustomizeFlow ? (bookingSettings?.auto_confirm_bookings ?? true) : true;

        // 1.7 Validate comprobante if required for QR
        if (payment_method === 'QR' && requireComprobante && !qr_proof_image_url) {
            return { code: 400, message: 'Comprobante is required for QR payment bookings', error: true };
        }

        // 2. Validate staff belongs to company and is bookable
        const staffList = await BookingRepo.getBookableStaff(company_id, staff_id);
        if (staffList.length === 0) {
            return {
                code: 400,
                message: 'Staff not found or not bookable',
                error: true,
            };
        }
        const staff = staffList[0];

        // 3. Validate all services exist and belong to company
        const services = await BookingRepo.getServicesByIds(service_ids, company_id);
        if (services.length !== service_ids.length) {
            return {
                code: 400,
                message: 'One or more services not found or inactive',
                error: true,
            };
        }

        // 4. Calculate total duration and end time
        const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0);
        const totalPrice = services.reduce((sum, s) => sum + s.price_cents, 0);

        const startAt = new Date(start_at);
        const endAt = new Date(startAt.getTime() + totalDuration * 60 * 1000);

        // 4.5 Validate advance booking limits
        const advanceError = await validateAdvanceBookingLimits(company_id, startAt);
        if (advanceError) {
            return { code: 400, message: advanceError, error: true };
        }

        // 5.5 Validate staff schedule/time-off/company windows
        const staffAvailability = await isStaffAvailableForInterval({
            companyId: company_id,
            staffId: staff_id,
            startAt,
            endAt,
        });
        if (!staffAvailability.available) {
            return {
                code: 400,
                message: staffAvailability.message || 'Staff is not available at the selected time',
                error: true,
            };
        }

        // 6. Get company settings for buffer
        const settings = await BookingRepo.getCompanySettings(company_id);
        const bufferMinutes = settings?.booking_buffer_minutes ?? 10;

        // 7. Re-validate slot availability (prevent race conditions)
        const conflict = await BookingRepo.checkSlotConflict(
            company_id,
            staff_id,
            startAt,
            endAt,
            bufferMinutes
        );

        if (conflict) {
            return {
                code: 409,
                message: 'Time slot is no longer available',
                error: true,
                data: {
                    conflicting_booking_id: conflict.id,
                    conflicting_start: conflict.start_at,
                    conflicting_end: conflict.end_at,
                },
            };
        }

        // 7b. Check secondary resource conflict (room/equipment)
        if (secondary_staff_id) {
            const secondaryConflict = await BookingRepo.checkSlotConflict(
                company_id,
                secondary_staff_id,
                startAt,
                endAt,
                bufferMinutes
            );
            if (secondaryConflict) {
                return {
                    code: 409,
                    message: 'The required room or equipment is no longer available at this time',
                    error: true,
                };
            }
        }

        const groupConflict = await BookingRepo.checkGroupSlotConflict(
            company_id,
            staff_id,
            startAt,
            endAt,
            bufferMinutes,
        );

        if (groupConflict) {
            return {
                code: 409,
                message: 'Time slot is blocked by a group reservation',
                error: true,
                data: {
                    conflict_type: groupConflict.type,
                    conflict_id: groupConflict.id,
                    conflict_title: groupConflict.title,
                    conflicting_start: groupConflict.start_at,
                    conflicting_end: groupConflict.end_at,
                },
            };
        }

        // 8. Get or create CustomerProfile
        const customerProfile = await BookingRepo.getOrCreateCustomerProfile(company_id, user_id);

        // 9. Prepare service snapshots
        const serviceSnapshots = services.map((s, index) => ({
            service_id: s.id,
            service_name_snapshot: s.name,
            price_cents_snapshot: s.price_cents,
            duration_minutes_snapshot: s.duration_minutes,
            position: index,
        }));

        // 10. Determine booking status based on auto_confirm setting
        const bookingStatus = autoConfirm ? 'CONFIRMED' as const : 'PENDING' as const;

        // 11. Create booking with services in transaction
        const booking = await BookingRepo.createBookingWithServices(
            {
                company_id,
                staff_id,
                secondary_staff_id: secondary_staff_id ?? null,
                customer_id: customerProfile.id,
                start_at: startAt,
                end_at: endAt,
                payment_method,
                notes,
                created_by_user_id: user_id,
                total_price_cents: totalPrice,
                booking_source: booking_source ?? BookingSource.SALON_SITE,
                status: bookingStatus,
                qr_proof_image_url: qr_proof_image_url ?? null,
            },
            serviceSnapshots
        );

        // 12. Send notification only when auto-confirmed and plan allows
        const canSendTransactionalNotifications = await isFeatureEnabledForCompany(
            company_id,
            'TRANSACTIONAL_BOOKING_NOTIFICATIONS',
        );
        if (autoConfirm && canSendTransactionalNotifications && company && booking) {
            const user = await prisma.user.findUnique({ where: { id: user_id }, select: { email: true, name: true, phoneNumber: true, phone_prefix: true } });
            void notifyBookingCreated({
                companyId: company_id,
                bookingId: booking.id,
                staffId: staff_id,
                customerEmail: user?.email,
                customerPhone: user?.phoneNumber,
                customerPhonePrefix: user?.phone_prefix,
                customerName: user?.name,
                companyName: company.name,
                staffName: staff.display_name,
                serviceNames: services.map(s => s.name),
                startAt,
                endAt,
                totalPriceCents: totalPrice,
            });
        }

        const resolvedSource = booking_source ?? BookingSource.SALON_SITE;
        void MarketplaceAnalyticsService.trackBookingStarted({
            source: toAnalyticsSource(resolvedSource),
            booking_source: resolvedSource,
            company_id,
            booking_id: booking?.id ?? null,
            service_ids: service_ids,
            staff_id,
            start_at: startAt.toISOString(),
            date: start_at.slice(0, 10),
            time: start_at.slice(11, 16),
            total_price_cents: totalPrice,
        });

        return {
            code: 201,
            message: 'Booking created successfully',
            error: false,
            data: booking,
        };
    } catch (error: any) {
        console.error('Error creating booking:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

// ============================================
// GET AVAILABLE DATES
// ============================================

interface GetAvailableDatesParams {
    companyId: number;
    startDate: Date;
    numberOfDays: number;
}

interface DateWindow {
    open_time: string;
    close_time: string;
}

interface AvailableDate {
    date: string;
    day_of_week: number;
    is_open: boolean;
    windows: DateWindow[];
}

interface GetAvailableDatesResult extends MensajeApi {
    data?: {
        dates: AvailableDate[];
        timezone: string;
    };
}

/**
 * Get available booking dates with hours information
 */
export async function getAvailableDates(params: GetAvailableDatesParams): Promise<GetAvailableDatesResult> {
    const { companyId, startDate, numberOfDays } = params;

    try {
        // 1. Validate company exists
        const company = await BookingRepo.getCompanyById(companyId);
        if (!company) {
            return {
                code: 404,
                message: 'Company not found',
                error: true,
            };
        }

        // 2. Get all company hours
        const allHours = await BookingRepo.getAllCompanyHours(companyId);

        // Group hours by day_of_week
        const hoursByDay = new Map<number, Array<{ open_time: string | null; close_time: string | null; is_closed: boolean }>>();
        for (const hour of allHours) {
            if (!hoursByDay.has(hour.day_of_week)) {
                hoursByDay.set(hour.day_of_week, []);
            }
            hoursByDay.get(hour.day_of_week)!.push(hour);
        }

        // 3. Generate dates
        const dates: AvailableDate[] = [];
        const currentDate = new Date(startDate);

        for (let i = 0; i < numberOfDays; i++) {
            const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday

            // Get hours for this day
            const dayHours = hoursByDay.get(dayOfWeek) || [];

            // Filter out closed slots and create windows
            const windows: DateWindow[] = [];
            let is_open = false;

            for (const hour of dayHours) {
                if (!hour.is_closed && hour.open_time && hour.close_time) {
                    windows.push({
                        open_time: hour.open_time,
                        close_time: hour.close_time,
                    });
                    is_open = true;
                }
            }

            // Sort windows by open_time
            windows.sort((a, b) => a.open_time.localeCompare(b.open_time));

            dates.push({
                date: dateStr,
                day_of_week: dayOfWeek,
                is_open,
                windows,
            });

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return {
            code: 200,
            message: 'Available dates retrieved successfully',
            error: false,
            data: {
                dates,
                timezone: company.timezone || 'UTC',
            },
        };
    } catch (error: any) {
        console.error('Error getting available dates:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

interface CreateCustomerBookingParams {
    company_id: number;
    staff_id: number;
    customer_id: number;
    created_by_user_id: string;
    service_ids: number[];
    start_at: string;
    payment_method: string;
    notes?: string | null;
    qr_proof_image_url?: string | null;
    client_name: string;
    client_email: string | null;
    client_phone_prefix: string;
    client_phone_number: string | null;
    booking_source?: BookingSource;
}

/**
 * Create a booking for an existing customer (no authentication required)
 */
export async function createCustomerBooking(params: CreateCustomerBookingParams): Promise<MensajeApi> {
    try {
        // Validate company exists
        const company = await prisma.company.findUnique({
            where: { id: params.company_id, is_active: true },
        });

        if (!company) {
            return {
                code: 404,
                message: 'Company not found or inactive',
                error: true,
            };
        }

        // Validate payment method is allowed
        const paymentError = await validatePaymentMethod(params.company_id, params.payment_method);
        if (paymentError) {
            return { code: 400, message: paymentError, error: true };
        }

        // Calculate end time and total price
        const services = await prisma.service.findMany({
            where: {
                id: { in: params.service_ids },
                company_id: params.company_id,
                is_active: true,
            },
        });

        if (services.length !== params.service_ids.length) {
            return {
                code: 400,
                message: 'One or more services are not available',
                error: true,
            };
        }

        const totalDuration = services.reduce((sum, service) => sum + service.duration_minutes, 0);
        const totalPrice = services.reduce((sum, service) => sum + service.price_cents, 0);
        const startAt = new Date(params.start_at);
        const endAt = new Date(params.start_at);
        endAt.setMinutes(endAt.getMinutes() + totalDuration);

        // Validate advance booking limits
        const advanceError = await validateAdvanceBookingLimits(params.company_id, startAt);
        if (advanceError) {
            return { code: 400, message: advanceError, error: true };
        }

        const staffAvailability = await isStaffAvailableForInterval({
            companyId: params.company_id,
            staffId: params.staff_id,
            startAt,
            endAt,
        });
        if (!staffAvailability.available) {
            return {
                code: 400,
                message: staffAvailability.message || 'Staff is not available at the selected time',
                error: true,
            };
        }

        // Create the booking with customer
        const booking = await prisma.booking.create({
            data: {
                company_id: params.company_id,
                staff_id: params.staff_id,
                customer_id: params.customer_id,
                client_name: params.client_name,
                client_email: params.client_email,
                client_phone_prefix: params.client_phone_prefix,
                client_phone_number: params.client_phone_number,
                booking_type: 'CUSTOMER',
                start_at: startAt,
                end_at: endAt,
                status: 'CONFIRMED',
                payment_method: params.payment_method as any,
                payment_status: resolveBookingPaymentStatus(params.payment_method),
                qr_proof_image_url: params.qr_proof_image_url,
                total_price_cents: totalPrice,
                notes: params.notes,
                created_by_user_id: params.created_by_user_id,
                booking_source: params.booking_source ?? BookingSource.SALON_SITE,
            },
        });

        // Create booking services
        const bookingServices = params.service_ids.map((serviceId: number, index: number) => ({
            booking_id: booking.id,
            company_id: params.company_id,
            service_id: serviceId,
            service_name_snapshot: services.find(s => s.id === serviceId)?.name || '',
            price_cents_snapshot: services.find(s => s.id === serviceId)?.price_cents || 0,
            duration_minutes_snapshot: services.find(s => s.id === serviceId)?.duration_minutes || 0,
            position: index,
        }));

        await prisma.bookingService.createMany({
            data: bookingServices,
        });

        // Send notification (fire-and-forget) only when included in plan
        const canSendTransactionalNotifications = await isFeatureEnabledForCompany(
            params.company_id,
            'TRANSACTIONAL_BOOKING_NOTIFICATIONS',
        );
        if (canSendTransactionalNotifications) {
            const staffProfile = await prisma.staffProfile.findFirst({ where: { id: params.staff_id, company_id: params.company_id }, select: { display_name: true } });
            void notifyBookingCreated({
                companyId: params.company_id,
                bookingId: booking.id,
                staffId: params.staff_id,
                customerEmail: params.client_email,
                customerPhone: params.client_phone_number,
                customerPhonePrefix: params.client_phone_prefix,
                customerName: params.client_name,
                companyName: company.name,
                staffName: staffProfile?.display_name || '',
                serviceNames: services.map(s => s.name),
                startAt: booking.start_at,
                endAt: endAt,
                totalPriceCents: totalPrice,
            });
        }

        const resolvedSource = params.booking_source ?? BookingSource.SALON_SITE;
        void MarketplaceAnalyticsService.trackBookingConfirmed({
            source: toAnalyticsSource(resolvedSource),
            booking_source: resolvedSource,
            company_id: params.company_id,
            booking_id: booking.id,
            service_ids: params.service_ids,
            staff_id: params.staff_id,
            start_at: startAt.toISOString(),
            date: params.start_at.slice(0, 10),
            time: params.start_at.slice(11, 16),
            total_price_cents: totalPrice,
        });

        return {
            code: 201,
            message: 'Booking created successfully',
            error: false,
            data: {
                booking_id: booking.id,
                start_at: booking.start_at,
                end_at: booking.end_at,
                total_price_cents: booking.total_price_cents,
                status: booking.status,
                payment_status: booking.payment_status,
                customer_info: {
                    name: params.client_name,
                    email: params.client_email,
                    phone: `${params.client_phone_prefix}${params.client_phone_number}`,
                },
            },
        };
    } catch (error: any) {
        console.error('Error creating customer booking:', error);

        // Handle specific errors
        if (error.code === 'P2002') {
            return {
                code: 409,
                message: 'Time slot is already booked',
                error: true,
            };
        }

        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

interface CreatePublicBookingParams {
    company_id: number;
    staff_id: number;
    secondary_staff_id?: number | null;
    service_ids: number[];
    start_at: string;
    payment_method: string;
    notes?: string | null;
    client_name?: string | null;
    client_email?: string | null;
    client_phone_prefix: string;
    client_phone_number?: string | null;
    qr_proof_image_url?: string | null;
    booking_source?: BookingSource;
}

/**
 * Create a booking as a guest/customer (no authentication required)
 */
export async function createPublicBooking(params: CreatePublicBookingParams): Promise<MensajeApi> {
    try {
        // Validate company exists
        const company = await prisma.company.findUnique({
            where: { id: params.company_id, is_active: true },
        });

        if (!company) {
            return {
                code: 404,
                message: 'Company not found or inactive',
                error: true,
            };
        }

        // Validate payment method is allowed
        const paymentError = await validatePaymentMethod(params.company_id, params.payment_method);
        if (paymentError) {
            return { code: 400, message: paymentError, error: true };
        }

        // Calculate end time and total price
        const services = await prisma.service.findMany({
            where: {
                id: { in: params.service_ids },
                company_id: params.company_id,
                is_active: true,
            },
        });

        if (services.length !== params.service_ids.length) {
            return {
                code: 400,
                message: 'One or more services are not available',
                error: true,
            };
        }

        const totalDuration = services.reduce((sum, service) => sum + service.duration_minutes, 0);
        const totalPrice = services.reduce((sum, service) => sum + service.price_cents, 0);
        const startAt = new Date(params.start_at);
        const endAt = new Date(params.start_at);
        endAt.setMinutes(endAt.getMinutes() + totalDuration);

        // Validate advance booking limits
        const advanceError = await validateAdvanceBookingLimits(params.company_id, startAt);
        if (advanceError) {
            return { code: 400, message: advanceError, error: true };
        }

        const staffAvailability = await isStaffAvailableForInterval({
            companyId: params.company_id,
            staffId: params.staff_id,
            startAt,
            endAt,
        });
        if (!staffAvailability.available) {
            return {
                code: 400,
                message: staffAvailability.message || 'Staff is not available at the selected time',
                error: true,
            };
        }

        // Check secondary resource conflict (room/equipment)
        if (params.secondary_staff_id) {
            const settings = await BookingRepo.getCompanySettings(params.company_id);
            const bufferMinutes = settings?.booking_buffer_minutes ?? 10;
            const secondaryConflict = await BookingRepo.checkSlotConflict(
                params.company_id,
                params.secondary_staff_id,
                startAt,
                endAt,
                bufferMinutes
            );
            if (secondaryConflict) {
                return {
                    code: 409,
                    message: 'The required room or equipment is no longer available at this time',
                    error: true,
                };
            }
        }

        // Create the booking without customer profile (guest booking)
        const booking = await prisma.booking.create({
            data: {
                company_id: params.company_id,
                staff_id: params.staff_id,
                secondary_staff_id: params.secondary_staff_id ?? null,
                customer_id: null, // No customer profile for guest bookings
                client_name: params.client_name,
                client_email: params.client_email,
                client_phone_prefix: params.client_phone_prefix,
                client_phone_number: params.client_phone_number,
                booking_type: 'CUSTOMER',
                start_at: startAt,
                end_at: endAt,
                status: 'CONFIRMED',
                payment_method: params.payment_method as any,
                payment_status: resolveBookingPaymentStatus(params.payment_method),
                qr_proof_image_url: params.qr_proof_image_url,
                total_price_cents: totalPrice,
                notes: params.notes,
                created_by_user_id: undefined, // No user for guest bookings
                booking_source: params.booking_source ?? BookingSource.SALON_SITE,
            },
        });

        // Create booking services
        const bookingServices = params.service_ids.map((serviceId: number, index: number) => ({
            booking_id: booking.id,
            company_id: params.company_id,
            service_id: serviceId,
            service_name_snapshot: services.find(s => s.id === serviceId)?.name || '',
            price_cents_snapshot: services.find(s => s.id === serviceId)?.price_cents || 0,
            duration_minutes_snapshot: services.find(s => s.id === serviceId)?.duration_minutes || 0,
            position: index,
        }));

        await prisma.bookingService.createMany({
            data: bookingServices,
        });

        // Send notification if contact info available (fire-and-forget) and included in plan
        const canSendTransactionalNotifications = await isFeatureEnabledForCompany(
            params.company_id,
            'TRANSACTIONAL_BOOKING_NOTIFICATIONS',
        );
        if (canSendTransactionalNotifications && (params.client_email || params.client_phone_number)) {
            const staffProfile = await prisma.staffProfile.findFirst({ where: { id: params.staff_id, company_id: params.company_id }, select: { display_name: true } });
            void notifyBookingCreated({
                companyId: params.company_id,
                bookingId: booking.id,
                staffId: params.staff_id,
                customerEmail: params.client_email,
                customerPhone: params.client_phone_number,
                customerPhonePrefix: params.client_phone_prefix,
                customerName: params.client_name,
                companyName: company.name,
                staffName: staffProfile?.display_name || '',
                serviceNames: services.map(s => s.name),
                startAt: booking.start_at,
                endAt: endAt,
                totalPriceCents: totalPrice,
            });
        }

        const resolvedSource = params.booking_source ?? BookingSource.SALON_SITE;
        void MarketplaceAnalyticsService.trackBookingConfirmed({
            source: toAnalyticsSource(resolvedSource),
            booking_source: resolvedSource,
            company_id: params.company_id,
            booking_id: booking.id,
            service_ids: params.service_ids,
            staff_id: params.staff_id,
            start_at: startAt.toISOString(),
            date: params.start_at.slice(0, 10),
            time: params.start_at.slice(11, 16),
            total_price_cents: totalPrice,
        });

        return {
            code: 201,
            message: 'Booking created successfully',
            error: false,
            data: {
                booking_id: booking.id,
                start_at: booking.start_at,
                end_at: booking.end_at,
                total_price_cents: booking.total_price_cents,
                status: booking.status,
                payment_status: booking.payment_status,
            },
        };
    } catch (error: any) {
        console.error('Error creating public booking:', error);

        // Handle specific errors
        if (error.code === 'P2002') {
            return {
                code: 409,
                message: 'Time slot is already booked',
                error: true,
            };
        }

        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
