"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookingsForDateRange = getBookingsForDateRange;
exports.getCompanyHoursForDay = getCompanyHoursForDay;
exports.getCompanyHourWindowsForDay = getCompanyHourWindowsForDay;
exports.getAllCompanyHours = getAllCompanyHours;
exports.getCompanySettings = getCompanySettings;
exports.getServicesByIds = getServicesByIds;
exports.getBookableStaff = getBookableStaff;
exports.getStaffAvailabilityForDay = getStaffAvailabilityForDay;
exports.getStaffAvailabilityCounts = getStaffAvailabilityCounts;
exports.getApprovedStaffTimeOffOverlaps = getApprovedStaffTimeOffOverlaps;
exports.getCompanyById = getCompanyById;
exports.getActiveCompanyById = getActiveCompanyById;
exports.getOrCreateCustomerProfile = getOrCreateCustomerProfile;
exports.checkSlotConflict = checkSlotConflict;
exports.checkSlotConflictExcludingBooking = checkSlotConflictExcludingBooking;
exports.checkCustomerSlotConflict = checkCustomerSlotConflict;
exports.getGroupStaffCommitmentsForDateRange = getGroupStaffCommitmentsForDateRange;
exports.checkGroupSlotConflict = checkGroupSlotConflict;
exports.createBookingWithServices = createBookingWithServices;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
/**
 * Get bookings for a date range, optionally filtered by staff IDs
 */
