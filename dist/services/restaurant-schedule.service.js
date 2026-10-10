"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeToMinutes = timeToMinutes;
exports.localDayOfWeek = localDayOfWeek;
exports.isValidDateString = isValidDateString;
exports.isServicePeriodOpenAt = isServicePeriodOpenAt;
exports.servicePeriodCovers = servicePeriodCovers;
exports.buildRestaurantOperatingState = buildRestaurantOperatingState;
exports.listActiveRestaurantServicePeriods = listActiveRestaurantServicePeriods;
exports.resolveRestaurantOperatingState = resolveRestaurantOperatingState;
exports.getRestaurantPublicHours = getRestaurantPublicHours;
const client_1 = require("../prisma/client");
function timeToMinutes(value) {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
}
function localDayOfWeek(date) {
    return new Date(`${date}T12:00:00Z`).getUTCDay();
}
function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function isServicePeriodOpenAt(period, time) {
    const start = timeToMinutes(period.start_time);
    const end = timeToMinutes(period.end_time);
    const current = timeToMinutes(time);
    if (end > start)
        return current >= start && current < end;
    // Overnight periods are not currently accepted by the admin validator, but
    // this keeps the resolver correct if persisted legacy data contains one.
    return current >= start || current < end;
}
function servicePeriodCovers(period, startTime, endTime) {
    const start = timeToMinutes(period.start_time);
    const requestedStart = timeToMinutes(startTime);
    const requestedEnd = timeToMinutes(endTime);
    const end = timeToMinutes(period.end_time);
    if (end > start)
        return requestedStart >= start && requestedEnd <= end;
    // A legacy overnight period covers an interval that crosses midnight when
    // the end time is numerically earlier than the start time.
    return requestedStart >= start && requestedEnd <= end + 24 * 60;
}
function buildRestaurantOperatingState(params) {
    const activePeriods = params.periods
        .filter((period) => period.is_active !== false)
        .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    const publicPeriods = activePeriods.map((period) => ({ start: period.start_time, end: period.end_time }));
    const hasPeriods = publicPeriods.length > 0;
    const now = params.now ?? new Date();
    const currentDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: params.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
    const currentTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: params.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(now);
    const isOpen = currentDate === params.date && activePeriods.some((period) => isServicePeriodOpenAt(period, currentTime));
    return {
        date: params.date,
        timezone: params.timezone,
        publicPeriods,
        isOpen,
        reservationAvailable: hasPeriods,
        ...(hasPeriods ? {} : { closedReason: 'NO_SERVICE_PERIOD' }),
    };
}
async function listActiveRestaurantServicePeriods(companyId, dayOfWeek, db = client_1.prisma) {
    return db.restaurantServicePeriod.findMany({
        where: {
            company_id: companyId,
            is_active: true,
            ...(dayOfWeek === undefined ? {} : { day_of_week: dayOfWeek }),
        },
        orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }, { sort_order: 'asc' }],
    });
}
async function resolveRestaurantOperatingState(companyId, date, timezone, db = client_1.prisma) {
    const periods = await listActiveRestaurantServicePeriods(companyId, localDayOfWeek(date), db);
    return buildRestaurantOperatingState({ date, timezone, periods });
}
async function getRestaurantPublicHours(companyId, db = client_1.prisma) {
    const periods = await listActiveRestaurantServicePeriods(companyId, undefined, db);
    return periods.map((period, index) => ({
        id: period.id ?? index + 1,
        day_of_week: period.day_of_week,
        open_time: period.start_time,
        close_time: period.end_time,
        is_closed: false,
    }));
}
