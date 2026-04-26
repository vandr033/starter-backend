import { prisma } from '../prisma/client';
import { BookingStatus } from '@prisma/client';
import { INACTIVE_BOOKING_STATUSES, isNoShowBooking } from '../utils/booking-status';

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

function roundToTwo(value: number): number {
    return Math.round(value * 100) / 100;
}

function normalizeEmail(email?: string | null): string | null {
    const value = (email || '').trim().toLowerCase();
    return value || null;
}

function normalizePhone(phone?: string | null): string | null {
    const value = (phone || '').replace(/\D/g, '');
    return value || null;
}

function normalizePrefix(prefix?: string | null): string {
    const value = (prefix || '').replace(/\D/g, '');
    return value || '591';
}

function buildCustomerIdentity(booking: {
    customer_id: number | null;
    client_email: string | null;
    client_phone_prefix: string | null;
    client_phone_number: string | null;
    client_name: string | null;
}): string {
    if (booking.customer_id) return `customer:${booking.customer_id}`;

    const email = normalizeEmail(booking.client_email);
    if (email) return `email:${email}`;

    const phone = normalizePhone(booking.client_phone_number);
    if (phone) {
        const prefix = normalizePrefix(booking.client_phone_prefix);
        return `phone:${prefix}${phone}`;
    }

    const fallbackName = (booking.client_name || 'guest').trim().toLowerCase() || 'guest';
    return `guest:${fallbackName}`;
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
        status: { notIn: [...INACTIVE_BOOKING_STATUSES] },
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
        status: { notIn: [...INACTIVE_BOOKING_STATUSES] },
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
                status: { notIn: [...INACTIVE_BOOKING_STATUSES] },
                deleted_at: null,
                ...(staffId ? { staff_id: staffId } : {}),
            },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
    });

    if (results.length === 0) return [];

    const serviceIds = results.map((r) => r.service_id);
    const services = await prisma.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true },
    });

    const serviceMap = new Map(services.map((s) => [s.id, s.name]));
    const maxCount = results[0]._count.id;

    return results.map((r) => ({
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
            status: { notIn: [...INACTIVE_BOOKING_STATUSES] },
            deleted_at: null,
            ...(staffId ? { staff_id: staffId } : {}),
        },
        _count: { id: true },
        _sum: { total_price_cents: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
    });

    if (results.length === 0) return [];

    const staffIds = results.map((r) => r.staff_id);
    const staffProfiles = await prisma.staffProfile.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, display_name: true },
    });

    const staffMap = new Map(staffProfiles.map((s) => [s.id, s.display_name]));

    return results.map((r) => ({
        id: r.staff_id,
        name: staffMap.get(r.staff_id) || 'Unknown',
        bookingCount: r._count.id,
        revenue: r._sum.total_price_cents || 0,
    }));
}

export async function getBookingsByStatus(companyId: number, staffId?: number) {
    const rows = await prisma.booking.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
            ...(staffId ? { staff_id: staffId } : {}),
        },
        select: {
            status: true,
            notes: true,
        },
    });

    const counters = new Map<string, number>([
        [BookingStatus.PENDING, 0],
        [BookingStatus.CONFIRMED, 0],
        [BookingStatus.COMPLETED, 0],
        [BookingStatus.CANCELLED, 0],
        ['NO_SHOW', 0],
    ]);

    for (const row of rows) {
        if (isNoShowBooking(row.status, row.notes)) {
            counters.set('NO_SHOW', (counters.get('NO_SHOW') || 0) + 1);
            continue;
        }
        counters.set(row.status, (counters.get(row.status) || 0) + 1);
    }

    return Array.from(counters.entries())
        .map(([status, count]) => ({ status, count }))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count);
}

