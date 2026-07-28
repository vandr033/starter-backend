import { randomBytes } from 'crypto';
import { Prisma, RestaurantNotificationEvent, RestaurantReservationSource, RestaurantReservationStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { canonicalizePhoneParts } from '../utils/phoneNormalization';
import { parseDateTimeInTimeZone } from '../utils/timezone';
import { blockingReservationStatuses, reservationInclude, restaurantReservationRepo } from '../repositories/restaurant-reservation.repo';
import { notifyRestaurantReservation } from './restaurant-notification.service';
import type { RestaurantNotificationChanges } from './restaurant-notification-template.service';

type Result = { code: number; error: boolean; message: string; data?: unknown };
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });
const BLOCKING = blockingReservationStatuses;
const transitions: Record<RestaurantReservationStatus, RestaurantReservationStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'], ARRIVED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [], NO_SHOW: [],
};

function localDate(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function localTime(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
function localDay(date: Date, timezone: string) { const day = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day); }
function normalizeText(value?: string | null) { const result = value?.trim(); return result || null; }
export function generateRestaurantReservationCode() { return randomBytes(18).toString('base64url'); }

async function context(tx: Prisma.TransactionClient, companyId: number) {
  return tx.company.findFirst({ where: { id: companyId }, select: { timezone: true, phone_prefix: true, restaurant_settings: true } });
}
async function validateTime(tx: Prisma.TransactionClient, companyId: number, input: any, walkIn: boolean) {
  const company = await context(tx, companyId);
  if (!company?.restaurant_settings) throw Object.assign(new Error('La configuración de restaurante no existe.'), { status: 404 });
  const settings = company.restaurant_settings;
  const start = parseDateTimeInTimeZone(`${input.reservation_date}T${input.reservation_time}:00`, company.timezone);
  if (Number.isNaN(start.getTime())) throw Object.assign(new Error('Fecha u hora inválida.'), { status: 400 });
  const now = new Date();
  const earliest = new Date(now.getTime() + settings.minimum_advance_minutes * 60000);
  if (walkIn) { if (!settings.allow_walk_ins) throw Object.assign(new Error('Los walk-ins no están habilitados.'), { status: 403 }); if (start.getTime() < now.getTime() - 5 * 60000) throw Object.assign(new Error('No podés registrar un walk-in en el pasado.'), { status: 400 }); }
  else if (start < earliest) throw Object.assign(new Error('La reserva no cumple la anticipación mínima.'), { status: 400 });
  const max = new Date(now.getTime() + settings.maximum_advance_days * 86400000);
  if (start > max) throw Object.assign(new Error('La reserva excede la anticipación máxima permitida.'), { status: 400 });
  if (!Number.isInteger(input.party_size) || input.party_size < settings.minimum_party_size || input.party_size > settings.maximum_party_size) throw Object.assign(new Error('El tamaño del grupo no cumple la configuración del restaurante.'), { status: 400 });
  const time = localTime(start, company.timezone), day = localDay(start, company.timezone);
  const end = new Date(start.getTime() + settings.average_dining_minutes * 60000);
  const endTime = localTime(end, company.timezone);
  const period = await tx.restaurantServicePeriod.findFirst({ where: { company_id: companyId, day_of_week: day, is_active: true, start_time: { lte: time }, end_time: { gte: endTime } } });
  if (!period) throw Object.assign(new Error('La reserva debe completar su duración dentro de un período de servicio activo.'), { status: 409 });
  return { company, settings, start, end, reservationDate: parseDateTimeInTimeZone(`${input.reservation_date}T00:00:00`, company.timezone) };
}
export async function selectRestaurantTable(tx: Prisma.TransactionClient, companyId: number, partySize: number, start: Date, end: Date, requestedId?: number | null, excludeId?: number) {
  const candidates = await tx.restaurantTable.findMany({ where: { company_id: companyId, is_active: true, dining_area: { is_active: true }, maximum_seats: { gte: partySize }, ...(requestedId ? { id: requestedId } : {}) }, include: { dining_area: true }, orderBy: [{ maximum_seats: 'asc' }, { minimum_seats: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }] });
  if (requestedId && !candidates.length) throw Object.assign(new Error('La mesa seleccionada no está activa o no tiene capacidad suficiente.'), { status: 409 });
  for (const table of candidates) { if (!await restaurantReservationRepo.conflicts(tx, table.id, start, end, excludeId)) return table; }
  throw Object.assign(new Error(requestedId ? 'La mesa seleccionada ya no está disponible.' : 'No hay una mesa adecuada disponible para este horario.'), { status: 409 });
}
export async function resolveRestaurantCustomer(tx: Prisma.TransactionClient, companyId: number, companyPrefix: string, data: any) {
  const email = normalizeText(data.customer_email)?.toLowerCase() || null;
  const phone = canonicalizePhoneParts({ phoneNumber: normalizeText(data.customer_phone), phonePrefix: normalizeText(data.customer_phone_prefix), defaultPrefix: companyPrefix });
  if (!email && !phone.phoneNumber) return null;
  const user = await tx.user.findFirst({ where: { deleted_at: null, OR: [{ ...(email ? { email } : { id: '__none__' }) }, { ...(phone.phoneNumber ? { phoneNumber: phone.phoneNumber } : { id: '__none__' }) }] } });
  let resolved = user;
  if (!resolved) {
    const temp = email || `restaurant-${randomBytes(12).toString('hex')}@guest.priconpri.local`;
    resolved = await tx.user.create({ data: { email: temp, name: data.customer_name.trim(), phoneNumber: phone.phoneNumber || undefined, phone_prefix: phone.phonePrefix || undefined, is_active: true } });
  } else {
    const updates: Prisma.UserUpdateInput = {};
    if (!resolved.phoneNumber && phone.phoneNumber) { updates.phoneNumber = phone.phoneNumber; updates.phone_prefix = phone.phonePrefix; }
    if ((!resolved.name || resolved.name.trim().length === 0) && data.customer_name) updates.name = data.customer_name.trim();
    if (Object.keys(updates).length) resolved = await tx.user.update({ where: { id: resolved.id }, data: updates });
  }
  const profile = await tx.customerProfile.upsert({ where: { company_id_user_id: { company_id: companyId, user_id: resolved.id } }, create: { company_id: companyId, user_id: resolved.id }, update: { deleted_at: null } });
  return profile.id;
}

export async function createReservation(companyId: number, userId: string, input: any): Promise<Result> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const walkIn = input.source === 'WALK_IN'; const timing = await validateTime(tx, companyId, input, walkIn);
      const phone = canonicalizePhoneParts({ phoneNumber: input.customer_phone, defaultPrefix: timing.company.phone_prefix });
      if (timing.settings.require_phone && !phone.phoneNumber) throw Object.assign(new Error('El teléfono es obligatorio.'), { status: 400 });
      if (timing.settings.require_email && !normalizeText(input.customer_email)) throw Object.assign(new Error('El correo electrónico es obligatorio.'), { status: 400 });
      const table = await selectRestaurantTable(tx, companyId, input.party_size, timing.start, timing.end, input.table_id);
      const customerProfileId = await resolveRestaurantCustomer(tx, companyId, timing.company.phone_prefix, input);
      const status: RestaurantReservationStatus = walkIn ? (input.initial_status || 'ARRIVED') : (input.initial_status || (timing.settings.auto_confirm_reservations ? 'CONFIRMED' : 'PENDING'));
      for (let attempts = 0; attempts < 3; attempts += 1) { try {
        const reservation = await tx.restaurantReservation.create({ data: { company_id: companyId, customer_profile_id: customerProfileId, table_id: table.id, reservation_code: generateRestaurantReservationCode(), reservation_date: timing.reservationDate, start_time: timing.start, end_time: timing.end, party_size: input.party_size, customer_name: input.customer_name.trim(), customer_phone: phone.fullPhone, customer_email: normalizeText(input.customer_email)?.toLowerCase(), notes: normalizeText(input.notes), internal_notes: normalizeText(input.internal_notes), status, source: input.source as RestaurantReservationSource, seated_at: status === 'SEATED' ? new Date() : null, created_by_user_id: userId }, include: reservationInclude }); return reservation; } catch (error: any) { if (error?.code !== 'P2002' || attempts === 2) throw error; } }
      throw new Error('No pudimos generar el código de reserva.');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.status === 'PENDING' || result.status === 'CONFIRMED') {
      try { await notifyRestaurantReservation(result.id, { event: result.status === 'PENDING' ? RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED : RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED }); } catch { /* Delivery is never allowed to invalidate a reservation. */ }
    }
    return ok(result, 'Reserva creada.', 201);
  } catch (error: any) {
    const conflict = error?.status === 409 || error?.code === 'P2002' || error?.code === 'P2034';
    return fail(conflict ? 409 : (error?.status || 500), conflict ? 'La mesa ya no está disponible para ese horario.' : (error.message || 'No pudimos crear la reserva.'));
  }
}

