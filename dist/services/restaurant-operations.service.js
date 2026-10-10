"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboard = dashboard;
const client_1 = require("../prisma/client");
const timezone_1 = require("../utils/timezone");
const restaurant_reservation_repo_1 = require("../repositories/restaurant-reservation.repo");
const ok = (data) => ({ code: 200, error: false, message: 'Operación realizada correctamente.', data });
const fail = (code, message) => ({ code, error: true, message });
function dateKey(date, timeZone) { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
async function dashboard(companyId) {
    const company = await client_1.prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
    if (!company)
        return fail(404, 'No encontramos la empresa.');
    const key = dateKey(new Date(), company.timezone), start = (0, timezone_1.parseDateTimeInTimeZone)(`${key}T00:00:00`, company.timezone), end = new Date(start.getTime() + 86400000), now = new Date();
    const [today, tables] = await Promise.all([
        client_1.prisma.restaurantReservation.findMany({ where: { company_id: companyId, start_time: { gte: start, lt: end } }, include: restaurant_reservation_repo_1.reservationInclude, orderBy: { start_time: 'asc' } }),
        client_1.prisma.restaurantTable.findMany({ where: { company_id: companyId }, include: { dining_area: true }, orderBy: [{ dining_area: { sort_order: 'asc' } }, { sort_order: 'asc' }, { id: 'asc' }] }),
    ]);
    const count = (status) => today.filter((r) => r.status === status).length;
    const expectedGuests = today.filter((r) => ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED'].includes(r.status)).reduce((sum, r) => sum + r.party_size, 0);
    const tableCards = await Promise.all(tables.map(async (table) => {
        if (!table.is_active || !table.dining_area.is_active)
            return { ...table, operational_status: 'INACTIVE', current_reservation: null, next_reservation: null };
        const relevant = await client_1.prisma.restaurantReservation.findMany({ where: { company_id: companyId, table_id: table.id, status: { in: restaurant_reservation_repo_1.blockingReservationStatuses }, end_time: { gt: now } }, include: restaurant_reservation_repo_1.reservationInclude, orderBy: { start_time: 'asc' }, take: 2 });
        const current = relevant.find((r) => r.start_time <= now && r.end_time > now) || null;
        const next = relevant.find((r) => r.start_time > now) || null;
        return { ...table, operational_status: current?.status === 'SEATED' ? 'SEATED' : current?.status === 'ARRIVED' ? 'ARRIVED' : current ? 'RESERVED' : 'AVAILABLE', current_reservation: current, next_reservation: next };
    }));
    return ok({ date: key, summary: { reservations_today: today.length, guests_expected_today: expectedGuests, pending: count('PENDING'), confirmed: count('CONFIRMED'), arrived: count('ARRIVED'), seated: count('SEATED'), completed: count('COMPLETED'), cancelled: count('CANCELLED'), no_shows: count('NO_SHOW'), available_tables: tableCards.filter((t) => t.operational_status === 'AVAILABLE').length, blocked_tables: tableCards.filter((t) => ['RESERVED', 'ARRIVED', 'SEATED'].includes(t.operational_status)).length }, upcoming_reservations: today.filter((r) => r.start_time >= now && restaurant_reservation_repo_1.blockingReservationStatuses.includes(r.status)).slice(0, 8), tables: tableCards });
}