async function getBookingsForDateRange(companyId, staffIds, startDate, endDate) {
    return client_1.prisma.booking.findMany({
        where: {
            company_id: companyId,
            status: { in: [client_2.BookingStatus.PENDING, client_2.BookingStatus.CONFIRMED] },
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
async function getCompanyHoursForDay(companyId, dayOfWeek) {
    return client_1.prisma.hours.findFirst({
        where: {
            company_id: companyId,
            day_of_week: dayOfWeek,
        },
    });
}
/**
 * Get all opening windows for a company day of week (supports multiple windows)
 */
async function getCompanyHourWindowsForDay(companyId, dayOfWeek) {
    return client_1.prisma.hours.findMany({
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
async function getAllCompanyHours(companyId) {
    return client_1.prisma.hours.findMany({
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
async function getCompanySettings(companyId) {
    return client_1.prisma.companySettings.findUnique({
        where: { company_id: companyId },
    });
}
/**
 * Get services by IDs to calculate total duration
 */
async function getServicesByIds(serviceIds, companyId) {
    return client_1.prisma.service.findMany({
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
            booking_time_granularity_minutes: true,
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
async function getBookableStaff(companyId, staffId, serviceIds = []) {
    const where = {
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
    return client_1.prisma.staffProfile.findMany({
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
async function getStaffAvailabilityForDay(companyId, staffIds, dayOfWeek) {
    if (staffIds.length === 0)
        return [];
    return client_1.prisma.staffAvailability.findMany({
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
async function getStaffAvailabilityCounts(companyId, staffIds) {
    if (staffIds.length === 0)
        return [];
    return client_1.prisma.staffAvailability.groupBy({
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
async function getApprovedStaffTimeOffOverlaps(companyId, staffIds, rangeStart, rangeEnd) {
    if (staffIds.length === 0)
        return [];
    return client_1.prisma.staffTimeOff.findMany({
        where: {
            company_id: companyId,
            staff_id: { in: staffIds },
            status: client_2.StaffTimeOffStatus.APPROVED,
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
async function getCompanyById(companyId) {
    return client_1.prisma.company.findUnique({
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
async function getActiveCompanyById(companyId) {
    return client_1.prisma.company.findFirst({
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
async function getOrCreateCustomerProfile(companyId, userId) {
    const existing = await client_1.prisma.customerProfile.findUnique({
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
    return client_1.prisma.customerProfile.create({
        data: {
            company_id: companyId,
            user_id: userId,
        },
    });
}
/**
 * Check if there's a conflict with existing bookings for a staff member
 */
async function checkSlotConflict(companyId, staffId, startAt, endAt, bufferMinutes = 0) {
    // Add buffer to end time
    const endWithBuffer = new Date(endAt.getTime() + bufferMinutes * 60 * 1000);
    const conflicting = await client_1.prisma.booking.findFirst({
        where: {
            company_id: companyId,
            status: { in: [client_2.BookingStatus.PENDING, client_2.BookingStatus.CONFIRMED] },
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
async function checkSlotConflictExcludingBooking(companyId, staffId, startAt, endAt, excludeBookingId, bufferMinutes = 0) {
    const endWithBuffer = new Date(endAt.getTime() + bufferMinutes * 60 * 1000);
    return client_1.prisma.booking.findFirst({
        where: {
            id: { not: excludeBookingId },
            company_id: companyId,
            status: { in: [client_2.BookingStatus.PENDING, client_2.BookingStatus.CONFIRMED] },
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
async function checkCustomerSlotConflict(companyId, customerId, startAt, endAt) {
    return client_1.prisma.booking.findFirst({
        where: {
            company_id: companyId,
            customer_id: customerId,
            status: { in: [client_2.BookingStatus.PENDING, client_2.BookingStatus.CONFIRMED] },
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
/**
 * Get group commitments (event windows + class sessions) for staff in a date range.
 * Only linked staff_profile assignments block normal bookings.
 */
async function getGroupStaffCommitmentsForDateRange(companyId, staffIds, startDate, endDate) {
    if (staffIds.length === 0)
        return [];
    const eventAssignments = await client_1.prisma.groupStaffAssignment.findMany({
        where: {
            company_id: companyId,
            staff_profile_id: { in: staffIds },
            group_event_id: { not: null },
            group_event: {
                deleted_at: null,
                status: { not: client_2.GroupItemStatus.ARCHIVED },
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
    const classAssignments = await client_1.prisma.groupStaffAssignment.findMany({
        where: {
            company_id: companyId,
            staff_profile_id: { in: staffIds },
            group_class_id: { not: null },
            group_class: {
                deleted_at: null,
                status: { not: client_2.GroupItemStatus.ARCHIVED },
            },
        },
        select: {
            staff_profile_id: true,
            group_class_id: true,
        },
    });
    const classIdToStaffIds = new Map();
    for (const assignment of classAssignments) {
        if (!assignment.group_class_id || !assignment.staff_profile_id)
            continue;
        const existing = classIdToStaffIds.get(assignment.group_class_id) ?? [];
        existing.push(assignment.staff_profile_id);
        classIdToStaffIds.set(assignment.group_class_id, existing);
    }
    const classIds = Array.from(classIdToStaffIds.keys());
    const classSessions = classIds.length
        ? await client_1.prisma.groupClassSession.findMany({
            where: {
                company_id: companyId,
                group_class_id: { in: classIds },
                status: { not: client_2.GroupItemStatus.ARCHIVED },
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
    const commitments = [];
    for (const assignment of eventAssignments) {
        if (!assignment.staff_profile_id || !assignment.group_event_id || !assignment.group_event)
            continue;
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
async function checkGroupSlotConflict(companyId, staffId, startAt, endAt, bufferMinutes = 0) {
    const endWithBuffer = new Date(endAt.getTime() + bufferMinutes * 60 * 1000);
    const eventAssignment = await client_1.prisma.groupStaffAssignment.findFirst({
        where: {
            company_id: companyId,
            staff_profile_id: staffId,
            group_event: {
                deleted_at: null,
                status: { not: client_2.GroupItemStatus.ARCHIVED },
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
            type: 'GROUP_EVENT',
            id: eventAssignment.group_event.id,
            title: eventAssignment.group_event.title,
            start_at: eventAssignment.group_event.start_at,
            end_at: eventAssignment.group_event.end_at,
        };
    }
    const classSession = await client_1.prisma.groupClassSession.findFirst({
        where: {
            company_id: companyId,
            status: { not: client_2.GroupItemStatus.ARCHIVED },
            cancelled_at: null,
            start_at: { lt: endWithBuffer },
            end_at: { gt: startAt },
            group_class: {
                deleted_at: null,
                status: { not: client_2.GroupItemStatus.ARCHIVED },
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
    if (!classSession)
        return null;
    return {
        type: 'GROUP_CLASS_SESSION',
        id: classSession.id,
        title: classSession.group_class.title,
        start_at: classSession.start_at,
        end_at: classSession.end_at,
    };
}
async function createBookingWithServices(bookingData, services) {
    return client_1.prisma.$transaction(async (tx) => {
        // Create the booking
        const booking = await tx.booking.create({
            data: {
                company_id: bookingData.company_id,
                staff_id: bookingData.staff_id,
                secondary_staff_id: bookingData.secondary_staff_id ?? null,
                customer_id: bookingData.customer_id,
                start_at: bookingData.start_at,
                end_at: bookingData.end_at,
                status: bookingData.status ?? client_2.BookingStatus.PENDING,
                payment_method: bookingData.payment_method,
                payment_status: bookingData.payment_method === 'NONE' ? 'UNPAID' : 'PENDING_CONFIRMATION',
                qr_proof_image_url: bookingData.qr_proof_image_url ?? null,
                notes: bookingData.notes,
                created_by_user_id: bookingData.created_by_user_id,
                total_price_cents: bookingData.total_price_cents,
                booking_type: 'CUSTOMER',
                booking_source: bookingData.booking_source ?? client_2.BookingSource.SALON_SITE,
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
