import { prisma } from '../prisma/client';
import { BookingStatus, StaffTimeOffStatus } from '@prisma/client';

/**
 * Get bookings for a date range, optionally filtered by staff IDs
 */
export async function getBookingsForDateRange(
    companyId: number,
    staffIds: number[],
    startDate: Date,
    endDate: Date
) {
    return prisma.booking.findMany({
        where: {
            company_id: companyId,
            staff_id: { in: staffIds },
            start_at: { gte: startDate },
            end_at: { lte: endDate },
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            deleted_at: null,
        },
        select: {
            id: true,
            staff_id: true,
            start_at: true,
            end_at: true,
            status: true,
        },
        orderBy: { start_at: 'asc' },
    });
}

/**
 * Get company hours for a specific day of week
 */
export async function getCompanyHoursForDay(companyId: number, dayOfWeek: number) {
    return prisma.hours.findFirst({
        where: {
            company_id: companyId,
            day_of_week: dayOfWeek,
        },
    });
}

/**
 * Get all opening windows for a company day of week (supports multiple windows)
 */
export async function getCompanyHourWindowsForDay(companyId: number, dayOfWeek: number) {
    return prisma.hours.findMany({
        where: {
            company_id: companyId,
            day_of_week: dayOfWeek,
        },
        orderBy: {
            open_time: 'asc',
        },
    });
}

/**
 * Get all company hours for all days
 */
export async function getAllCompanyHours(companyId: number) {
    return prisma.hours.findMany({
        where: {
            company_id: companyId,
        },
        orderBy: {
            day_of_week: 'asc',
        },
    });
}

/**
 * Get company settings (buffer, granularity, etc.)
 */
export async function getCompanySettings(companyId: number) {
    return prisma.companySettings.findUnique({
        where: { company_id: companyId },
    });
}

/**
 * Get services by IDs to calculate total duration
 */
export async function getServicesByIds(serviceIds: number[], companyId: number) {
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
        },
    });
}

/**
 * Get bookable staff for a company
 */
export async function getBookableStaff(companyId: number, staffId?: number) {
    const where: any = {
        company_id: companyId,
        is_bookable: true,
        deleted_at: null,
    };

    if (staffId) {
        where.id = staffId;
    }

    return prisma.staffProfile.findMany({
        where,
        select: {
            id: true,
            display_name: true,
            user_id: true,
            start_date: true,
            end_date: true,
        },
    });
}

/**
 * Get active availability windows for staff on a specific day
 */
export async function getStaffAvailabilityForDay(
    companyId: number,
    staffIds: number[],
    dayOfWeek: number
) {
    if (staffIds.length === 0) return [];
    return prisma.staffAvailability.findMany({
        where: {
            company_id: companyId,
            staff_id: { in: staffIds },
            day_of_week: dayOfWeek,
            is_active: true,
        },
        select: {
            staff_id: true,
            day_of_week: true,
            start_time: true,
            end_time: true,
        },
        orderBy: [
            { staff_id: 'asc' },
            { start_time: 'asc' },
        ],
    });
}

/**
 * Get active availability count by staff (used to detect custom schedules)
 */
export async function getStaffAvailabilityCounts(companyId: number, staffIds: number[]) {
    if (staffIds.length === 0) return [];
    return prisma.staffAvailability.groupBy({
        by: ['staff_id'],
        where: {
            company_id: companyId,
            staff_id: { in: staffIds },
            is_active: true,
        },
        _count: {
            id: true,
        },
    });
}

/**
 * Get approved time-off entries overlapping the requested range
 */
export async function getApprovedStaffTimeOffOverlaps(
    companyId: number,
    staffIds: number[],
    rangeStart: Date,
    rangeEnd: Date
) {
    if (staffIds.length === 0) return [];
    return prisma.staffTimeOff.findMany({
        where: {
            company_id: companyId,
            staff_id: { in: staffIds },
            status: StaffTimeOffStatus.APPROVED,
            deleted_at: null,
            starts_at: { lt: rangeEnd },
            ends_at: { gt: rangeStart },
        },
        select: {
            staff_id: true,
            starts_at: true,
            ends_at: true,
        },
        orderBy: [
            { staff_id: 'asc' },
            { starts_at: 'asc' },
        ],
    });
}

