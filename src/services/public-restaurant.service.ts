import { Prisma, RestaurantDepositMode, RestaurantNotificationEvent, RestaurantReservationStatus, type RestaurantSettings } from '@prisma/client';
import { prisma } from '../prisma/client';
import { isCompanyAvailableNow } from '../utils/company-availability';
import { parseDateTimeInTimeZone } from '../utils/timezone';
import { canonicalizePhoneParts } from '../utils/phoneNormalization';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';
import { generateRestaurantReservationCode, resolveRestaurantCustomer, selectRestaurantTable } from './restaurant-reservation.service';
import { notifyRestaurantReservation, notifyRestaurantReservationGuests } from './restaurant-notification.service';
import { ensureReservationDeposit, publicDepositStatus, uploadPublicReservationProof } from './restaurant-deposit.service';
import {
  listActiveRestaurantServicePeriods,
  localDayOfWeek,
  timeToMinutes,
} from './restaurant-schedule.service';

type Result = { code: number; error: boolean; message: string; data?: unknown };
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });
const NOT_FOUND = 'No encontramos la reserva o el restaurante solicitado.';

type DbClient = typeof prisma | Prisma.TransactionClient;
type PublicRestaurantContext = {
  id: number; slug: string; name: string; timezone: string; logo_url: string | null; address: string | null; phone_prefix: string;
  is_active: boolean; deleted_at: Date | null; availableUntil: Date; restaurant_enabled: boolean; restaurant_settings: RestaurantSettings; company_settings: { send_whatsapp_notifications: boolean } | null;
};
type PublicContext = PublicRestaurantContext | null;

