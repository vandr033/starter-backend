import { GroupBookingStatus, GroupItemStatus, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { MensajeApi } from '../types/MensajeApi';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';

type ServiceResult = MensajeApi & { data?: unknown };

export interface GroupMetricsFilters {
    date_from?: Date;
    date_to?: Date;
    event_id?: number;
    class_id?: number;
    item_status?: GroupItemStatus;
    booking_status?: GroupBookingStatus;
    free_paid?: 'FREE' | 'PAID';
}

function toPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
}

function buildDateRangeFilter(dateFrom?: Date, dateTo?: Date): { gte?: Date; lte?: Date } | undefined {
    if (!dateFrom && !dateTo) return undefined;
    return {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
    };
}

export async function getGroupMetrics(companyId: number, filters: GroupMetricsFilters): Promise<ServiceResult> {
    const canUseEvents = await isFeatureEnabledForCompany(companyId, 'GROUP_EVENTS');
    if (!canUseEvents) {
        return { code: 403, error: true, message: 'Group event metrics require Business plan or higher' };
    }

    const canUseClasses = await isFeatureEnabledForCompany(companyId, 'GROUP_CLASSES');
    const canUseAdvanced = await isFeatureEnabledForCompany(companyId, 'GROUP_ADVANCED');

    const dateRange = buildDateRangeFilter(filters.date_from, filters.date_to);

    const eventWhere: Prisma.GroupEventWhereInput = {
        company_id: companyId,
        deleted_at: null,
        ...(filters.event_id ? { id: filters.event_id } : {}),
        ...(filters.item_status ? { status: filters.item_status } : {}),
        ...(filters.free_paid === 'FREE' ? { is_free: true } : {}),
        ...(filters.free_paid === 'PAID' ? { is_free: false } : {}),
        ...(dateRange ? { start_at: dateRange } : {}),
    };

    const events = await prisma.groupEvent.findMany({
        where: eventWhere,
        select: {
            id: true,
            title: true,
            status: true,
            is_free: true,
            max_capacity: true,
            start_at: true,
            end_at: true,
            price_cents: true,
        },
        orderBy: { start_at: 'asc' },
    });

    const eventIds = events.map((event) => event.id);

    const [eventBookings, eventAttendances, eventInterests] = eventIds.length > 0
        ? await Promise.all([
            prisma.groupEventBooking.findMany({
                where: {
                    company_id: companyId,
                    group_event_id: { in: eventIds },
                    ...(filters.booking_status ? { status: filters.booking_status } : {}),
                },
                select: {
                    id: true,
                    group_event_id: true,
                    status: true,
                    booked_spots: true,
                    total_price_cents: true,
                },
            }),
            prisma.groupSessionAttendance.findMany({
                where: {
                    company_id: companyId,
                    group_event_id: { in: eventIds },
                    checked_in_at: { not: null },
                },
                select: {
                    id: true,
                    group_event_id: true,
                },
            }),
            prisma.groupEventInterest.groupBy({
                by: ['group_event_id'],
                where: {
                    company_id: companyId,
                    group_event_id: { in: eventIds },
                },
                _count: {
                    _all: true,
                },
            }),
        ])
        : [[], [], []];

    const bookingsByEvent = new Map<number, typeof eventBookings>();
    for (const booking of eventBookings) {
        const list = bookingsByEvent.get(booking.group_event_id) ?? [];
        list.push(booking);
        bookingsByEvent.set(booking.group_event_id, list);
    }

    const checkedInByEvent = new Map<number, number>();
    for (const attendance of eventAttendances) {
        if (!attendance.group_event_id) continue;
        checkedInByEvent.set(
            attendance.group_event_id,
            (checkedInByEvent.get(attendance.group_event_id) ?? 0) + 1,
        );
    }

    const interestsByEvent = new Map<number, number>();
    for (const interest of eventInterests) {
        interestsByEvent.set(interest.group_event_id, interest._count._all);
    }

    const eventBreakdown = events.map((event) => {
        const bookings = bookingsByEvent.get(event.id) ?? [];
        const confirmedSpots = bookings
            .filter((booking) => booking.status === 'CONFIRMED')
            .reduce((sum, booking) => sum + booking.booked_spots, 0);
        const pendingSpots = bookings
            .filter((booking) => booking.status === 'PENDING')
            .reduce((sum, booking) => sum + booking.booked_spots, 0);
        const waitlistSize = bookings.filter((booking) => booking.status === 'WAITLISTED').length;
        const checkedInCount = checkedInByEvent.get(event.id) ?? 0;
        const occupancyRate = event.max_capacity > 0 ? toPercent((confirmedSpots / event.max_capacity) * 100) : 0;
        const attendanceRate = confirmedSpots > 0 ? toPercent((checkedInCount / confirmedSpots) * 100) : 0;
        const noShowCount = Math.max(confirmedSpots - checkedInCount, 0);
        const revenueCents = bookings
            .filter((booking) => booking.status === 'CONFIRMED')
            .reduce((sum, booking) => sum + booking.total_price_cents, 0);

        return {
            event_id: event.id,
            title: event.title,
            status: event.status,
            is_free: event.is_free,
            start_at: event.start_at,
            end_at: event.end_at,
            max_capacity: event.max_capacity,
            confirmed_spots: confirmedSpots,
            pending_spots: pendingSpots,
            waitlist_size: waitlistSize,
            interest_count: interestsByEvent.get(event.id) ?? 0,
            checked_in_count: checkedInCount,
            occupancy_rate: occupancyRate,
            attendance_rate: attendanceRate,
            no_show_count: noShowCount,
            revenue_cents: revenueCents,
        };
    });

    const totalEventCapacity = eventBreakdown.reduce((sum, row) => sum + row.max_capacity, 0);
    const totalEventSeatsSold = eventBreakdown.reduce((sum, row) => sum + row.confirmed_spots, 0);
    const totalEventCheckedIn = eventBreakdown.reduce((sum, row) => sum + row.checked_in_count, 0);

    const eventSummary = {
        total_events: eventBreakdown.length,
        seats_sold: totalEventSeatsSold,
        occupancy_rate: totalEventCapacity > 0 ? toPercent((totalEventSeatsSold / totalEventCapacity) * 100) : 0,
        attendance_rate: totalEventSeatsSold > 0 ? toPercent((totalEventCheckedIn / totalEventSeatsSold) * 100) : 0,
        no_show_count: eventBreakdown.reduce((sum, row) => sum + row.no_show_count, 0),
        free_confirmed_spots: eventBreakdown
            .filter((row) => row.is_free)
            .reduce((sum, row) => sum + row.confirmed_spots, 0),
        paid_confirmed_spots: eventBreakdown
            .filter((row) => !row.is_free)
            .reduce((sum, row) => sum + row.confirmed_spots, 0),
        total_interest_count: eventBreakdown.reduce((sum, row) => sum + row.interest_count, 0),
        waitlist_size: eventBreakdown.reduce((sum, row) => sum + row.waitlist_size, 0),
        revenue_cents: eventBreakdown.reduce((sum, row) => sum + row.revenue_cents, 0),
    };

    if (!canUseClasses) {
        return {
            code: 200,
            error: false,
            message: 'Group metrics retrieved',
            data: {
                scope: 'BUSINESS',
                filters: {
                    date_from: filters.date_from?.toISOString() ?? null,
                    date_to: filters.date_to?.toISOString() ?? null,
                    event_id: filters.event_id ?? null,
                    class_id: null,
                    item_status: filters.item_status ?? null,
                    booking_status: filters.booking_status ?? null,
                    free_paid: filters.free_paid ?? null,
                },
                events: {
                    summary: {
                        total_events: eventSummary.total_events,
                        seats_sold: eventSummary.seats_sold,
                        occupancy_rate: eventSummary.occupancy_rate,
                        attendance_rate: eventSummary.attendance_rate,
                        no_show_count: eventSummary.no_show_count,
                        free_confirmed_spots: eventSummary.free_confirmed_spots,
                        paid_confirmed_spots: eventSummary.paid_confirmed_spots,
                        revenue_cents: eventSummary.revenue_cents,
                    },
                    breakdown: eventBreakdown,
                },
                classes: null,
            },
        };
    }

    const classWhere: Prisma.GroupClassWhereInput = {
        company_id: companyId,
        deleted_at: null,
        ...(filters.class_id ? { id: filters.class_id } : {}),
        ...(filters.item_status ? { status: filters.item_status } : {}),
    };

    const classes = await prisma.groupClass.findMany({
        where: classWhere,
        select: {
            id: true,
            title: true,
            status: true,
            pricing_mode: true,
            max_capacity_per_session: true,
        },
        orderBy: { created_at: 'desc' },
    });

    const classIds = classes.map((groupClass) => groupClass.id);

    const [sessions, enrollments] = classIds.length > 0
        ? await Promise.all([
            prisma.groupClassSession.findMany({
                where: {
                    company_id: companyId,
                    group_class_id: { in: classIds },
                    cancelled_at: null,
                    ...(dateRange ? { start_at: dateRange } : {}),
                },
                select: {
                    id: true,
                    group_class_id: true,
                    start_at: true,
                    end_at: true,
                    max_capacity_override: true,
                },
                orderBy: { start_at: 'asc' },
            }),
            prisma.groupClassEnrollment.findMany({
                where: {
                    company_id: companyId,
                    group_class_id: { in: classIds },
                    ...(filters.booking_status ? { status: filters.booking_status } : {}),
                },
                select: {
                    id: true,
                    group_class_id: true,
                    user_id: true,
                    status: true,
                    price_cents_snapshot: true,
                    valid_from: true,
                    valid_until: true,
                },
            }),
        ])
        : [[], []];

    const sessionIds = sessions.map((session) => session.id);
    const sessionAttendances = sessionIds.length > 0
        ? await prisma.groupSessionAttendance.findMany({
            where: {
                company_id: companyId,
                group_class_session_id: { in: sessionIds },
                checked_in_at: { not: null },
            },
            select: {
                id: true,
                user_id: true,
                group_class_session_id: true,
            },
        })
        : [];

    const checkedInBySession = new Map<number, Set<string>>();
    for (const attendance of sessionAttendances) {
        if (!attendance.group_class_session_id) continue;
        const users = checkedInBySession.get(attendance.group_class_session_id) ?? new Set<string>();
        users.add(attendance.user_id);
        checkedInBySession.set(attendance.group_class_session_id, users);
    }

    const sessionsByClass = new Map<number, typeof sessions>();
    for (const session of sessions) {
        const list = sessionsByClass.get(session.group_class_id) ?? [];
        list.push(session);
        sessionsByClass.set(session.group_class_id, list);
    }

    const enrollmentsByClass = new Map<number, typeof enrollments>();
    for (const enrollment of enrollments) {
        const list = enrollmentsByClass.get(enrollment.group_class_id) ?? [];
        list.push(enrollment);
        enrollmentsByClass.set(enrollment.group_class_id, list);
    }

    const now = new Date();
    const classBreakdown = classes.map((groupClass) => {
        const classSessions = sessionsByClass.get(groupClass.id) ?? [];
        const classEnrollments = enrollmentsByClass.get(groupClass.id) ?? [];

        const confirmedEnrollments = classEnrollments.filter((enrollment) => enrollment.status === 'CONFIRMED');
        const pendingEnrollments = classEnrollments.filter((enrollment) => enrollment.status === 'PENDING');
        const activePassHolders = confirmedEnrollments.filter((enrollment) => enrollment.valid_until >= now).length;
        const revenueCents = confirmedEnrollments.reduce((sum, enrollment) => sum + enrollment.price_cents_snapshot, 0);

        let totalSessionCapacity = 0;
        let totalPotentialAttendances = 0;
        let totalCheckedIn = 0;
        let noShowCount = 0;

        const sessionBreakdown = classSessions.map((session) => {
            const checkedInUsers = checkedInBySession.get(session.id) ?? new Set<string>();
            const checkedInCount = checkedInUsers.size;
            const capacity = session.max_capacity_override ?? groupClass.max_capacity_per_session;

            const potentialAttendances = confirmedEnrollments.filter(
                (enrollment) => enrollment.valid_from <= session.start_at && enrollment.valid_until >= session.start_at,
            ).length;

            const sessionNoShow = Math.max(potentialAttendances - checkedInCount, 0);

            totalSessionCapacity += capacity;
            totalPotentialAttendances += potentialAttendances;
            totalCheckedIn += checkedInCount;
            noShowCount += sessionNoShow;

            return {
                session_id: session.id,
                start_at: session.start_at,
                end_at: session.end_at,
                capacity,
                potential_attendances: potentialAttendances,
                checked_in_count: checkedInCount,
                no_show_count: sessionNoShow,
                occupancy_rate: capacity > 0 ? toPercent((checkedInCount / capacity) * 100) : 0,
                pass_utilization_rate: potentialAttendances > 0 ? toPercent((checkedInCount / potentialAttendances) * 100) : 0,
            };
        });

        return {
            class_id: groupClass.id,
            title: groupClass.title,
            status: groupClass.status,
            pricing_mode: groupClass.pricing_mode,
            total_sessions: classSessions.length,
            total_enrollments: classEnrollments.length,
            confirmed_enrollments: confirmedEnrollments.length,
            pending_enrollments: pendingEnrollments.length,
            active_pass_holders: activePassHolders,
            revenue_cents: revenueCents,
            checked_in_count: totalCheckedIn,
            no_show_count: noShowCount,
            occupancy_rate: totalSessionCapacity > 0 ? toPercent((totalCheckedIn / totalSessionCapacity) * 100) : 0,
            attendance_rate: totalPotentialAttendances > 0 ? toPercent((totalCheckedIn / totalPotentialAttendances) * 100) : 0,
            pass_utilization_rate: totalPotentialAttendances > 0 ? toPercent((totalCheckedIn / totalPotentialAttendances) * 100) : 0,
            session_breakdown: sessionBreakdown,
        };
    });

    const totalClassSessionCapacity = classBreakdown.reduce((sum, row) => {
        const rowCapacity = row.session_breakdown.reduce((acc, session) => acc + session.capacity, 0);
        return sum + rowCapacity;
    }, 0);
    const totalClassCheckedIn = classBreakdown.reduce((sum, row) => sum + row.checked_in_count, 0);

    const classSummary = {
        total_classes: classBreakdown.length,
        total_sessions: classBreakdown.reduce((sum, row) => sum + row.total_sessions, 0),
        total_enrollments: classBreakdown.reduce((sum, row) => sum + row.total_enrollments, 0),
        active_pass_holders: classBreakdown.reduce((sum, row) => sum + row.active_pass_holders, 0),
        revenue_cents: classBreakdown.reduce((sum, row) => sum + row.revenue_cents, 0),
        checked_in_count: totalClassCheckedIn,
        no_show_count: classBreakdown.reduce((sum, row) => sum + row.no_show_count, 0),
        occupancy_rate: totalClassSessionCapacity > 0 ? toPercent((totalClassCheckedIn / totalClassSessionCapacity) * 100) : 0,
        attendance_rate: (() => {
            const potential = classBreakdown.reduce(
                (sum, row) => sum + row.session_breakdown.reduce((acc, session) => acc + session.potential_attendances, 0),
                0,
            );
            return potential > 0 ? toPercent((totalClassCheckedIn / potential) * 100) : 0;
        })(),
        pass_utilization_rate: (() => {
            const potential = classBreakdown.reduce(
                (sum, row) => sum + row.session_breakdown.reduce((acc, session) => acc + session.potential_attendances, 0),
                0,
            );
            return potential > 0 ? toPercent((totalClassCheckedIn / potential) * 100) : 0;
        })(),
    };

    return {
        code: 200,
        error: false,
        message: 'Group metrics retrieved',
        data: {
            scope: canUseAdvanced ? 'PRO' : 'BUSINESS',
            filters: {
                date_from: filters.date_from?.toISOString() ?? null,
                date_to: filters.date_to?.toISOString() ?? null,
                event_id: filters.event_id ?? null,
                class_id: filters.class_id ?? null,
                item_status: filters.item_status ?? null,
                booking_status: filters.booking_status ?? null,
                free_paid: filters.free_paid ?? null,
            },
            events: {
                summary: eventSummary,
                breakdown: eventBreakdown,
            },
            classes: {
                summary: classSummary,
                breakdown: classBreakdown,
            },
            advanced: {
                waitlist_size: canUseAdvanced ? eventSummary.waitlist_size : 0,
            },
        },
    };
}
