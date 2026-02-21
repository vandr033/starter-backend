import { MensajeApi } from '../types/MensajeApi';
import * as BookingRepo from '../repositories/booking.repo';
import { prisma } from '../prisma/client';

interface GetSlotsParams {
    company_id: number;
    staff_id?: number;
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

/**
 * Get available booking slots for a date
 */
export async function getAvailableSlots(params: GetSlotsParams): Promise<GetSlotsResult> {
    const { company_id, staff_id, service_ids, date } = params;

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

        // 5. Get company hours for that day
        const hours = await BookingRepo.getCompanyHoursForDay(company_id, dayOfWeek);
        if (!hours || hours.is_closed || !hours.open_time || !hours.close_time) {
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

        const staffIds = staffList.map(s => s.id);

        // 7. Get existing bookings for the date
        const dateStart = new Date(date + 'T00:00:00');
        const dateEnd = new Date(date + 'T23:59:59.999');

        const existingBookings = await BookingRepo.getBookingsForDateRange(
            company_id,
            staffIds,
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

        // 8. Generate time slots
        const openMinutes = timeToMinutes(hours.open_time);
        const closeMinutes = timeToMinutes(hours.close_time);

        // Determine current time in company timezone to filter past slots
        const companyTimezone = company.timezone || 'America/La_Paz';
        const nowInCompanyTz = new Date(new Date().toLocaleString('en-US', { timeZone: companyTimezone }));
        const todayStr = nowInCompanyTz.toISOString().split('T')[0];
        const isToday = date === todayStr;
        const currentMinutes = isToday
            ? nowInCompanyTz.getHours() * 60 + nowInCompanyTz.getMinutes()
            : -1; // -1 means don't filter

        const slots: TimeSlot[] = [];

        // Generate slots at granularity intervals
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

            // Check availability for each staff member
            for (const staff of staffList) {
                const staffBookings = bookingsByStaff.get(staff.id) || [];
                const isAvailable = !hasConflict(slotStart, slotEnd, staffBookings, bufferMinutes);

                if (isAvailable) {
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
    service_ids: number[];
    start_at: string; // ISO datetime string
    payment_method: 'NONE' | 'CASH' | 'QR';
    notes?: string;
    user_id: string; // From authenticated session
}

interface CreateBookingResult extends MensajeApi {
    data?: any;
}

/**
 * Create a new customer booking
 */
export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
    const { company_id, staff_id, service_ids, start_at, payment_method, notes, user_id } = params;

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

        // 5. Get company settings for buffer
        const settings = await BookingRepo.getCompanySettings(company_id);
        const bufferMinutes = settings?.booking_buffer_minutes ?? 10;

        // 6. Re-validate slot availability (prevent race conditions)
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

        // 7. Get or create CustomerProfile
        const customerProfile = await BookingRepo.getOrCreateCustomerProfile(company_id, user_id);

        // 8. Prepare service snapshots
        const serviceSnapshots = services.map((s, index) => ({
            service_id: s.id,
            service_name_snapshot: s.name,
            price_cents_snapshot: s.price_cents,
            duration_minutes_snapshot: s.duration_minutes,
            position: index,
        }));

        // 9. Create booking with services in transaction
        const booking = await BookingRepo.createBookingWithServices(
            {
                company_id,
                staff_id,
                customer_id: customerProfile.id,
                start_at: startAt,
                end_at: endAt,
                payment_method,
                notes,
                created_by_user_id: user_id,
                total_price_cents: totalPrice,
            },
            serviceSnapshots
        );

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
    service_ids: number[];
    start_at: string;
    payment_method: string;
    notes?: string | null;
    qr_proof_image_url?: string | null;
    client_name: string;
    client_email: string | null;
    client_phone_prefix: string;
    client_phone_number: string | null;
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
        const endAt = new Date(params.start_at);
        endAt.setMinutes(endAt.getMinutes() + totalDuration);

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
                start_at: new Date(params.start_at),
                end_at: endAt,
                status: 'CONFIRMED',
                payment_method: params.payment_method as any,
                payment_status: params.payment_method === 'NONE' ? ('UNPAID' as any) : ('PENDING_CONFIRMATION' as any),
                qr_proof_image_url: params.qr_proof_image_url,
                total_price_cents: totalPrice,
                notes: params.notes,
                created_by_user_id: undefined, // No user for public bookings
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
    service_ids: number[];
    start_at: string;
    payment_method: string;
    notes?: string | null;
    client_name?: string | null;
    client_email?: string | null;
    client_phone_prefix: string;
    client_phone_number?: string | null;
    qr_proof_image_url?: string | null;
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
        const endAt = new Date(params.start_at);
        endAt.setMinutes(endAt.getMinutes() + totalDuration);

        // Create the booking without customer profile (guest booking)
        const booking = await prisma.booking.create({
            data: {
                company_id: params.company_id,
                staff_id: params.staff_id,
                customer_id: null, // No customer profile for guest bookings
                client_name: params.client_name,
                client_email: params.client_email,
                client_phone_prefix: params.client_phone_prefix,
                client_phone_number: params.client_phone_number,
                booking_type: 'CUSTOMER',
                start_at: new Date(params.start_at),
                end_at: endAt,
                status: 'CONFIRMED',
                payment_method: params.payment_method as any,
                payment_status: params.payment_method === 'NONE' ? ('UNPAID' as any) : ('PENDING' as any),
                qr_proof_image_url: params.qr_proof_image_url,
                total_price_cents: totalPrice,
                notes: params.notes,
                created_by_user_id: undefined, // No user for guest bookings
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
