import { MensajeApi } from '../types/MensajeApi';
import * as BookingRepo from '../repositories/booking.repo';
import { prisma } from '../prisma/client';
import { notifyBookingCreated, notifyBookingPendingForManagement } from '../utils/bookingNotifications';
import { BookingSource, BookingStatus, PaymentStatus } from '@prisma/client';
import * as MarketplaceAnalyticsService from './marketplace-analytics.service';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';
import { parseDateTimeInTimeZone } from '../utils/timezone';

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

function getSlotSearchDurationMinutes(services: Array<{
    duration_minutes: number;
    is_multi_session: boolean;
    session_duration_minutes: number | null;
}>): number {
    // Multi-session services are booked one session at a time in checkout,
    // so slot search must use the per-session duration for that flow.
    if (services.length === 1 && services[0]?.is_multi_session) {
        return services[0].session_duration_minutes || services[0].duration_minutes;
    }

    return services.reduce((sum, service) => sum + service.duration_minutes, 0);
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
        return 'El pago en efectivo no está habilitado para este negocio.';
    }
    if (paymentMethod === 'QR' && !settings.allow_qr_payment) {
        return 'El pago por QR no está habilitado para este negocio.';
    }
    return null;
}

async function resolveBookingFlowSettings(companyId: number): Promise<{
    requireComprobante: boolean;
    autoConfirm: boolean;
}> {
    const [settings, canCustomizeFlow] = await Promise.all([
        prisma.companySettings.findUnique({
            where: { company_id: companyId },
            select: { require_comprobante_for_qr: true, auto_confirm_bookings: true },
        }),
        isFeatureEnabledForCompany(companyId, 'BOOKING_FLOW_CUSTOMIZATION'),
    ]);

    return {
        requireComprobante: canCustomizeFlow ? (settings?.require_comprobante_for_qr ?? true) : true,
        autoConfirm: canCustomizeFlow ? (settings?.auto_confirm_bookings ?? true) : true,
    };
}

/**
 * Validate that the booking time respects advance booking limits.
 * Returns an error message if outside allowed window, or null if OK.
 */