/**
 * Check if company exists
 */
export async function getCompanyById(companyId: number) {
    return prisma.company.findUnique({
        where: { id: companyId },
        select: {
            id: true,
            name: true,
            timezone: true,
        },
    });
}

/**
 * Get active company by ID
 */
export async function getActiveCompanyById(companyId: number) {
    return prisma.company.findFirst({
        where: {
            id: companyId,
            is_active: true,
            deleted_at: null,
        },
        select: {
            id: true,
            name: true,
            timezone: true,
        },
    });
}

/**
 * Get or create CustomerProfile for a user at a company
 */
export async function getOrCreateCustomerProfile(companyId: number, userId: string) {
    const existing = await prisma.customerProfile.findUnique({
        where: {
            company_id_user_id: {
                company_id: companyId,
                user_id: userId,
            },
        },
    });

    if (existing) {
        return existing;
    }

    return prisma.customerProfile.create({
        data: {
            company_id: companyId,
            user_id: userId,
        },
    });
}

/**
 * Check if there's a conflict with existing bookings for a staff member
 */
export async function checkSlotConflict(
    companyId: number,
    staffId: number,
    startAt: Date,
    endAt: Date,
    bufferMinutes: number = 0
) {
    // Add buffer to end time
    const endWithBuffer = new Date(endAt.getTime() + bufferMinutes * 60 * 1000);

    const conflicting = await prisma.booking.findFirst({
        where: {
            company_id: companyId,
            staff_id: staffId,
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            deleted_at: null,
            // Overlap check: existing booking overlaps if existing.start < endWithBuffer AND existing.end > startAt
            AND: [
                { start_at: { lt: endWithBuffer } },
                { end_at: { gt: startAt } },
            ],
        },
        select: { id: true, start_at: true, end_at: true },
    });

    return conflicting;
}

/**
 * Create a booking with its services in a transaction
 */
export interface CreateBookingData {
    company_id: number;
    staff_id: number;
    customer_id: number;
    start_at: Date;
    end_at: Date;
    payment_method: 'NONE' | 'CASH' | 'QR';
    notes?: string;
    created_by_user_id: string;
    total_price_cents: number;
}

export interface ServiceSnapshot {
    service_id: number;
    service_name_snapshot: string;
    price_cents_snapshot: number;
    duration_minutes_snapshot: number;
    position: number;
}

export async function createBookingWithServices(
    bookingData: CreateBookingData,
    services: ServiceSnapshot[]
) {
    return prisma.$transaction(async (tx) => {
        // Create the booking
        const booking = await tx.booking.create({
            data: {
                company_id: bookingData.company_id,
                staff_id: bookingData.staff_id,
                customer_id: bookingData.customer_id,
                start_at: bookingData.start_at,
                end_at: bookingData.end_at,
                status: BookingStatus.PENDING,
                payment_method: bookingData.payment_method,
                payment_status: bookingData.payment_method === 'NONE' ? 'UNPAID' : 'PENDING_CONFIRMATION',
                notes: bookingData.notes,
                created_by_user_id: bookingData.created_by_user_id,
                total_price_cents: bookingData.total_price_cents,
                booking_type: 'CUSTOMER',
            },
        });

        // Create booking services
        if (services.length > 0) {
            await tx.bookingService.createMany({
                data: services.map((s) => ({
                    booking_id: booking.id,
                    company_id: bookingData.company_id,
                    service_id: s.service_id,
                    service_name_snapshot: s.service_name_snapshot,
                    price_cents_snapshot: s.price_cents_snapshot,
                    duration_minutes_snapshot: s.duration_minutes_snapshot,
                    position: s.position,
                })),
            });
        }

        // Return booking with services
        return tx.booking.findUnique({
            where: { id: booking.id },
            include: {
                booking_services: true,
                staff: {
                    select: { id: true, display_name: true },
                },
                customer: {
                    select: { id: true },
                },
            },
        });
    });
}