export async function getBookingsByCategory(companyId: number, limit = 6, staffId?: number) {
    const grouped = await prisma.bookingService.groupBy({
        by: ['service_id'],
        where: {
            company_id: companyId,
            booking: {
                deleted_at: null,
                status: { notIn: [...INACTIVE_BOOKING_STATUSES] },
                ...(staffId ? { staff_id: staffId } : {}),
            },
        },
        _count: {
            id: true,
        },
    });

    if (grouped.length === 0) {
        return [];
    }

    const services = await prisma.service.findMany({
        where: {
            id: { in: grouped.map((row) => row.service_id) },
        },
        select: {
            id: true,
            category: {
                select: {
                    name: true,
                },
            },
        },
    });

    const categoryByService = new Map<number, string | null>();
    for (const service of services) {
        categoryByService.set(service.id, service.category?.name || null);
    }

    const categoryCounters = new Map<string, number>();
    for (const row of grouped) {
        const categoryName = categoryByService.get(row.service_id) || '__uncategorized__';
        categoryCounters.set(categoryName, (categoryCounters.get(categoryName) || 0) + row._count.id);
    }

    return Array.from(categoryCounters.entries())
        .map(([categoryName, count]) => ({
            categoryName: categoryName === '__uncategorized__' ? null : categoryName,
            count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

export async function getCustomerInsights(companyId: number, staffId?: number) {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const weekStart = startOfWeek(now);

    const bookings = await prisma.booking.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
            ...(staffId ? { staff_id: staffId } : {}),
        },
        select: {
            customer_id: true,
            client_email: true,
            client_phone_prefix: true,
            client_phone_number: true,
            client_name: true,
            start_at: true,
            status: true,
        },
        orderBy: {
            start_at: 'asc',
        },
    });

    const customerMap = new Map<string, {
        firstSeen: Date;
        totalBookings: number;
    }>();

    for (const booking of bookings) {
        const customerKey = buildCustomerIdentity(booking);
        if (!customerMap.has(customerKey)) {
            customerMap.set(customerKey, {
                firstSeen: booking.start_at,
                totalBookings: 0,
            });
        }

        const current = customerMap.get(customerKey)!;
        current.totalBookings += 1;

        if (booking.start_at < current.firstSeen) {
            current.firstSeen = booking.start_at;
        }
    }

    const totalCustomers = customerMap.size;
    let returningCustomers = 0;
    let newCustomersThisMonth = 0;
    let newCustomersThisWeek = 0;
    let totalBookingsForCustomers = 0;

    for (const customer of customerMap.values()) {
        totalBookingsForCustomers += customer.totalBookings;
        if (customer.totalBookings >= 2) {
            returningCustomers += 1;
        }
        if (customer.firstSeen >= monthStart) {
            newCustomersThisMonth += 1;
        }
        if (customer.firstSeen >= weekStart) {
            newCustomersThisWeek += 1;
        }
    }

    return {
        totalCustomers,
        newCustomersThisMonth,
        newCustomersThisWeek,
        returningCustomers,
        repeatRate: totalCustomers > 0 ? roundToTwo((returningCustomers / totalCustomers) * 100) : 0,
        avgBookingsPerCustomer: totalCustomers > 0 ? roundToTwo(totalBookingsForCustomers / totalCustomers) : 0,
    };
}

export async function getBusiestMoments(companyId: number, staffId?: number) {
    const bookings = await prisma.booking.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
            status: { notIn: [...INACTIVE_BOOKING_STATUSES] },
            ...(staffId ? { staff_id: staffId } : {}),
        },
        select: {
            start_at: true,
        },
    });

    const dayCounter = new Map<number, number>();
    const hourCounter = new Map<number, number>();

    for (const booking of bookings) {
        const day = booking.start_at.getDay();
        const hour = booking.start_at.getHours();
        dayCounter.set(day, (dayCounter.get(day) || 0) + 1);
        hourCounter.set(hour, (hourCounter.get(hour) || 0) + 1);
    }

    return {
        busiestDays: Array.from(dayCounter.entries())
            .map(([dayOfWeek, count]) => ({ dayOfWeek, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3),
        busiestHours: Array.from(hourCounter.entries())
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3),
    };
}

function getMonthKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
}

export async function getCustomerGrowthTrend(companyId: number, staffId?: number, months = 6) {
    const safeMonths = Math.max(3, Math.min(12, Math.trunc(months)));

    const bookings = await prisma.booking.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
            ...(staffId ? { staff_id: staffId } : {}),
        },
        select: {
            customer_id: true,
            client_email: true,
            client_phone_prefix: true,
            client_phone_number: true,
            client_name: true,
            start_at: true,
        },
        orderBy: { start_at: 'asc' },
    });

    const firstSeenByCustomer = new Map<string, Date>();
    for (const booking of bookings) {
        const customerKey = buildCustomerIdentity(booking);
        const current = firstSeenByCustomer.get(customerKey);
        if (!current || booking.start_at < current) {
            firstSeenByCustomer.set(customerKey, booking.start_at);
        }
    }

    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = safeMonths - 1; i >= 0; i -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthKeys.push(getMonthKey(date));
    }

    const counts = new Map<string, number>();
    for (const monthKey of monthKeys) {
        counts.set(monthKey, 0);
    }

    for (const firstSeen of firstSeenByCustomer.values()) {
        const monthKey = getMonthKey(firstSeen);
        if (counts.has(monthKey)) {
            counts.set(monthKey, (counts.get(monthKey) || 0) + 1);
        }
    }

    return monthKeys.map((month) => ({
        month,
        newCustomers: counts.get(month) || 0,
    }));
}
