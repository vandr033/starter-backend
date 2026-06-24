import { prisma } from '../prisma/client';
import { BookingSource, BookingStatus, GroupItemStatus, StaffTimeOffStatus } from '@prisma/client';

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
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            deleted_at: null,
            OR: [
                { staff_id: { in: staffIds } },
                { secondary_staff_id: { in: staffIds } },
            ],
            AND: [
                { start_at: { lt: endDate } },
                { end_at: { gt: startDate } },
            ],
        },
        select: {
            id: true,
            staff_id: true,
            secondary_staff_id: true,
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
            promo_price_cents: true,
            promo_starts_at: true,
            promo_ends_at: true,
            promo_label: true,
            is_multi_session: true,
            session_count: true,
            session_duration_minutes: true,
        },
    });
}

/**
 * Get bookable staff for a company
 */
export async function getBookableStaff(
    companyId: number,
    staffId?: number,
    serviceIds: number[] = [],
) {
    const where: any = {
        company_id: companyId,
        is_bookable: true,
        deleted_at: null,
    };

    if (staffId) {
        where.id = staffId;
    }

    if (serviceIds.length > 0) {
        where.AND = serviceIds.map((serviceId) => ({
            staff_services: {
                some: {
                    service_id: serviceId,
                    is_active: true,
                },
            },
        }));
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
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            deleted_at: null,
            OR: [
                { staff_id: staffId },
                { secondary_staff_id: staffId },
            ],
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
 * Check for a staff/resource conflict while ignoring the booking being moved.
 */
export async function checkSlotConflictExcludingBooking(
    companyId: number,
    staffId: number,
    startAt: Date,
    endAt: Date,
    excludeBookingId: number,
    bufferMinutes: number = 0
) {
    const endWithBuffer = new Date(endAt.getTime() + bufferMinutes * 60 * 1000);

    return prisma.booking.findFirst({
        where: {
            id: { not: excludeBookingId },
            company_id: companyId,
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            deleted_at: null,
            OR: [
                { staff_id: staffId },
                { secondary_staff_id: staffId },
            ],
            AND: [
                { start_at: { lt: endWithBuffer } },
                { end_at: { gt: startAt } },
            ],
        },
        select: { id: true, start_at: true, end_at: true },
    });
}

/**
 * Check if a customer already has another booking overlapping the requested slot.
 */
export async function checkCustomerSlotConflict(
    companyId: number,
    customerId: number,
    startAt: Date,
    endAt: Date,
) {
    return prisma.booking.findFirst({
        where: {
            company_id: companyId,
            customer_id: customerId,
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            deleted_at: null,
            AND: [
                { start_at: { lt: endAt } },
                { end_at: { gt: startAt } },
            ],
        },
        select: {
            id: true,
            start_at: true,
            end_at: true,
            staff_id: true,
        },
    });
}

export type GroupStaffCommitment = {
    staff_id: number;
    start_at: Date;
    end_at: Date;
    source: 'GROUP_EVENT' | 'GROUP_CLASS_SESSION';
    source_id: number;
};

/**
 * Get group commitments (event windows + class sessions) for staff in a date range.
 * Only linked staff_profile assignments block normal bookings.
 */
export async function getGroupStaffCommitmentsForDateRange(
    companyId: number,
    staffIds: number[],
    startDate: Date,
    endDate: Date,
): Promise<GroupStaffCommitment[]> {
    if (staffIds.length === 0) return [];

    const eventAssignments = await prisma.groupStaffAssignment.findMany({
        where: {
            company_id: companyId,
            staff_profile_id: { in: staffIds },
            group_event_id: { not: null },
            group_event: {
                deleted_at: null,
                status: { not: GroupItemStatus.ARCHIVED },
                start_at: { lt: endDate },
                end_at: { gt: startDate },
            },
        },
        select: {
            staff_profile_id: true,
            group_event_id: true,
            group_event: {
                select: {
                    start_at: true,
                    end_at: true,
                },
            },
        },
    });

    const classAssignments = await prisma.groupStaffAssignment.findMany({
        where: {
            company_id: companyId,
            staff_profile_id: { in: staffIds },
            group_class_id: { not: null },
            group_class: {
                deleted_at: null,
                status: { not: GroupItemStatus.ARCHIVED },
            },
        },
        select: {
            staff_profile_id: true,
            group_class_id: true,
        },
    });

    const classIdToStaffIds = new Map<number, number[]>();
    for (const assignment of classAssignments) {
        if (!assignment.group_class_id || !assignment.staff_profile_id) continue;
        const existing = classIdToStaffIds.get(assignment.group_class_id) ?? [];
        existing.push(assignment.staff_profile_id);
        classIdToStaffIds.set(assignment.group_class_id, existing);
    }

    const classIds = Array.from(classIdToStaffIds.keys());
    const classSessions = classIds.length
        ? await prisma.groupClassSession.findMany({
            where: {
                company_id: companyId,
                group_class_id: { in: classIds },
                status: { not: GroupItemStatus.ARCHIVED },
                cancelled_at: null,
                start_at: { lt: endDate },
                end_at: { gt: startDate },
            },
            select: {
                id: true,
                group_class_id: true,
                start_at: true,
                end_at: true,
            },
        })
        : [];

    const commitments: GroupStaffCommitment[] = [];

    for (const assignment of eventAssignments) {
        if (!assignment.staff_profile_id || !assignment.group_event_id || !assignment.group_event) continue;
        commitments.push({
            staff_id: assignment.staff_profile_id,
            start_at: assignment.group_event.start_at,
            end_at: assignment.group_event.end_at,
            source: 'GROUP_EVENT',
            source_id: assignment.group_event_id,
        });
    }

    for (const session of classSessions) {
        const sessionStaffIds = classIdToStaffIds.get(session.group_class_id) ?? [];
        for (const staffId of sessionStaffIds) {
            commitments.push({
                staff_id: staffId,
                start_at: session.start_at,
                end_at: session.end_at,
                source: 'GROUP_CLASS_SESSION',
                source_id: session.id,
            });
        }
    }

    return commitments;
}

/**
 * Check whether a staff member has a blocking group commitment for a slot.
 */
export async function checkGroupSlotConflict(
    companyId: number,
    staffId: number,
    startAt: Date,
    endAt: Date,
    bufferMinutes: number = 0,
) {
    const endWithBuffer = new Date(endAt.getTime() + bufferMinutes * 60 * 1000);

    const eventAssignment = await prisma.groupStaffAssignment.findFirst({
        where: {
            company_id: companyId,
            staff_profile_id: staffId,
            group_event: {
                deleted_at: null,
                status: { not: GroupItemStatus.ARCHIVED },
                start_at: { lt: endWithBuffer },
                end_at: { gt: startAt },
            },
        },
        select: {
            group_event_id: true,
            group_event: {
                select: {
                    id: true,
                    title: true,
                    start_at: true,
                    end_at: true,
                },
            },
        },
    });

    if (eventAssignment?.group_event_id && eventAssignment.group_event) {
        return {
            type: 'GROUP_EVENT' as const,
            id: eventAssignment.group_event.id,
            title: eventAssignment.group_event.title,
            start_at: eventAssignment.group_event.start_at,
            end_at: eventAssignment.group_event.end_at,
        };
    }

    const classSession = await prisma.groupClassSession.findFirst({
        where: {
            company_id: companyId,
            status: { not: GroupItemStatus.ARCHIVED },
            cancelled_at: null,
            start_at: { lt: endWithBuffer },
            end_at: { gt: startAt },
            group_class: {
                deleted_at: null,
                status: { not: GroupItemStatus.ARCHIVED },
                staff_assignments: {
                    some: {
                        company_id: companyId,
                        staff_profile_id: staffId,
                    },
                },
            },
        },
        select: {
            id: true,
            start_at: true,
            end_at: true,
            group_class: {
                select: {
                    title: true,
                },
            },
        },
    });

    if (!classSession) return null;

    return {
        type: 'GROUP_CLASS_SESSION' as const,
        id: classSession.id,
        title: classSession.group_class.title,
        start_at: classSession.start_at,
        end_at: classSession.end_at,
    };
}

/**
 * Create a booking with its services in a transaction
 */
export interface CreateBookingData {
    company_id: number;
    staff_id: number;
    secondary_staff_id?: number | null;
    customer_id: number;
    start_at: Date;
    end_at: Date;
    payment_method: 'NONE' | 'CASH' | 'QR';
    notes?: string;
    created_by_user_id: string;
    total_price_cents: number;
    booking_source?: BookingSource;
    status?: BookingStatus;
    qr_proof_image_url?: string | null;
}

export interface ServiceSnapshot {
    service_id: number;
    service_name_snapshot: string;
    price_cents_snapshot: number;
    regular_price_cents_snapshot?: number | null;
    promo_applied_snapshot?: boolean;
    promo_label_snapshot?: string | null;
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
                secondary_staff_id: bookingData.secondary_staff_id ?? null,
                customer_id: bookingData.customer_id,
                start_at: bookingData.start_at,
                end_at: bookingData.end_at,
                status: bookingData.status ?? BookingStatus.PENDING,
                payment_method: bookingData.payment_method,
                payment_status: bookingData.payment_method === 'NONE' ? 'UNPAID' : 'PENDING_CONFIRMATION',
                qr_proof_image_url: bookingData.qr_proof_image_url ?? null,
                notes: bookingData.notes,
                created_by_user_id: bookingData.created_by_user_id,
                total_price_cents: bookingData.total_price_cents,
                booking_type: 'CUSTOMER',
                booking_source: bookingData.booking_source ?? BookingSource.SALON_SITE,
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
                    regular_price_cents_snapshot: s.regular_price_cents_snapshot ?? null,
                    promo_applied_snapshot: s.promo_applied_snapshot ?? false,
                    promo_label_snapshot: s.promo_label_snapshot ?? null,
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
