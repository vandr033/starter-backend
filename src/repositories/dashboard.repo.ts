import { prisma } from '../prisma/client';
import { BookingStatus } from '@prisma/client';

const NON_CANCELLED = { status: { not: BookingStatus.CANCELLED } };

function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function startOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfMonth(date: Date): Date {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

export async function getBookingCounts(companyId: number, staffId?: number) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const baseWhere = {
        company_id: companyId,
        deleted_at: null,
        ...(staffId ? { staff_id: staffId } : {}),
        ...NON_CANCELLED,
    };

    const [total, thisMonth, thisWeek, today, upcoming7Days] = await Promise.all([
        prisma.booking.count({ where: baseWhere }),
        prisma.booking.count({ where: { ...baseWhere, start_at: { gte: monthStart } } }),
        prisma.booking.count({ where: { ...baseWhere, start_at: { gte: weekStart } } }),
        prisma.booking.count({ where: { ...baseWhere, start_at: { gte: todayStart, lte: todayEnd } } }),
        prisma.booking.count({
            where: {
                ...baseWhere,
                start_at: { gte: now, lte: next7Days },
                status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            },
        }),
    ]);

    return { total, thisMonth, thisWeek, today, upcoming7Days };
}

export async function getRevenueTotals(companyId: number, staffId?: number) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const baseWhere = {
        company_id: companyId,
        deleted_at: null,
        ...(staffId ? { staff_id: staffId } : {}),
        ...NON_CANCELLED,
    };

    const [totalAgg, monthAgg, weekAgg, todayAgg] = await Promise.all([
        prisma.booking.aggregate({ where: baseWhere, _sum: { total_price_cents: true }, _count: true }),
        prisma.booking.aggregate({ where: { ...baseWhere, start_at: { gte: monthStart } }, _sum: { total_price_cents: true } }),
        prisma.booking.aggregate({ where: { ...baseWhere, start_at: { gte: weekStart } }, _sum: { total_price_cents: true } }),
        prisma.booking.aggregate({ where: { ...baseWhere, start_at: { gte: todayStart, lte: todayEnd } }, _sum: { total_price_cents: true } }),
    ]);

    const total = totalAgg._sum.total_price_cents || 0;
    const count = totalAgg._count || 0;

    return {
        total,
        thisMonth: monthAgg._sum.total_price_cents || 0,
        thisWeek: weekAgg._sum.total_price_cents || 0,
        today: todayAgg._sum.total_price_cents || 0,
        avgPerBooking: count > 0 ? Math.round(total / count) : 0,
    };
}

export async function getTopServices(companyId: number, limit = 5, staffId?: number) {
    const results = await prisma.bookingService.groupBy({
        by: ['service_id'],
        where: {
            company_id: companyId,
            booking: {
                status: { not: BookingStatus.CANCELLED },
                deleted_at: null,
                ...(staffId ? { staff_id: staffId } : {}),
            },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
    });

    if (results.length === 0) return [];

    const serviceIds = results.map(r => r.service_id);
    const services = await prisma.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true },
    });

    const serviceMap = new Map(services.map(s => [s.id, s.name]));
    const maxCount = results[0]._count.id;

    return results.map(r => ({
        id: r.service_id,
        name: serviceMap.get(r.service_id) || 'Unknown',
        count: r._count.id,
        percentage: maxCount > 0 ? Math.round((r._count.id / maxCount) * 100) : 0,
    }));
}

export async function getTopStaff(companyId: number, limit = 5, staffId?: number) {
    const results = await prisma.booking.groupBy({
        by: ['staff_id'],
        where: {
            company_id: companyId,
            status: { not: BookingStatus.CANCELLED },
            deleted_at: null,
            ...(staffId ? { staff_id: staffId } : {}),
        },
        _count: { id: true },
        _sum: { total_price_cents: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
    });

    if (results.length === 0) return [];

    const staffIds = results.map(r => r.staff_id);
    const staffProfiles = await prisma.staffProfile.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, display_name: true },
    });

    const staffMap = new Map(staffProfiles.map(s => [s.id, s.display_name]));

    return results.map(r => ({
        id: r.staff_id,
        name: staffMap.get(r.staff_id) || 'Unknown',
        bookingCount: r._count.id,
        revenue: r._sum.total_price_cents || 0,
    }));
}
