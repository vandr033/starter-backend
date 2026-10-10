"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardRangeWindow = getDashboardRangeWindow;
exports.getBookingCounts = getBookingCounts;
exports.getRevenueTotals = getRevenueTotals;
exports.getTopShopsByRevenue = getTopShopsByRevenue;
exports.getTopShopsByBookings = getTopShopsByBookings;
exports.getTopServices = getTopServices;
exports.getEntityCounts = getEntityCounts;
exports.getBookingsBySource = getBookingsBySource;
exports.getMarketplaceEventsInRange = getMarketplaceEventsInRange;
exports.getGlobalServiceTypeNames = getGlobalServiceTypeNames;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const booking_status_1 = require("../utils/booking-status");
const NON_CANCELLED = { status: { notIn: [...booking_status_1.INACTIVE_BOOKING_STATUSES] } };
function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}
function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}
function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
}
function startOfMonth(date) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}
function getDashboardRangeWindow(preset) {
    const now = new Date();
    const end = now;
    if (preset === 'today') {
        return {
            preset,
            start: startOfDay(now),
            end,
        };
    }
    const days = preset === '7d' ? 7 : 30;
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    return { preset, start, end };
}
/** Platform-wide booking counts (no company filter) */
async function getBookingCounts() {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const baseWhere = { deleted_at: null, ...NON_CANCELLED };
    const [total, thisMonth, thisWeek, today, upcoming7Days] = await Promise.all([
        client_1.prisma.booking.count({ where: baseWhere }),
        client_1.prisma.booking.count({ where: { ...baseWhere, start_at: { gte: monthStart } } }),
        client_1.prisma.booking.count({ where: { ...baseWhere, start_at: { gte: weekStart } } }),
        client_1.prisma.booking.count({ where: { ...baseWhere, start_at: { gte: todayStart, lte: todayEnd } } }),
        client_1.prisma.booking.count({
            where: {
                deleted_at: null,
                start_at: { gte: now, lte: next7Days },
                status: { in: [client_2.BookingStatus.PENDING, client_2.BookingStatus.CONFIRMED] },
            },
        }),
    ]);
    return { total, thisMonth, thisWeek, today, upcoming7Days };
}
/** Platform-wide revenue totals */
async function getRevenueTotals() {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const baseWhere = { deleted_at: null, ...NON_CANCELLED };
    const [totalAgg, monthAgg, weekAgg, todayAgg] = await Promise.all([
        client_1.prisma.booking.aggregate({ where: baseWhere, _sum: { total_price_cents: true }, _count: true }),
        client_1.prisma.booking.aggregate({ where: { ...baseWhere, start_at: { gte: monthStart } }, _sum: { total_price_cents: true } }),
        client_1.prisma.booking.aggregate({ where: { ...baseWhere, start_at: { gte: weekStart } }, _sum: { total_price_cents: true } }),
        client_1.prisma.booking.aggregate({ where: { ...baseWhere, start_at: { gte: todayStart, lte: todayEnd } }, _sum: { total_price_cents: true } }),
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
/** Top 5 shops by revenue */
async function getTopShopsByRevenue(limit = 5) {
    const results = await client_1.prisma.booking.groupBy({
        by: ['company_id'],
        where: { deleted_at: null, ...NON_CANCELLED },
        _sum: { total_price_cents: true },
        _count: { id: true },
        orderBy: { _sum: { total_price_cents: 'desc' } },
        take: limit,
    });
    if (results.length === 0)
        return [];
    const companyIds = results.map(r => r.company_id);
    const companies = await client_1.prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true, slug: true },
    });
    const companyMap = new Map(companies.map(c => [c.id, c]));
    return results.map(r => ({
        id: r.company_id,
        name: companyMap.get(r.company_id)?.name || 'Unknown',
        slug: companyMap.get(r.company_id)?.slug || '',
        revenue: r._sum.total_price_cents || 0,
        bookingCount: r._count.id,
    }));
}
/** Top 5 shops by booking count */
async function getTopShopsByBookings(limit = 5) {
    const results = await client_1.prisma.booking.groupBy({
        by: ['company_id'],
        where: { deleted_at: null, ...NON_CANCELLED },
        _count: { id: true },
        _sum: { total_price_cents: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
    });
    if (results.length === 0)
        return [];
    const companyIds = results.map(r => r.company_id);
    const companies = await client_1.prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true, slug: true },
    });
    const companyMap = new Map(companies.map(c => [c.id, c]));
    return results.map(r => ({
        id: r.company_id,
        name: companyMap.get(r.company_id)?.name || 'Unknown',
        slug: companyMap.get(r.company_id)?.slug || '',
        bookingCount: r._count.id,
        revenue: r._sum.total_price_cents || 0,
    }));
}
/** Top 5 services across all shops */
async function getTopServices(limit = 5) {
    const results = await client_1.prisma.bookingService.groupBy({
        by: ['service_id'],
        where: {
            booking: { status: { notIn: [...booking_status_1.INACTIVE_BOOKING_STATUSES] }, deleted_at: null },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
    });
    if (results.length === 0)
        return [];
    const serviceIds = results.map(r => r.service_id);
    const services = await client_1.prisma.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true, company: { select: { name: true } } },
    });
    const serviceMap = new Map(services.map(s => [s.id, s]));
    const maxCount = results[0]._count.id;
    return results.map(r => ({
        id: r.service_id,
        name: serviceMap.get(r.service_id)?.name || 'Unknown',
        shopName: serviceMap.get(r.service_id)?.company?.name || 'Unknown',
        count: r._count.id,
        percentage: maxCount > 0 ? Math.round((r._count.id / maxCount) * 100) : 0,
    }));
}
/** Entity counts: active shops, staff profiles, unique customers */
async function getEntityCounts() {
    const [activeShops, totalStaff, totalCustomers] = await Promise.all([
        client_1.prisma.company.count({ where: { deleted_at: null, is_active: true } }),
        client_1.prisma.staffProfile.count({ where: { deleted_at: null } }),
        client_1.prisma.companyUser.count({
            where: { deleted_at: null, role: 'CUSTOMER' },
        }),
    ]);
    return { activeShops, totalStaff, totalCustomers };
}
async function getBookingsBySource(start, end) {
    const rows = await client_1.prisma.booking.groupBy({
        by: ['booking_source'],
        where: {
            deleted_at: null,
            created_at: { gte: start, lte: end },
            status: { notIn: [...booking_status_1.INACTIVE_BOOKING_STATUSES] },
        },
        _count: { id: true },
    });
    const counts = {
        marketplace: 0,
        salonSite: 0,
        admin: 0,
        manual: 0,
    };
    for (const row of rows) {
        if (row.booking_source === client_2.BookingSource.MARKETPLACE)
            counts.marketplace += row._count.id;
        if (row.booking_source === client_2.BookingSource.SALON_SITE)
            counts.salonSite += row._count.id;
        if (row.booking_source === client_2.BookingSource.ADMIN)
            counts.admin += row._count.id;
        if (row.booking_source === client_2.BookingSource.MANUAL)
            counts.manual += row._count.id;
    }
    const total = counts.marketplace + counts.salonSite + counts.admin + counts.manual;
    return {
        ...counts,
        total,
    };
}
async function getMarketplaceEventsInRange(start, end) {
    return client_1.prisma.marketplaceEvent.findMany({
        where: {
            created_at: { gte: start, lte: end },
        },
        select: {
            event_name: true,
            payload: true,
            created_at: true,
        },
        orderBy: { created_at: 'desc' },
    });
}
async function getGlobalServiceTypeNames(serviceTypeIds) {
    if (serviceTypeIds.length === 0)
        return new Map();
    const rows = await client_1.prisma.globalServiceType.findMany({
        where: { id: { in: serviceTypeIds } },
        select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
}
