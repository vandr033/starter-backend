import { Prisma, RestaurantReservationStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { parseDateTimeInTimeZone } from '../utils/timezone';

const statuses: RestaurantReservationStatus[] = ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const active = new Set<RestaurantReservationStatus>(['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED']);
const expected = new Set<RestaurantReservationStatus>(['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED']);
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

function localKey(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function nextDate(date: string) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }
function previousDays(timezone: string, days: number) { const value = new Date(`${localKey(new Date(), timezone)}T12:00:00Z`); value.setUTCDate(value.getUTCDate() - days + 1); return value.toISOString().slice(0, 10); }
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value; }
function weekday(date: Date, timezone: string) { const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date); return weekdayFormatter.formatToParts(new Date('2023-01-01T12:00:00Z')) && ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name); }
function time(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
function percentage(numerator: number, denominator: number) { return denominator ? numerator / denominator : 0; }

export async function restaurantMetrics(companyId: number, input: { dateFrom?: string; dateTo?: string }) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  if (!company) return { code: 404, error: true, message: 'No encontramos la empresa.' };
  const dateTo = input.dateTo || localKey(new Date(), company.timezone);
  const dateFrom = input.dateFrom || previousDays(company.timezone, 30);
  if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) return { code: 400, error: true, message: 'El rango de fechas es inválido.' };
  const span = Math.round((new Date(`${dateTo}T12:00:00Z`).getTime() - new Date(`${dateFrom}T12:00:00Z`).getTime()) / 86_400_000) + 1;
  if (span > 366) return { code: 400, error: true, message: 'El rango máximo es de 366 días.' };
  const start = parseDateTimeInTimeZone(`${dateFrom}T00:00:00`, company.timezone);
  const end = parseDateTimeInTimeZone(`${nextDate(dateTo)}T00:00:00`, company.timezone);
  const where: Prisma.RestaurantReservationWhereInput = { company_id: companyId, start_time: { gte: start, lt: end } };
  const [grouped, rows] = await Promise.all([
    prisma.restaurantReservation.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { party_size: true } }),
    prisma.restaurantReservation.findMany({
      where,
      select: { status: true, source: true, party_size: true, start_time: true, created_at: true, table: { select: { id: true, name: true, dining_area: { select: { id: true, name: true } } } } },
    }),
  ]);
  const byStatus = new Map(grouped.map((row) => [row.status, { count: row._count._all, guests: row._sum.party_size || 0 }]));
  const count = (status: RestaurantReservationStatus) => byStatus.get(status)?.count || 0;
  const guests = (status: RestaurantReservationStatus) => byStatus.get(status)?.guests || 0;
  const totalReservations = grouped.reduce((sum, item) => sum + item._count._all, 0);
  const cancelledReservations = count('CANCELLED'), noShowReservations = count('NO_SHOW');
  const expectedGuests = [...expected].reduce((sum, status) => sum + guests(status), 0);
  const activeReservations = [...active].reduce((sum, status) => sum + count(status), 0);
  const nonCancelled = rows.filter((row) => row.status !== 'CANCELLED');
  const partyTotal = nonCancelled.reduce((sum, row) => sum + row.party_size, 0);
  const leadRows = rows.filter((row) => row.start_time > row.created_at);
  const leadTotal = leadRows.reduce((sum, row) => sum + (row.start_time.getTime() - row.created_at.getTime()) / 60_000, 0);
  const sources = new Map<string, { reservationCount: number; guestCount: number }>();
  const weekdays = new Map<number, { reservationCount: number; guestCount: number }>();
  const times = new Map<string, { reservationCount: number; guestCount: number }>();
  const areas = new Map<string, { diningAreaId: number | null; name: string; reservationCount: number; guestCount: number; completedCount: number; cancellationCount: number; noShowCount: number }>();
  const tables = new Map<string, { tableId: number | null; name: string; reservationCount: number; completedCount: number; guestCount: number; noShowCount: number }>();
  const dates = new Map<string, { reservationCount: number; guestCount: number }>();
  for (const row of rows) {
    const source = sources.get(row.source) || { reservationCount: 0, guestCount: 0 }; source.reservationCount += 1; source.guestCount += row.party_size; sources.set(row.source, source);
    const day = weekday(row.start_time, company.timezone); const weekdayValue = weekdays.get(day) || { reservationCount: 0, guestCount: 0 }; weekdayValue.reservationCount += 1; weekdayValue.guestCount += row.party_size; weekdays.set(day, weekdayValue);
    const slot = time(row.start_time, company.timezone); const timeValue = times.get(slot) || { reservationCount: 0, guestCount: 0 }; timeValue.reservationCount += 1; timeValue.guestCount += row.party_size; times.set(slot, timeValue);
    const date = localKey(row.start_time, company.timezone); const dateValue = dates.get(date) || { reservationCount: 0, guestCount: 0 }; dateValue.reservationCount += 1; dateValue.guestCount += row.party_size; dates.set(date, dateValue);
    const areaId = row.table?.dining_area?.id ?? null; const areaName = row.table?.dining_area?.name ?? 'Sin mesa asignada'; const areaKey = String(areaId ?? 'unassigned');
    const area = areas.get(areaKey) || { diningAreaId: areaId, name: areaName, reservationCount: 0, guestCount: 0, completedCount: 0, cancellationCount: 0, noShowCount: 0 };
    area.reservationCount += 1; area.guestCount += row.party_size; if (row.status === 'COMPLETED') area.completedCount += 1; if (row.status === 'CANCELLED') area.cancellationCount += 1; if (row.status === 'NO_SHOW') area.noShowCount += 1; areas.set(areaKey, area);
    const tableId = row.table?.id ?? null; const tableName = row.table?.name ?? 'Sin mesa asignada'; const tableKey = String(tableId ?? 'unassigned');
    const table = tables.get(tableKey) || { tableId, name: tableName, reservationCount: 0, completedCount: 0, guestCount: 0, noShowCount: 0 };
    table.reservationCount += 1; table.guestCount += row.party_size; if (row.status === 'COMPLETED') table.completedCount += 1; if (row.status === 'NO_SHOW') table.noShowCount += 1; tables.set(tableKey, table);
  }
  const statusBreakdown = statuses.map((status) => ({ status, count: count(status), guestCount: guests(status) }));
  const busiestDate = [...dates.entries()].sort((a, b) => b[1].reservationCount - a[1].reservationCount || a[0].localeCompare(b[0]))[0];
  return {
    code: 200, error: false, message: 'Operación realizada correctamente.', data: {
      range: { dateFrom, dateTo, timezone: company.timezone },
      summary: { totalReservations, activeReservations, expectedGuests, servedGuests: guests('COMPLETED'), cancelledReservations, noShowReservations, cancellationRate: percentage(cancelledReservations, totalReservations), noShowRate: percentage(noShowReservations, count('COMPLETED') + noShowReservations), averagePartySize: percentage(partyTotal, nonCancelled.length), averageLeadTimeMinutes: Math.round(percentage(leadTotal, leadRows.length)) },
      statusBreakdown,
      sourceBreakdown: [...sources.entries()].map(([source, value]) => ({ source, ...value, percentage: percentage(value.reservationCount, totalReservations) })).sort((a, b) => b.reservationCount - a.reservationCount),
      weekdayBreakdown: [...weekdays.entries()].map(([weekday, value]) => ({ weekday, ...value })).sort((a, b) => a.weekday - b.weekday),
      timeBreakdown: [...times.entries()].map(([slot, value]) => ({ time: slot, ...value })).sort((a, b) => a.time.localeCompare(b.time)),
      diningAreaBreakdown: [...areas.values()].sort((a, b) => b.reservationCount - a.reservationCount),
      tableBreakdown: [...tables.values()].sort((a, b) => b.reservationCount - a.reservationCount),
      busiestDate: busiestDate ? { date: busiestDate[0], ...busiestDate[1] } : null,
    },
  };
}