function localDate(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function localTime(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
function addLocalDays(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function validDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(new Date(`${date}T12:00:00Z`).getTime()) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date; }
function normalizeText(value?: string | null) { const result = value?.trim(); return result || null; }
function normalizeGuests(guests: Array<{ name: string; phone: string; phonePrefix?: string | null }>, defaultPrefix: string, hostPhone: string | null) {
  const normalized = guests.map((guest) => {
    const phone = canonicalizePhoneParts({ phoneNumber: guest.phone, phonePrefix: guest.phonePrefix, defaultPrefix });
    if (!phone.fullPhone || phone.fullPhone.length < 6) throw Object.assign(new Error('Ingresá un WhatsApp válido para cada acompañante.'), { status: 400 });
    return { name: guest.name.trim(), whatsapp_phone: phone.fullPhone };
  });
  const phones = normalized.map((guest) => guest.whatsapp_phone);
  if (new Set(phones).size !== phones.length) throw Object.assign(new Error('No repitas el mismo WhatsApp entre acompañantes.'), { status: 400 });
  if (hostPhone && phones.includes(hostPhone)) throw Object.assign(new Error('No agregues tu propio WhatsApp como acompañante.'), { status: 400 });
  return normalized;
}

async function loadPublicContext(slug: string, db: DbClient = prisma) {
  const company = await db.company.findUnique({ where: { slug }, select: {
    id: true, slug: true, name: true, timezone: true, logo_url: true, address: true, phone_prefix: true,
    is_active: true, deleted_at: true, availableUntil: true, restaurant_enabled: true, restaurant_settings: true, company_settings: { select: { send_whatsapp_notifications: true } },
  } });
  if (!company || !isCompanyAvailableNow(company) || !company.restaurant_enabled || !company.restaurant_settings) return null;
  if (!await isFeatureEnabledForCompany(company.id, 'RESTAURANT_MODULE', db)) return null;
  return company as PublicRestaurantContext;
}

function validateDateAndParty(context: NonNullable<PublicContext>, date: string, partySize: number) {
  if (!validDate(date)) throw Object.assign(new Error('Fecha inválida.'), { status: 400 });
  const today = localDate(new Date(), context.timezone);
  if (date < today || date > addLocalDays(today, context.restaurant_settings.maximum_advance_days)) throw Object.assign(new Error('La fecha está fuera de la ventana de reservas permitida.'), { status: 400 });
  if (!Number.isInteger(partySize) || partySize < context.restaurant_settings.minimum_party_size || partySize > context.restaurant_settings.maximum_party_size) throw Object.assign(new Error('El tamaño del grupo no cumple la configuración del restaurante.'), { status: 400 });
}

function slotTimes(context: NonNullable<PublicContext>, date: string, db: DbClient = prisma) {
  const settings = context.restaurant_settings;
  return listActiveRestaurantServicePeriods(context.id, localDayOfWeek(date), db).then((periods) => {
    const candidates = new Set<string>();
    for (const period of periods) {
      const [startHour, startMinute] = period.start_time.split(':').map(Number);
      const [endHour, endMinute] = period.end_time.split(':').map(Number);
      const start = startHour * 60 + startMinute, end = endHour * 60 + endMinute;
      for (let minute = start; minute + settings.average_dining_minutes <= end; minute += settings.slot_interval_minutes) {
        candidates.add(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
      }
    }
    return [...candidates].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  });
}

async function validSlot(context: NonNullable<PublicContext>, date: string, time: string, db: DbClient = prisma) {
  const slots = await slotTimes(context, date, db);
  if (!slots.includes(time)) throw Object.assign(new Error('La hora elegida no es una opción válida de reserva.'), { status: 409 });
  const start = parseDateTimeInTimeZone(`${date}T${time}:00`, context.timezone);
  const earliest = new Date(Date.now() + context.restaurant_settings.minimum_advance_minutes * 60_000);
  if (start.getTime() < earliest.getTime()) throw Object.assign(new Error('La reserva no cumple la anticipación mínima.'), { status: 400 });
  return { start, end: new Date(start.getTime() + context.restaurant_settings.average_dining_minutes * 60_000) };
}

function publicReservation(reservation: any, context: { name: string; slug: string; logo_url: string | null; timezone: string; restaurant_settings: { allow_customer_cancellation: boolean; cancellation_limit_minutes: number } }, deposit?: any) {
  const deadline = new Date(reservation.start_time.getTime() - context.restaurant_settings.cancellation_limit_minutes * 60_000);
  const canCancel = context.restaurant_settings.allow_customer_cancellation && ['PENDING', 'CONFIRMED'].includes(reservation.status) && new Date() < deadline;
  return {
    code: reservation.reservation_code, status: reservation.status, date: localDate(reservation.start_time, context.timezone), time: localTime(reservation.start_time, context.timezone), partySize: reservation.party_size,
    customerName: reservation.customer_name, notes: reservation.notes, depositAmountCents: reservation.deposit_amount_cents ?? 0, depositMode: reservation.deposit_mode ?? null, deposit: deposit ?? null, canCancel,
    cancellationDeadline: new Intl.DateTimeFormat('sv-SE', { timeZone: context.timezone, dateStyle: 'short', timeStyle: 'short', hour12: false }).format(deadline),
    restaurant: { name: context.name, slug: context.slug, logoUrl: context.logo_url },
  };
}

export async function getConfiguration(slug: string): Promise<Result> {
  const context = await loadPublicContext(slug); if (!context) return fail(404, NOT_FOUND);
  const s = context.restaurant_settings;
  return ok({ company: { slug: context.slug, name: context.name, timezone: context.timezone, logoUrl: context.logo_url, address: context.address }, restaurant: {
    minimumPartySize: s.minimum_party_size, maximumPartySize: s.maximum_party_size, minimumAdvanceMinutes: s.minimum_advance_minutes, maximumAdvanceDays: s.maximum_advance_days, slotIntervalMinutes: s.slot_interval_minutes, averageDiningMinutes: s.average_dining_minutes, requirePhone: s.require_phone, requireEmail: s.require_email, allowCustomerCancellation: s.allow_customer_cancellation, autoConfirmReservations: s.auto_confirm_reservations, guestWhatsappInvitationsEnabled: context.company_settings?.send_whatsapp_notifications ?? false, depositEnabled: s.deposit_enabled, depositAmountCents: s.deposit_amount_cents, depositMode: s.deposit_mode, depositQrImageUrl: s.deposit_qr_image_url, phonePrefix: context.phone_prefix,
  } });
}

export async function getAvailability(slug: string, input: { date: string; partySize: number }): Promise<Result> {
  try {
    const context = await loadPublicContext(slug); if (!context) return fail(404, NOT_FOUND);
    validateDateAndParty(context, input.date, input.partySize);
    const candidates = await slotTimes(context, input.date);
    const earliest = new Date(Date.now() + context.restaurant_settings.minimum_advance_minutes * 60_000);
    const activeTables = await prisma.restaurantTable.findMany({ where: { company_id: context.id, is_active: true, dining_area: { is_active: true }, maximum_seats: { gte: input.partySize } }, select: { id: true } });
    const slots = await Promise.all(candidates.map(async (time) => {
      const start = parseDateTimeInTimeZone(`${input.date}T${time}:00`, context.timezone);
      if (start < earliest) return { time, available: false };
      const end = new Date(start.getTime() + context.restaurant_settings.average_dining_minutes * 60_000);
      const tableIds = activeTables.map((table) => table.id);
      const conflict = activeTables.length ? await prisma.restaurantReservation.findFirst({ where: { company_id: context.id, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED'] }, start_time: { lt: end }, end_time: { gt: start }, OR: [{ table_id: { in: tableIds } }, { combination: { company_id: context.id, tables: { some: { company_id: context.id, table_id: { in: tableIds } } } } }] }, select: { table_id: true, combination: { select: { tables: { select: { table_id: true } } } } } }) : null;
      if (!activeTables.length) return { time, available: false };
      if (!conflict) return { time, available: true };
      const occupied = await prisma.restaurantReservation.findMany({ where: { company_id: context.id, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED'] }, start_time: { lt: end }, end_time: { gt: start }, OR: [{ table_id: { in: tableIds } }, { combination: { company_id: context.id, tables: { some: { company_id: context.id, table_id: { in: tableIds } } } } }] }, select: { table_id: true, combination: { select: { tables: { select: { table_id: true } } } } } });
      // Count the occupied tables, not reservation records. This remains correct even
      // if historical or imported data contains more than one overlap for a table.
      const occupiedTableIds = new Set<number>();
      for (const reservation of occupied) {
        if (reservation.table_id !== null) occupiedTableIds.add(reservation.table_id);
        for (const part of reservation.combination?.tables || []) occupiedTableIds.add(part.table_id);
      }
      return { time, available: occupiedTableIds.size < activeTables.length };
    }));
    return ok({ date: input.date, partySize: input.partySize, timezone: context.timezone, slots });
  } catch (error: any) { return fail(error.status || 500, error.message || 'No pudimos consultar horarios disponibles.'); }
}

export async function uploadReservationDepositProof(slug: string, reservationCode: string, file: { buffer: Buffer; mimetype: string; originalname: string } | undefined, uploadIntent: string | null = null): Promise<Result> {
  return uploadPublicReservationProof(slug, reservationCode, file, uploadIntent);
}

export async function createPublicReservation(slug: string, input: any): Promise<Result> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const context = await loadPublicContext(slug, tx); if (!context) throw Object.assign(new Error(NOT_FOUND), { status: 404 });
      validateDateAndParty(context, input.date, input.partySize);
      const phone = canonicalizePhoneParts({ phoneNumber: input.customer.phone, phonePrefix: input.customer.phonePrefix, defaultPrefix: context.phone_prefix });
      if (context.restaurant_settings.require_phone && !phone.phoneNumber) throw Object.assign(new Error('El teléfono es obligatorio.'), { status: 400 });
      if (context.restaurant_settings.require_email && !normalizeText(input.customer.email)) throw Object.assign(new Error('El correo electrónico es obligatorio.'), { status: 400 });
      const { start, end } = await validSlot(context, input.date, input.time, tx);
      const table = await selectRestaurantTable(tx, context.id, input.partySize, start, end);
      const guests = normalizeGuests(input.guests ?? [], context.phone_prefix, phone.fullPhone);
      if (guests.length > input.partySize - 1) throw Object.assign(new Error('La cantidad de acompañantes supera el tamaño del grupo.'), { status: 400 });
      const customerProfileId = await resolveRestaurantCustomer(tx, context.id, context.phone_prefix, { customer_name: input.customer.name, customer_phone: phone.phoneNumber, customer_phone_prefix: phone.phonePrefix, customer_email: input.customer.email });
      const status: RestaurantReservationStatus = context.restaurant_settings.deposit_enabled && context.restaurant_settings.deposit_amount_cents > 0
        ? 'PENDING'
        : (context.restaurant_settings.auto_confirm_reservations ? 'CONFIRMED' : 'PENDING');
      const depositAmount = context.restaurant_settings.deposit_enabled
        ? context.restaurant_settings.deposit_amount_cents * (context.restaurant_settings.deposit_mode === RestaurantDepositMode.PER_PERSON ? input.partySize : 1)
        : 0;
      if (input.depositProofImageUrl) throw Object.assign(new Error('El comprobante se carga después de crear la reserva, usando su código.'), { status: 400 });
      for (let attempts = 0; attempts < 3; attempts += 1) {
        try {
          const reservation = await tx.restaurantReservation.create({ data: { company_id: context.id, customer_profile_id: customerProfileId, table_id: table.id, reservation_code: generateRestaurantReservationCode(), reservation_date: parseDateTimeInTimeZone(`${input.date}T00:00:00`, context.timezone), start_time: start, end_time: end, party_size: input.partySize, customer_name: input.customer.name.trim(), customer_phone: phone.fullPhone, customer_email: normalizeText(input.customer.email)?.toLowerCase(), deposit_amount_cents: depositAmount, deposit_mode: depositAmount > 0 ? context.restaurant_settings.deposit_mode : null, deposit_proof_image_url: null, notes: normalizeText(input.notes), status, source: 'ONLINE', guests: { create: guests } } });
          await tx.restaurantReservationAssignment.create({ data: { company_id: context.id, reservation_id: reservation.id, table_id: table.id, assigned_by_user_id: null, reason: 'Asignación inicial de la reserva pública.' } });
          await tx.restaurantAuditLog.create({ data: { company_id: context.id, actor_user_id: null, reservation_id: reservation.id, table_id: table.id, event: 'RESERVATION_CREATED', target_type: 'RESTAURANT_RESERVATION', target_id: String(reservation.id), new_values: { status: reservation.status, table_id: table.id, party_size: reservation.party_size, source: reservation.source } } });
          await ensureReservationDeposit(tx, context.id, reservation.id, reservation.party_size, reservation.start_time);
          return reservation;
        }
        catch (error: any) { if (error?.code !== 'P2002' || attempts === 2) throw error; }
      }
      throw new Error('No pudimos generar el código de reserva.');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const context = await loadPublicContext(slug); if (!context) return fail(404, NOT_FOUND);
    if (result.status === 'PENDING' || result.status === 'CONFIRMED') {
      try { await notifyRestaurantReservation({ companyId: result.company_id, reservationId: result.id, event: result.status === 'PENDING' ? RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED : RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED }); } catch { /* The committed public reservation remains valid. */ }
      try { await notifyRestaurantReservationGuests({ companyId: result.company_id, reservationId: result.id }); } catch { /* Guest invitations never invalidate a reservation. */ }
    }
    const deposit = await publicDepositStatus(result.company_id, result.id);
    return ok({ reservation: { ...publicReservation(result, context, deposit), publicUrl: `/shop/${context.slug}/reservation/${result.reservation_code}` }, message: result.status === 'CONFIRMED' ? 'Tu reserva está confirmada.' : 'Tu solicitud de reserva fue recibida y está pendiente de confirmación.' }, 'Reserva creada.', 201);
  } catch (error: any) { const conflict = error?.status === 409 || error?.code === 'P2034'; return fail(conflict ? 409 : (error?.status || 500), conflict ? 'Ese horario acaba de dejar de estar disponible. Selecciona otro horario.' : (error?.message || 'No pudimos crear la reserva.')); }
}

export async function getPublicReservation(code: string): Promise<Result> {
  const reservation = await prisma.restaurantReservation.findUnique({ where: { reservation_code: code }, select: { id: true, company_id: true, reservation_code: true, status: true, start_time: true, party_size: true, customer_name: true, notes: true, deposit_amount_cents: true, deposit_mode: true, company: { select: { slug: true } } } });
  if (!reservation) return fail(404, NOT_FOUND);
  const context = await loadPublicContext(reservation.company.slug); if (!context) return fail(404, NOT_FOUND);
  return ok({ reservation: publicReservation(reservation, context, await publicDepositStatus(reservation.company_id, reservation.id)) });
}

export async function getMyPublicReservations(slug: string, userId: string): Promise<Result> {
  const context = await loadPublicContext(slug);
  if (!context) return fail(404, NOT_FOUND);
  const reservations = await prisma.restaurantReservation.findMany({
    where: { company_id: context.id, customer_profile: { user_id: userId } },
    select: { id: true, company_id: true, reservation_code: true, status: true, start_time: true, party_size: true, customer_name: true, notes: true, deposit_amount_cents: true, deposit_mode: true },
    orderBy: { start_time: 'desc' },
    take: 100,
  });
  return ok({ reservations: await Promise.all(reservations.map(async (reservation) => publicReservation(reservation, context, await publicDepositStatus(reservation.company_id, reservation.id)))) });
}

export async function cancelPublicReservation(code: string, reason?: string): Promise<Result> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.restaurantReservation.findUnique({ where: { reservation_code: code }, select: { id: true, status: true, start_time: true, reservation_code: true, party_size: true, customer_name: true, notes: true, deposit_amount_cents: true, deposit_mode: true, company: { select: { slug: true } } } });
      if (!reservation) throw Object.assign(new Error(NOT_FOUND), { status: 404 });
      const context = await loadPublicContext(reservation.company.slug, tx); if (!context) throw Object.assign(new Error(NOT_FOUND), { status: 404 });
      await tx.$queryRaw`SELECT id FROM restaurant_reservation WHERE company_id = ${context.id} AND id = ${reservation.id} FOR UPDATE`;
      if (reservation.status === 'CANCELLED') return { reservation, context, didCancel: false, notificationReservationId: reservation.id };
      const deadline = new Date(reservation.start_time.getTime() - context.restaurant_settings.cancellation_limit_minutes * 60_000);
      if (!context.restaurant_settings.allow_customer_cancellation || !['PENDING', 'CONFIRMED'].includes(reservation.status) || new Date() >= deadline) throw Object.assign(new Error('El plazo para cancelar esta reserva ya terminó. Comunícate directamente con el restaurante.'), { status: 409 });
      const now = new Date();
      const changed = await tx.restaurantReservation.updateMany({ where: { company_id: context.id, id: reservation.id, status: reservation.status }, data: { status: 'CANCELLED', cancelled_at: now, cancellation_reason: normalizeText(reason) } });
      if (changed.count !== 1) throw Object.assign(new Error('La reserva cambió mientras se cancelaba.'), { status: 409 });
      const updated = await tx.restaurantReservation.findFirst({ where: { company_id: context.id, id: reservation.id }, select: { reservation_code: true, status: true, start_time: true, party_size: true, customer_name: true, notes: true, deposit_amount_cents: true, deposit_mode: true } });
      if (!updated) throw Object.assign(new Error(NOT_FOUND), { status: 404 });
      const assignments = await tx.restaurantReservationAssignment.findMany({ where: { company_id: context.id, reservation_id: reservation.id, released_at: null }, select: { id: true } });
      if (assignments.length) await tx.restaurantReservationAssignment.updateMany({ where: { company_id: context.id, id: { in: assignments.map((assignment) => assignment.id) }, released_at: null }, data: { released_at: now } });
      await tx.restaurantAuditLog.create({ data: { company_id: context.id, actor_user_id: null, reservation_id: reservation.id, event: 'RESERVATION_ASSIGNMENTS_RELEASED', target_type: 'RESTAURANT_RESERVATION', target_id: String(reservation.id), metadata: { reason: 'CUSTOMER_CANCELLED', released_count: assignments.length } } });
      await tx.restaurantAuditLog.create({ data: { company_id: context.id, actor_user_id: null, reservation_id: reservation.id, event: 'RESERVATION_STATUS_CHANGED', target_type: 'RESTAURANT_RESERVATION', target_id: String(reservation.id), metadata: { reason: normalizeText(reason), actor: 'CUSTOMER' }, previous_values: { status: reservation.status }, new_values: { status: 'CANCELLED' } } });
      return { reservation: updated, context, didCancel: true, notificationReservationId: reservation.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.didCancel) { try { await notifyRestaurantReservation({ companyId: result.context.id, reservationId: result.notificationReservationId, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CANCELLED, cancellationActor: 'CUSTOMER' }); } catch { /* cancellation remains committed */ } }
    return ok({ reservation: publicReservation(result.reservation, result.context) }, result.didCancel ? 'Tu reserva fue cancelada correctamente.' : 'La reserva ya estaba cancelada.');
  } catch (error: any) { return fail(error.status || 500, error.message || 'No pudimos cancelar la reserva.'); }
}