async function validateAdvanceBookingLimits(
    companyId: number,
    startAt: Date,
    options?: { ignoreMaxAdvanceDays?: boolean },
): Promise<string | null> {
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
            return `La reserva debe hacerse con al menos ${settings.min_advance_booking_minutes} minuto(s) de anticipación.`;
        }
    }

    if (!options?.ignoreMaxAdvanceDays && settings.max_advance_booking_days != null) {
        const maxMs = settings.max_advance_booking_days * 24 * 60 * 60 * 1000;
        if (diffMs > maxMs) {
            return `La reserva no puede hacerse con más de ${settings.max_advance_booking_days} día(s) de anticipación.`;
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
        return { available: false, message: 'No encontramos el personal o ya no acepta reservas.' };
    }
    const staff = staffList[0];

    const requestDate = normalizeDateOnly(startAt);
    if (staff.start_date && requestDate < normalizeDateOnly(new Date(staff.start_date))) {
        return { available: false, message: 'El personal todavía no está activo para esa fecha.' };
    }
    if (staff.end_date && requestDate > normalizeDateOnly(new Date(staff.end_date))) {
        return { available: false, message: 'El personal no está disponible para esa fecha.' };
    }

    const dayOfWeek = requestDate.getDay();
    const companyHours = await BookingRepo.getCompanyHourWindowsForDay(companyId, dayOfWeek);
    const companyWindows = companyHours
        .filter((window) => !window.is_closed && window.open_time && window.close_time)
        .map((window) => ({ start_time: window.open_time as string, end_time: window.close_time as string }));
    if (companyWindows.length === 0) {
        return { available: false, message: 'El negocio está cerrado ese día.' };
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
            return { available: false, message: 'El personal no trabaja en ese día u horario.' };
        }
    }

    if (timeOff.length > 0) {
        return { available: false, message: 'El personal tiene una ausencia en ese horario.' };
    }

    if (groupCommitments.length > 0) {
        return { available: false, message: 'El personal ya está asignado a un evento o clase grupal en ese horario.' };
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
                message: 'No encontramos el negocio.',
                error: true,
            };
        }

        // 2. Get services and calculate total duration
        const services = await BookingRepo.getServicesByIds(service_ids, company_id);
        if (services.length === 0) {
            return {
                code: 400,
                message: 'No encontramos servicios válidos.',
                error: true,
            };
        }

        const totalDuration = getSlotSearchDurationMinutes(services);

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
                message: 'El negocio está cerrado ese día.',
                error: false,
                data: [],
            };
        }

        // 6. Get bookable staff
        const staffList = await BookingRepo.getBookableStaff(company_id, staff_id, service_ids);
        if (staffList.length === 0) {
            return {
                code: 400,
                message: staff_id
                    ? 'No encontramos el personal seleccionado o ya no acepta reservas.'
                    : 'No hay personal disponible para reservar.',
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
                message: 'No hay personal disponible para la fecha seleccionada.',
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
            message: 'Horarios disponibles obtenidos correctamente.',
            error: false,
            data: slots,
        };
    } catch (error: any) {
        console.error('Error getting available slots:', error);
        return {
            code: 500,
            message: 'No pudimos obtener los horarios disponibles.',
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
        const bookingFlowSettings = await resolveBookingFlowSettings(company_id);

        // 1.7 Validate comprobante if required for QR
        if (payment_method === 'QR' && bookingFlowSettings.requireComprobante && !qr_proof_image_url) {
            return { code: 400, message: 'Comprobante is required for QR payment bookings', error: true };
        }

        // 2. Validate staff belongs to company and is bookable
        const staffList = await BookingRepo.getBookableStaff(company_id, staff_id, service_ids);
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

        const startAt = parseDateTimeInTimeZone(start_at, company.timezone);
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
        const bookingStatus = bookingFlowSettings.autoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING;

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
        if (canSendTransactionalNotifications && company && booking) {
            const user = await prisma.user.findUnique({ where: { id: user_id }, select: { email: true, name: true, phoneNumber: true, phone_prefix: true } });
            const notificationData = {
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
            };

            if (bookingFlowSettings.autoConfirm) {
                void notifyBookingCreated(notificationData);
            } else {
                void notifyBookingPendingForManagement(notificationData);
            }
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
    staff_id?: number;
    secondary_staff_id?: number | null;
    customer_id: number;
    created_by_user_id: string;
    service_ids?: number[];
    start_at?: string;
    payment_method: string;
    notes?: string | null;
    qr_proof_image_url?: string | null;
    client_name: string;
    client_email: string | null;
    client_phone_prefix: string;
    client_phone_number: string | null;
    booking_source?: BookingSource;
    booking_groups?: RequestedBookingGroupInput[];
}

type RequestedBookingGroupInput = {
    client_group_id?: string | null;
    staff_id?: number | null;
    secondary_staff_id?: number | null;
    service_ids: number[];
    start_at?: string | null;
    session_slots?: Array<{ start_at: string }>;
};

type CheckoutServiceDetail = {
    id: number;
    name: string;
    duration_minutes: number;
    price_cents: number;
    is_multi_session: boolean;
    session_count: number | null;
    session_duration_minutes: number | null;
    required_resources: Array<{
        staff_profile_id: number;
        staff_profile: {
            id: number;
            display_name: string;
            resource_type: string | null;
        } | null;
    }>;
};

type ResolvedCheckoutSlot = {
    startAt: Date;
    endAt: Date;
    sessionIndex: number | null;
    sessionCount: number | null;
    durationMinutes: number;
};

type ResolvedCheckoutGroup = {
    clientGroupId: string;
    staffId: number;
    secondaryStaffId: number | null;
    services: CheckoutServiceDetail[];
    slots: ResolvedCheckoutSlot[];
    totalPriceCents: number;
    isMultiSession: boolean;
};

type CreateCheckoutBookingsParams = {
    company: { id: number; name: string; timezone: string | null };
    customer_id: number | null;
    created_by_user_id?: string | null;
    payment_method: string;
    notes?: string | null;
    qr_proof_image_url?: string | null;
    booking_source?: BookingSource;
    client_name: string;
    client_email: string | null;
    client_phone_prefix: string;
    client_phone_number: string | null;
    requestedGroups: RequestedBookingGroupInput[];
};

type RequestedCheckoutOverlap = {
    current: {
        clientGroupId: string;
        sessionIndex: number | null;
        sessionCount: number | null;
        startAt: Date;
        endAt: Date;
    };
    existing: {
        clientGroupId: string;
        sessionIndex: number | null;
        sessionCount: number | null;
        startAt: Date;
        endAt: Date;
    };
};

function splitAmountAcrossSessions(totalCents: number, parts: number): number[] {
    if (parts <= 1) return [totalCents];
    const base = Math.floor(totalCents / parts);
    const remainder = totalCents - base * parts;
    return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function intervalsOverlap(
    startA: Date,
    endA: Date,
    startB: Date,
    endB: Date,
): boolean {
    return startA < endB && endA > startB;
}

function findRequestedCheckoutOverlap(
    groups: ResolvedCheckoutGroup[],
): RequestedCheckoutOverlap | null {
    const resolvedSlots: Array<{
        clientGroupId: string;
        sessionIndex: number | null;
        sessionCount: number | null;
        startAt: Date;
        endAt: Date;
    }> = [];

    for (const group of groups) {
        for (const slot of group.slots) {
            const existing = resolvedSlots.find((candidate) =>
                intervalsOverlap(
                    candidate.startAt,
                    candidate.endAt,
                    slot.startAt,
                    slot.endAt,
                ),
            );

            if (existing) {
                return {
                    current: {
                        clientGroupId: group.clientGroupId,
                        sessionIndex: slot.sessionIndex,
                        sessionCount: slot.sessionCount,
                        startAt: slot.startAt,
                        endAt: slot.endAt,
                    },
                    existing,
                };
            }

            resolvedSlots.push({
                clientGroupId: group.clientGroupId,
                sessionIndex: slot.sessionIndex,
                sessionCount: slot.sessionCount,
                startAt: slot.startAt,
                endAt: slot.endAt,
            });
        }
    }

    return null;
}

function resolveServiceAssignments(service: CheckoutServiceDetail): {
    primaryStaffId: number | null;
    secondaryStaffId: number | null;
} {
    let primaryStaffId: number | null = null;
    let secondaryStaffId: number | null = null;

    for (const resource of service.required_resources) {
        const resourceType = resource.staff_profile?.resource_type;
        if (
            primaryStaffId === null &&
            resourceType !== 'ROOM' &&
            resourceType !== 'EQUIPMENT'
        ) {
            primaryStaffId = resource.staff_profile_id;
            continue;
        }
        if (
            secondaryStaffId === null &&
            (resourceType === 'ROOM' || resourceType === 'EQUIPMENT')
        ) {
            secondaryStaffId = resource.staff_profile_id;
        }
    }

    return { primaryStaffId, secondaryStaffId };
}

async function loadCheckoutServices(
    companyId: number,
    serviceIds: number[],
): Promise<CheckoutServiceDetail[]> {
    if (serviceIds.length === 0) return [];

    return prisma.service.findMany({
        where: {
            id: { in: serviceIds },
            company_id: companyId,
            is_active: true,
            deleted_at: null,
        },
        select: {
            id: true,
            name: true,
            duration_minutes: true,
            price_cents: true,
            is_multi_session: true,
            session_count: true,
            session_duration_minutes: true,
            required_resources: {
                select: {
                    staff_profile_id: true,
                    staff_profile: {
                        select: {
                            id: true,
                            display_name: true,
                            resource_type: true,
                        },
                    },
                },
            },
        },
    });
}

function buildLegacyRequestedGroups(params: {
    services: CheckoutServiceDetail[];
    defaultStaffId?: number;
    defaultSecondaryStaffId?: number | null;
    defaultStartAt?: string;
}): RequestedBookingGroupInput[] {
    const groups = new Map<string, RequestedBookingGroupInput>();

    for (const service of params.services) {
        const assignment = resolveServiceAssignments(service);
        const staffId = assignment.primaryStaffId ?? params.defaultStaffId ?? null;
        const secondaryStaffId =
            assignment.secondaryStaffId ?? params.defaultSecondaryStaffId ?? null;
        const key = [
            staffId ?? 'sin-staff',
            secondaryStaffId ?? 'sin-recurso',
            service.is_multi_session ? `multi-${service.id}` : 'simple',
        ].join('|');

        const existing = groups.get(key);
        if (existing) {
            existing.service_ids.push(service.id);
            continue;
        }

        groups.set(key, {
            client_group_id: key,
            staff_id: staffId,
            secondary_staff_id: secondaryStaffId,
            service_ids: [service.id],
            start_at: params.defaultStartAt ?? null,
        });
    }

    return Array.from(groups.values());
}

async function resolveRequestedCheckoutGroups(params: {
    companyId: number;
    timezone: string | null;
    requestedGroups: RequestedBookingGroupInput[];
}): Promise<{ error: true; result: MensajeApi } | { error: false; groups: ResolvedCheckoutGroup[] }> {
    const uniqueServiceIds = Array.from(
        new Set(
            params.requestedGroups.flatMap((group) =>
                Array.isArray(group.service_ids) ? group.service_ids : [],
            ),
        ),
    );
    const services = await loadCheckoutServices(params.companyId, uniqueServiceIds);

    if (services.length !== uniqueServiceIds.length) {
        return {
            error: true,
            result: {
                code: 400,
                message: 'Uno o más servicios ya no están disponibles.',
                error: true,
            },
        };
    }

    const serviceById = new Map(services.map((service) => [service.id, service]));
    const groups: ResolvedCheckoutGroup[] = [];

    for (const [groupIndex, requestedGroup] of params.requestedGroups.entries()) {
        if (!Array.isArray(requestedGroup.service_ids) || requestedGroup.service_ids.length === 0) {
            return {
                error: true,
                result: {
                    code: 400,
                    message: 'Cada grupo debe incluir al menos un servicio.',
                    error: true,
                },
            };
        }

        const groupServices = requestedGroup.service_ids
            .map((serviceId) => serviceById.get(serviceId))
            .filter(Boolean) as CheckoutServiceDetail[];

        const multiSessionServices = groupServices.filter((service) => service.is_multi_session);
        if (multiSessionServices.length > 1 || (multiSessionServices.length === 1 && groupServices.length > 1)) {
            return {
                error: true,
                result: {
                    code: 400,
                    message: 'Cada servicio con múltiples sesiones debe reservarse en su propio grupo.',
                    error: true,
                },
            };
        }

        const primaryStaffIds = new Set<number>();
        const secondaryStaffIds = new Set<number>();
        for (const service of groupServices) {
            const assignment = resolveServiceAssignments(service);
            if (assignment.primaryStaffId) primaryStaffIds.add(assignment.primaryStaffId);
            if (assignment.secondaryStaffId) secondaryStaffIds.add(assignment.secondaryStaffId);
        }

        if (primaryStaffIds.size > 1 || secondaryStaffIds.size > 1) {
            return {
                error: true,
                result: {
                    code: 400,
                    message: 'Los servicios seleccionados requieren recursos distintos. Reservalos en grupos separados.',
                    error: true,
                },
            };
        }

        const requiredPrimaryStaffId = primaryStaffIds.values().next().value ?? null;
        const requiredSecondaryStaffId = secondaryStaffIds.values().next().value ?? null;
        const staffId = requiredPrimaryStaffId ?? requestedGroup.staff_id ?? null;
        const secondaryStaffId = requiredSecondaryStaffId ?? requestedGroup.secondary_staff_id ?? null;

        if (!staffId) {
            return {
                error: true,
                result: {
                    code: 400,
                    message: 'Cada grupo necesita un personal asignado.',
                    error: true,
                },
            };
        }

        const totalPriceCents = groupServices.reduce(
            (sum, service) => sum + service.price_cents,
            0,
        );

        if (multiSessionServices.length === 1) {
            const multiService = multiSessionServices[0];
            const sessionCount = multiService.session_count ?? 0;
            const sessionDurationMinutes = multiService.session_duration_minutes ?? 0;
            const sessionSlots = requestedGroup.session_slots ?? [];

            if (sessionCount <= 1 || sessionDurationMinutes <= 0) {
                return {
                    error: true,
                    result: {
                        code: 400,
                        message: 'La configuración del servicio con múltiples sesiones es inválida.',
                        error: true,
                    },
                };
            }

            if (sessionSlots.length !== sessionCount) {
                return {
                    error: true,
                    result: {
                        code: 400,
                        message: `Debés elegir fecha y hora para las ${sessionCount} sesiones.`,
                        error: true,
                    },
                };
            }

            groups.push({
                clientGroupId:
                    requestedGroup.client_group_id?.trim() || `grupo-${groupIndex + 1}`,
                staffId,
                secondaryStaffId,
                services: groupServices,
                totalPriceCents,
                isMultiSession: true,
                slots: sessionSlots.map((slot, sessionIndex) => {
                    const startAt = parseDateTimeInTimeZone(slot.start_at, params.timezone);
                    return {
                        startAt,
                        endAt: new Date(
                            startAt.getTime() + sessionDurationMinutes * 60 * 1000,
                        ),
                        sessionIndex: sessionIndex + 1,
                        sessionCount,
                        durationMinutes: sessionDurationMinutes,
                    };
                }),
            });
            continue;
        }

        if (!requestedGroup.start_at) {
            return {
                error: true,
                result: {
                    code: 400,
                    message: 'Cada grupo necesita una fecha y hora.',
                    error: true,
                },
            };
        }

        const totalDurationMinutes = groupServices.reduce(
            (sum, service) => sum + service.duration_minutes,
            0,
        );
        const startAt = parseDateTimeInTimeZone(requestedGroup.start_at, params.timezone);
        groups.push({
            clientGroupId:
                requestedGroup.client_group_id?.trim() || `grupo-${groupIndex + 1}`,
            staffId,
            secondaryStaffId,
            services: groupServices,
            totalPriceCents,
            isMultiSession: false,
            slots: [
                {
                    startAt,
                    endAt: new Date(startAt.getTime() + totalDurationMinutes * 60 * 1000),
                    sessionIndex: null,
                    sessionCount: null,
                    durationMinutes: totalDurationMinutes,
                },
            ],
        });
    }

    return { error: false, groups };
}

function buildNotificationLine(params: {
    timezone: string | null;
    services: CheckoutServiceDetail[];
    slot: ResolvedCheckoutSlot;
}): string {
    const timezone = params.timezone || 'America/La_Paz';
    const dateLabel = params.slot.startAt.toLocaleDateString('es-BO', {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const startLabel = params.slot.startAt.toLocaleTimeString('es-BO', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const endLabel = params.slot.endAt.toLocaleTimeString('es-BO', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const sessionLabel =
        params.slot.sessionIndex && params.slot.sessionCount
            ? `Sesión ${params.slot.sessionIndex}/${params.slot.sessionCount}: `
            : '';
    return `${sessionLabel}${params.services.map((service) => service.name).join(' + ')} · ${dateLabel} ${startLabel}-${endLabel}`;
}

async function createCheckoutBookings(params: CreateCheckoutBookingsParams): Promise<MensajeApi> {
    const bookingFlowSettings = await resolveBookingFlowSettings(params.company.id);
    if (
        params.payment_method === 'QR' &&
        bookingFlowSettings.requireComprobante &&
        !params.qr_proof_image_url
    ) {
        return {
            code: 400,
            message: 'Debés subir el comprobante para pagar por QR.',
            error: true,
        };
    }

    const resolvedGroupsResult = await resolveRequestedCheckoutGroups({
        companyId: params.company.id,
        timezone: params.company.timezone,
        requestedGroups: params.requestedGroups,
    });
    if (resolvedGroupsResult.error) {
        return resolvedGroupsResult.result;
    }

    const resolvedGroups = resolvedGroupsResult.groups;
    const requestedOverlap = findRequestedCheckoutOverlap(resolvedGroups);
    if (requestedOverlap) {
        return {
            code: 409,
            message:
                'No podés reservar dos sesiones al mismo tiempo, aunque sean con distinto personal. Elegí horarios distintos para continuar.',
            error: true,
            data: {
                current_group_id: requestedOverlap.current.clientGroupId,
                current_session_index: requestedOverlap.current.sessionIndex,
                current_session_count: requestedOverlap.current.sessionCount,
                conflicting_group_id: requestedOverlap.existing.clientGroupId,
                conflicting_session_index: requestedOverlap.existing.sessionIndex,
                conflicting_session_count: requestedOverlap.existing.sessionCount,
            },
        };
    }

    const staffIds = Array.from(
        new Set(
            resolvedGroups.flatMap((group) => [
                group.staffId,
                ...(group.secondaryStaffId ? [group.secondaryStaffId] : []),
            ]),
        ),
    );
    const staffProfiles = await prisma.staffProfile.findMany({
        where: {
            company_id: params.company.id,
            id: { in: staffIds },
            deleted_at: null,
        },
        select: {
            id: true,
            display_name: true,
            is_bookable: true,
        },
    });
    const staffById = new Map(staffProfiles.map((staff) => [staff.id, staff]));
    const settings = await BookingRepo.getCompanySettings(params.company.id);
    const bufferMinutes = settings?.booking_buffer_minutes ?? 10;

    for (const group of resolvedGroups) {
        const primaryStaff = staffById.get(group.staffId);
        if (!primaryStaff || !primaryStaff.is_bookable) {
            return {
                code: 400,
                message: 'El personal seleccionado ya no está disponible para reservas.',
                error: true,
            };
        }

        const groupServiceIds = group.services.map((service) => service.id);
        const compatiblePrimaryStaff = await BookingRepo.getBookableStaff(
            params.company.id,
            group.staffId,
            groupServiceIds,
        );
        if (compatiblePrimaryStaff.length === 0) {
            return {
                code: 400,
                message: 'El personal seleccionado no ofrece todos los servicios elegidos.',
                error: true,
            };
        }

        if (group.secondaryStaffId) {
            const secondaryStaff = staffById.get(group.secondaryStaffId);
            if (!secondaryStaff) {
                return {
                    code: 400,
                    message: 'El recurso seleccionado ya no está disponible.',
                    error: true,
                };
            }
        }

        for (const slot of group.slots) {
            const advanceError = await validateAdvanceBookingLimits(
                params.company.id,
                slot.startAt,
                { ignoreMaxAdvanceDays: group.isMultiSession },
            );
            if (advanceError) {
                return { code: 400, message: advanceError, error: true };
            }

            const staffAvailability = await isStaffAvailableForInterval({
                companyId: params.company.id,
                staffId: group.staffId,
                startAt: slot.startAt,
                endAt: slot.endAt,
            });
            if (!staffAvailability.available) {
                return {
                    code: 400,
                    message:
                        staffAvailability.message ||
                        'El personal seleccionado no tiene disponibilidad en ese horario.',
                    error: true,
                };
            }

            const staffConflict = await BookingRepo.checkSlotConflict(
                params.company.id,
                group.staffId,
                slot.startAt,
                slot.endAt,
                bufferMinutes,
            );
            if (staffConflict) {
                return {
                    code: 409,
                    message: 'Ese horario ya no está disponible.',
                    error: true,
                };
            }

            if (group.secondaryStaffId) {
                const secondaryConflict = await BookingRepo.checkSlotConflict(
                    params.company.id,
                    group.secondaryStaffId,
                    slot.startAt,
                    slot.endAt,
                    bufferMinutes,
                );
                if (secondaryConflict) {
                    return {
                        code: 409,
                        message: 'El recurso requerido ya no está disponible en ese horario.',
                        error: true,
                    };
                }
            }

            const groupConflict = await BookingRepo.checkGroupSlotConflict(
                params.company.id,
                group.staffId,
                slot.startAt,
                slot.endAt,
                bufferMinutes,
            );
            if (groupConflict) {
                return {
                    code: 409,
                    message: 'Ese horario está bloqueado por una reserva grupal.',
                    error: true,
                };
            }

            if (params.customer_id) {
                const customerConflict = await BookingRepo.checkCustomerSlotConflict(
                    params.company.id,
                    params.customer_id,
                    slot.startAt,
                    slot.endAt,
                );
                if (customerConflict) {
                    return {
                        code: 409,
                        message:
                            'Ya tenés otra reserva en ese horario. Elegí un horario distinto para evitar que el cliente quede agendado dos veces al mismo tiempo.',
                        error: true,
                        data: {
                            conflicting_booking_id: customerConflict.id,
                            conflicting_start: customerConflict.start_at,
                            conflicting_end: customerConflict.end_at,
                        },
                    };
                }
            }
        }
    }

    const bookingStatus = bookingFlowSettings.autoConfirm
        ? BookingStatus.CONFIRMED
        : BookingStatus.PENDING;
    const totalPriceCents = resolvedGroups.reduce(
        (sum, group) => sum + group.totalPriceCents,
        0,
    );
    const totalBookingCount = resolvedGroups.reduce(
        (sum, group) => sum + group.slots.length,
        0,
    );

    const created = await prisma.$transaction(async (tx) => {
        const bookingGroup =
            totalBookingCount > 1 || resolvedGroups.some((group) => group.isMultiSession)
                ? await tx.bookingGroup.create({
                    data: {
                        company_id: params.company.id,
                        customer_id: params.customer_id,
                        group_type:
                            resolvedGroups.length > 1
                                ? 'MULTI_STAFF_CHECKOUT'
                                : resolvedGroups.some((group) => group.isMultiSession)
                                    ? 'MULTI_SESSION_SERVICE'
                                    : 'STANDARD',
                        metadata: {
                            clientGroupIds: resolvedGroups.map((group) => group.clientGroupId),
                        },
                    },
                })
                : null;

        const createdBookings: Array<{
            id: number;
            staff_id: number;
            secondary_staff_id: number | null;
            start_at: Date;
            end_at: Date;
            total_price_cents: number;
            session_index: number | null;
            session_count: number | null;
            services: CheckoutServiceDetail[];
        }> = [];

        for (const group of resolvedGroups) {
            const perBookingTotals = group.isMultiSession
                ? splitAmountAcrossSessions(group.totalPriceCents, group.slots.length)
                : [group.totalPriceCents];

            for (const [slotIndex, slot] of group.slots.entries()) {
                const booking = await tx.booking.create({
                    data: {
                        company_id: params.company.id,
                        booking_group_id: bookingGroup?.id ?? null,
                        staff_id: group.staffId,
                        secondary_staff_id: group.secondaryStaffId,
                        customer_id: params.customer_id,
                        client_name: params.client_name,
                        client_email: params.client_email,
                        client_phone_prefix: params.client_phone_prefix,
                        client_phone_number: params.client_phone_number,
                        booking_type: 'CUSTOMER',
                        start_at: slot.startAt,
                        end_at: slot.endAt,
                        status: bookingStatus,
                        payment_method: params.payment_method as any,
                        payment_status:
                            params.payment_method === 'NONE'
                                ? PaymentStatus.UNPAID
                                : PaymentStatus.PENDING_CONFIRMATION,
                        qr_proof_image_url: params.qr_proof_image_url,
                        total_price_cents: perBookingTotals[slotIndex] ?? group.totalPriceCents,
                        notes: params.notes,
                        created_by_user_id: params.created_by_user_id ?? undefined,
                        booking_source: params.booking_source ?? BookingSource.SALON_SITE,
                        session_index: slot.sessionIndex,
                        session_count: slot.sessionCount,
                    },
                });

                await tx.bookingService.createMany({
                    data: group.services.map((service, serviceIndex) => ({
                        booking_id: booking.id,
                        company_id: params.company.id,
                        service_id: service.id,
                        service_name_snapshot: service.name,
                        price_cents_snapshot:
                            group.isMultiSession
                                ? perBookingTotals[slotIndex] ?? service.price_cents
                                : service.price_cents,
                        duration_minutes_snapshot:
                            group.isMultiSession
                                ? slot.durationMinutes
                                : service.duration_minutes,
                        position: serviceIndex,
                    })),
                });

                createdBookings.push({
                    id: booking.id,
                    staff_id: booking.staff_id,
                    secondary_staff_id: booking.secondary_staff_id,
                    start_at: booking.start_at,
                    end_at: booking.end_at,
                    total_price_cents: booking.total_price_cents,
                    session_index: booking.session_index,
                    session_count: booking.session_count,
                    services: group.services,
                });
            }
        }

        return {
            bookingGroupId: bookingGroup?.id ?? null,
            bookings: createdBookings,
        };
    });

    const canSendTransactionalNotifications = await isFeatureEnabledForCompany(
        params.company.id,
        'TRANSACTIONAL_BOOKING_NOTIFICATIONS',
    );
    if (canSendTransactionalNotifications && created.bookings.length > 0) {
        const primaryBooking = created.bookings[0];
        const uniqueStaffNames = Array.from(
            new Set(
                created.bookings
                    .map((booking) => staffById.get(booking.staff_id)?.display_name)
                    .filter(Boolean),
            ),
        );
        const notificationData = {
            companyId: params.company.id,
            bookingId: primaryBooking.id,
            staffId: primaryBooking.staff_id,
            customerEmail: params.client_email,
            customerPhone: params.client_phone_number,
            customerPhonePrefix: params.client_phone_prefix,
            customerName: params.client_name,
            companyName: params.company.name,
            staffName:
                uniqueStaffNames.length === 1
                    ? (uniqueStaffNames[0] as string)
                    : 'Múltiples profesionales',
            serviceNames: created.bookings.map((booking) =>
                buildNotificationLine({
                    timezone: params.company.timezone,
                    services: booking.services,
                    slot: {
                        startAt: booking.start_at,
                        endAt: booking.end_at,
                        sessionIndex: booking.session_index,
                        sessionCount: booking.session_count,
                        durationMinutes: Math.round(
                            (booking.end_at.getTime() - booking.start_at.getTime()) / 60000,
                        ),
                    },
                }),
            ),
            startAt: primaryBooking.start_at,
            endAt:
                created.bookings[created.bookings.length - 1]?.end_at ??
                primaryBooking.end_at,
            totalPriceCents,
            timeZone: params.company.timezone,
        };

        if (bookingFlowSettings.autoConfirm) {
            void notifyBookingCreated(notificationData);
        } else {
            void notifyBookingPendingForManagement(notificationData);
        }
    }

    const resolvedSource = params.booking_source ?? BookingSource.SALON_SITE;
    const firstBooking = created.bookings[0];
    void (bookingFlowSettings.autoConfirm
        ? MarketplaceAnalyticsService.trackBookingConfirmed
        : MarketplaceAnalyticsService.trackBookingStarted)({
        source: toAnalyticsSource(resolvedSource),
        booking_source: resolvedSource,
        company_id: params.company.id,
        booking_id: firstBooking?.id ?? null,
        service_ids: resolvedGroups.flatMap((group) =>
            group.services.map((service) => service.id),
        ),
        staff_id: firstBooking?.staff_id ?? null,
        start_at: firstBooking?.start_at.toISOString() ?? new Date().toISOString(),
        date: firstBooking?.start_at.toISOString().slice(0, 10) ?? '',
        time: firstBooking?.start_at.toISOString().slice(11, 16) ?? '',
        total_price_cents: totalPriceCents,
    });

    return {
        code: 201,
        message: 'Reserva creada correctamente.',
        error: false,
        data: {
            booking_group_id: created.bookingGroupId,
            booking_ids: created.bookings.map((booking) => booking.id),
            booking_count: created.bookings.length,
            total_price_cents: totalPriceCents,
            status: bookingStatus,
            payment_status:
                params.payment_method === 'NONE'
                    ? PaymentStatus.UNPAID
                    : PaymentStatus.PENDING_CONFIRMATION,
            bookings: created.bookings.map((booking) => ({
                booking_id: booking.id,
                staff_id: booking.staff_id,
                secondary_staff_id: booking.secondary_staff_id,
                start_at: booking.start_at,
                end_at: booking.end_at,
                total_price_cents: booking.total_price_cents,
                session_index: booking.session_index,
                session_count: booking.session_count,
                services: booking.services.map((service) => ({
                    id: service.id,
                    name: service.name,
                })),
            })),
        },
    };
}

/**
 * Create a booking for an existing customer (no authentication required)
 */
export async function createCustomerBooking(params: CreateCustomerBookingParams): Promise<MensajeApi> {
    try {
        const company = await prisma.company.findUnique({
            where: { id: params.company_id, is_active: true },
            select: {
                id: true,
                name: true,
                timezone: true,
            },
        });

        if (!company) {
            return {
                code: 404,
                message: 'No encontramos el negocio o ya no está activo.',
                error: true,
            };
        }

        const paymentError = await validatePaymentMethod(params.company_id, params.payment_method);
        if (paymentError) {
            return { code: 400, message: paymentError, error: true };
        }
        const requestedGroups =
            params.booking_groups && params.booking_groups.length > 0
                ? params.booking_groups
                : buildLegacyRequestedGroups({
                    services: await loadCheckoutServices(
                        params.company_id,
                        params.service_ids ?? [],
                    ),
                    defaultStaffId: params.staff_id,
                    defaultSecondaryStaffId: params.secondary_staff_id ?? null,
                    defaultStartAt: params.start_at,
                });

        return createCheckoutBookings({
            company,
            customer_id: params.customer_id,
            created_by_user_id: params.created_by_user_id,
            payment_method: params.payment_method,
            notes: params.notes,
            qr_proof_image_url: params.qr_proof_image_url,
            booking_source: params.booking_source,
            client_name: params.client_name,
            client_email: params.client_email,
            client_phone_prefix: params.client_phone_prefix,
            client_phone_number: params.client_phone_number,
            requestedGroups,
        });
    } catch (error: any) {
        console.error('Error creating customer booking:', error);

        if (error.code === 'P2002') {
            return {
                code: 409,
                message: 'Ese horario ya fue reservado.',
                error: true,
            };
        }

        return {
            code: 500,
            message: 'No pudimos crear la reserva.',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

interface CreatePublicBookingParams {
    company_id: number;
    staff_id?: number;
    secondary_staff_id?: number | null;
    service_ids?: number[];
    start_at?: string;
    payment_method: string;
    notes?: string | null;
    client_name?: string | null;
    client_email?: string | null;
    client_phone_prefix: string;
    client_phone_number?: string | null;
    qr_proof_image_url?: string | null;
    booking_source?: BookingSource;
    booking_groups?: RequestedBookingGroupInput[];
}

/**
 * Create a booking as a guest/customer (no authentication required)
 */
export async function createPublicBooking(params: CreatePublicBookingParams): Promise<MensajeApi> {
    try {
        const company = await prisma.company.findUnique({
            where: { id: params.company_id, is_active: true },
            select: {
                id: true,
                name: true,
                timezone: true,
            },
        });

        if (!company) {
            return {
                code: 404,
                message: 'No encontramos el negocio o ya no está activo.',
                error: true,
            };
        }

        const paymentError = await validatePaymentMethod(params.company_id, params.payment_method);
        if (paymentError) {
            return { code: 400, message: paymentError, error: true };
        }
        const requestedGroups =
            params.booking_groups && params.booking_groups.length > 0
                ? params.booking_groups
                : buildLegacyRequestedGroups({
                    services: await loadCheckoutServices(
                        params.company_id,
                        params.service_ids ?? [],
                    ),
                    defaultStaffId: params.staff_id,
                    defaultSecondaryStaffId: params.secondary_staff_id ?? null,
                    defaultStartAt: params.start_at,
                });

        return createCheckoutBookings({
            company,
            customer_id: null,
            created_by_user_id: null,
            payment_method: params.payment_method,
            notes: params.notes,
            qr_proof_image_url: params.qr_proof_image_url,
            booking_source: params.booking_source,
            client_name: params.client_name ?? 'Cliente',
            client_email: params.client_email ?? null,
            client_phone_prefix: params.client_phone_prefix,
            client_phone_number: params.client_phone_number ?? null,
            requestedGroups,
        });
    } catch (error: any) {
        console.error('Error creating public booking:', error);

        if (error.code === 'P2002') {
            return {
                code: 409,
                message: 'Ese horario ya fue reservado.',
                error: true,
            };
        }

        return {
            code: 500,
            message: 'No pudimos crear la reserva.',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