export async function updateReservation(companyId: number, id: number, input: any): Promise<Result> {
  try { const result = await prisma.$transaction(async (tx) => {
    const existing = await restaurantReservationRepo.findInTx(tx, companyId, id); if (!existing) throw Object.assign(new Error('No encontramos la reserva.'), { status: 404 });
    if (!BLOCKING.includes(existing.status)) throw Object.assign(new Error('No podés reprogramar una reserva finalizada.'), { status: 409 });
    const company = await context(tx, companyId); if (!company?.restaurant_settings) throw Object.assign(new Error('La configuración de restaurante no existe.'), { status: 404 });
    const date = input.reservation_date || localDate(existing.start_time, company.timezone), time = input.reservation_time || localTime(existing.start_time, company.timezone), party = input.party_size ?? existing.party_size;
    const timing = await validateTime(tx, companyId, { reservation_date: date, reservation_time: time, party_size: party }, existing.source === 'WALK_IN');
    const requested = input.auto_assign ? undefined : (input.table_id !== undefined ? input.table_id : existing.table_id);
    const table = await selectRestaurantTable(tx, companyId, party, timing.start, timing.end, requested, existing.id);
    const snapshot = { customer_name: input.customer_name ?? existing.customer_name, customer_phone: input.customer_phone ?? existing.customer_phone, customer_email: input.customer_email ?? existing.customer_email };
    const profile = await resolveRestaurantCustomer(tx, companyId, timing.company.phone_prefix, snapshot);
    const nextNotes = input.notes === undefined ? existing.notes : normalizeText(input.notes);
    const changes: RestaurantNotificationChanges = { dateChanged: timing.start.getTime() !== existing.start_time.getTime() && localDate(timing.start, company.timezone) !== localDate(existing.start_time, company.timezone), timeChanged: localTime(timing.start, company.timezone) !== localTime(existing.start_time, company.timezone), partySizeChanged: party !== existing.party_size, notesChanged: nextNotes !== existing.notes };
    const reservation = await tx.restaurantReservation.update({ where: { id }, data: { customer_profile_id: profile ?? existing.customer_profile_id, table_id: table.id, reservation_date: timing.reservationDate, start_time: timing.start, end_time: timing.end, party_size: party, customer_name: snapshot.customer_name.trim(), customer_phone: canonicalizePhoneParts({ phoneNumber: snapshot.customer_phone, defaultPrefix: timing.company.phone_prefix }).fullPhone, customer_email: normalizeText(snapshot.customer_email)?.toLowerCase(), notes: nextNotes, internal_notes: input.internal_notes === undefined ? existing.internal_notes : normalizeText(input.internal_notes) }, include: reservationInclude });
    return { reservation, changes };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result.reservation.status === 'PENDING' || result.reservation.status === 'CONFIRMED') {
    if (result.changes.dateChanged || result.changes.timeChanged || result.changes.partySizeChanged || result.changes.notesChanged) {
      try { await notifyRestaurantReservation(result.reservation.id, { event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_UPDATED, changes: result.changes }); } catch { /* Delivery is isolated from persistence. */ }
    }
  }
  return ok(result.reservation, 'Reserva actualizada.'); } catch (error: any) {
    const conflict = error?.status === 409 || error?.code === 'P2034';
    return fail(conflict ? 409 : (error?.status || 500), conflict ? 'La mesa ya no está disponible para ese horario.' : (error.message || 'No pudimos actualizar la reserva.'));
  }
}

export async function changeStatus(companyId: number, id: number, status: RestaurantReservationStatus, reason?: string | null): Promise<Result> { try {
  const reservation = await restaurantReservationRepo.find(companyId, id); if (!reservation) return fail(404, 'No encontramos la reserva.');
  if (!transitions[reservation.status].includes(status)) return fail(409, 'La transición de estado no está permitida.');
  const now = new Date(); const data: Prisma.RestaurantReservationUpdateInput = { status };
  if (status === 'SEATED') data.seated_at = now; if (status === 'COMPLETED') data.completed_at = now; if (status === 'CANCELLED') { data.cancelled_at = now; data.cancellation_reason = normalizeText(reason); }
  const updated = await prisma.restaurantReservation.update({ where: { id }, data, include: reservationInclude });
  if (status === 'CONFIRMED') { try { await notifyRestaurantReservation(updated.id, { event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED }); } catch { /* persistence already succeeded */ } }
  if (status === 'CANCELLED') { try { await notifyRestaurantReservation(updated.id, { event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CANCELLED, cancellationActor: 'ADMIN' }); } catch { /* persistence already succeeded */ } }
  return ok(updated, 'Estado actualizado.');
} catch (error: any) { return fail(500, error.message || 'No pudimos actualizar el estado.'); } }

export async function assignTable(companyId: number, id: number, input: any): Promise<Result> { return updateReservation(companyId, id, { table_id: input.auto_assign ? undefined : input.table_id, auto_assign: input.auto_assign }); }

export async function getReservation(companyId: number, id: number): Promise<Result> { const reservation = await restaurantReservationRepo.find(companyId, id); return reservation ? ok(reservation) : fail(404, 'No encontramos la reserva.'); }

export async function listReservations(companyId: number, query: any): Promise<Result> { const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }); if (!company) return fail(404, 'No encontramos la empresa.');
  const selected = query.date || query.dateFrom; const start = selected ? parseDateTimeInTimeZone(`${selected}T00:00:00`, company.timezone) : undefined; const untilKey = query.date || query.dateTo; const end = untilKey ? new Date(parseDateTimeInTimeZone(`${untilKey}T00:00:00`, company.timezone).getTime() + 86400000) : undefined;
  const where: Prisma.RestaurantReservationWhereInput = { company_id: companyId, ...(start || end ? { start_time: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } } : {}), ...(query.status ? { status: query.status } : {}), ...(query.source ? { source: query.source } : {}), ...(query.tableId ? { table_id: query.tableId } : {}), ...(query.diningAreaId ? { table: { dining_area_id: query.diningAreaId } } : {}), ...(query.search ? { OR: [{ customer_name: { contains: query.search } }, { customer_phone: { contains: query.search.replace(/\D/g, '') } }, { customer_email: { contains: query.search } }, { reservation_code: { contains: query.search } }] } : {}) };
  const [total, items] = await prisma.$transaction([prisma.restaurantReservation.count({ where }), prisma.restaurantReservation.findMany({ where, include: reservationInclude, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: query.sort === 'created_at_desc' ? { created_at: 'desc' } : { start_time: query.sort === 'start_time_desc' ? 'desc' : 'asc' } })]); return ok({ items, pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit), hasNextPage: query.page * query.limit < total } }); }
