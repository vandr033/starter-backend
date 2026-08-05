import { Prisma, RestaurantReservationStatus, RestaurantVisitPaymentMethod, RestaurantVisitStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { parseDateTimeInTimeZone } from '../utils/timezone';

type Result = { code: number; error: boolean; message: string; data?: unknown };
type VisitInput = {
  id?: number;
  reservation_id?: number | null;
  shift_id?: number | null;
  table_id?: number | null;
  combination_session_id?: number | null;
  primary_waiter_user_id?: string | null;
  guest_count?: number;
  subtotal_amount_cents?: number;
  discount_amount_cents?: number;
  tip_amount_cents?: number;
  total_paid_amount_cents?: number;
  payment_method?: RestaurantVisitPaymentMethod;
  mixed_payment_breakdown?: Record<string, number> | null;
  pos_reference?: string | null;
  closing_notes?: string | null;
  complete?: boolean;
};
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });
const completedStates = [RestaurantVisitStatus.CLOSED, RestaurantVisitStatus.REOPENED];
const MAX_MONEY_CENTS = 2_000_000_000;

function integer(value: unknown, fallback = 0) { return value === undefined ? fallback : Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null; }
function userLabel(user: any) { return user ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.name || user.email || null : null; }
function localDate(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function nextDate(value: string) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function localBounds(timezone: string, dateFrom?: string, dateTo?: string) {
  return {
    ...(dateFrom || dateTo ? {
      closed_at: {
        ...(dateFrom ? { gte: parseDateTimeInTimeZone(`${dateFrom}T00:00:00`, timezone) } : {}),
        ...(dateTo ? { lt: parseDateTimeInTimeZone(`${nextDate(dateTo)}T00:00:00`, timezone) } : {}),
      },
    } : {}),
  };
}
function safeVisit(visit: any) {
  if (!visit) return null;
  return {
    ...visit,
    primary_waiter: visit.primary_waiter ? { id: visit.primary_waiter.id, name: userLabel(visit.primary_waiter) } : null,
    closed_by: visit.closed_by ? { id: visit.closed_by.id, name: userLabel(visit.closed_by) } : null,
    reopened_by: visit.reopened_by ? { id: visit.reopened_by.id, name: userLabel(visit.reopened_by) } : null,
  };
}

async function loadVisit(tx: Prisma.TransactionClient, companyId: number, id?: number, reservationId?: number | null) {
  if (id) return tx.restaurantVisit.findFirst({ where: { id, company_id: companyId }, include: { reservation: true, shift: true, table: { include: { dining_area: true } }, combination_session: true, primary_waiter: true, closed_by: true, reopened_by: true } });
  if (reservationId) return tx.restaurantVisit.findFirst({ where: { company_id: companyId, reservation_id: reservationId }, include: { reservation: true, shift: true, table: { include: { dining_area: true } }, combination_session: true, primary_waiter: true, closed_by: true, reopened_by: true } });
  return null;
}

async function ensureMembership(tx: Prisma.TransactionClient, companyId: number, userId: string) {
  const membership = await tx.companyUser.findFirst({ where: { company_id: companyId, user_id: userId, deleted_at: null }, include: { user: { select: { id: true, name: true, first_name: true, last_name: true, email: true, is_active: true, deleted_at: true } } } });
  if (!membership || !membership.user.is_active || membership.user.deleted_at) throw Object.assign(new Error('El mozo seleccionado no pertenece a la empresa o está inactivo.'), { status: 400 });
  return membership.user;
}

async function activeShift(tx: Prisma.TransactionClient, companyId: number, shiftId: number | null | undefined, at: Date) {
  if (shiftId) {
    const shift = await tx.restaurantShift.findFirst({ where: { id: shiftId, company_id: companyId } });
    if (!shift) throw Object.assign(new Error('El turno no pertenece a la empresa.'), { status: 400 });
    return shift;
  }
  return tx.restaurantShift.findFirst({ where: { company_id: companyId, status: 'OPEN', start_at: { lte: at }, end_at: { gt: at } }, orderBy: { start_at: 'desc' } });
}

async function validateFinancialInput(input: VisitInput, existing?: any) {
  const guestCount = integer(input.guest_count, existing?.guest_count ?? 1);
  const subtotal = integer(input.subtotal_amount_cents, existing?.subtotal_amount_cents ?? 0);
  const discount = integer(input.discount_amount_cents, existing?.discount_amount_cents ?? 0);
  const tip = integer(input.tip_amount_cents, existing?.tip_amount_cents ?? 0);
  const total = integer(input.total_paid_amount_cents, existing?.total_paid_amount_cents ?? 0);
  if (guestCount === null || guestCount < 1 || guestCount > 100) throw Object.assign(new Error('La cantidad de comensales no es válida.'), { status: 400 });
  if (subtotal === null || discount === null || tip === null || total === null || [subtotal, discount, tip, total].some((value) => value > MAX_MONEY_CENTS) || discount > subtotal) throw Object.assign(new Error('Los importes deben ser enteros no negativos y el descuento no puede superar el subtotal.'), { status: 400 });
  const paymentMethod = input.payment_method || existing?.payment_method || RestaurantVisitPaymentMethod.OTHER;
  const breakdown = paymentMethod === RestaurantVisitPaymentMethod.MIXED && input.mixed_payment_breakdown === undefined ? existing?.mixed_payment_breakdown : input.mixed_payment_breakdown;
  if (paymentMethod === RestaurantVisitPaymentMethod.MIXED) {
    if (!breakdown || typeof breakdown !== 'object') throw Object.assign(new Error('Indicá el desglose de pagos mixtos.'), { status: 400 });
    const entries = Object.entries(breakdown);
    const values = entries.map(([, value]) => value) as unknown[];
    const sum = values.reduce<number>((accumulator, value) => accumulator + (typeof value === 'number' ? value : 0), 0);
    if (entries.length > 8 || entries.some(([key, value]) => key.length > 40 || !Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > MAX_MONEY_CENTS) || !Number.isSafeInteger(sum) || sum > MAX_MONEY_CENTS || sum !== total) throw Object.assign(new Error('El desglose de pagos mixtos debe coincidir con el total pagado.'), { status: 400 });
  }
  return { guestCount, subtotal, discount, tip, total, paymentMethod, breakdown: paymentMethod === RestaurantVisitPaymentMethod.MIXED ? breakdown || null : null };
}

export async function saveVisit(companyId: number, actorUserId: string, input: VisitInput, waiterOnly = false): Promise<Result> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      let existing = await loadVisit(tx, companyId, input.id, input.reservation_id);
      if (input.id) {
        await tx.$queryRaw`SELECT id FROM restaurant_visit WHERE company_id = ${companyId} AND id = ${input.id} FOR UPDATE`;
        existing = await loadVisit(tx, companyId, input.id, undefined);
      }
      if (input.id && !existing) throw Object.assign(new Error('No encontramos la visita.'), { status: 404 });
      if (existing && input.reservation_id !== undefined && input.reservation_id !== existing.reservation_id) throw Object.assign(new Error('La visita ya está vinculada a otra reserva.'), { status: 409 });
      if (waiterOnly && existing && !([RestaurantVisitStatus.DRAFT, RestaurantVisitStatus.REOPENED] as RestaurantVisitStatus[]).includes(existing.status)) throw Object.assign(new Error('Un mozo solo puede editar consumos abiertos o reabiertos.'), { status: 403 });
      if (existing?.reservation && existing.reservation.company_id !== companyId) throw Object.assign(new Error('La reserva vinculada no pertenece a la empresa.'), { status: 409 });
      if (existing?.shift && existing.shift.company_id !== companyId) throw Object.assign(new Error('El turno vinculado no pertenece a la empresa.'), { status: 409 });
      if (existing?.table && existing.table.company_id !== companyId) throw Object.assign(new Error('La mesa vinculada no pertenece a la empresa.'), { status: 409 });
      let reservation: any = existing?.reservation || null;
      const reservationIdToLock = input.reservation_id ?? existing?.reservation_id ?? null;
      if (reservationIdToLock) {
        await tx.$queryRaw`SELECT id FROM restaurant_reservation WHERE company_id = ${companyId} AND id = ${reservationIdToLock} FOR UPDATE`;
        reservation = await tx.restaurantReservation.findFirst({ where: { id: reservationIdToLock, company_id: companyId }, include: { table: { include: { dining_area: true } }, combination: { include: { tables: { include: { table: { include: { dining_area: true } } } } } } } });
        if (!reservation) throw Object.assign(new Error('La reserva no pertenece a la empresa.'), { status: 404 });
        if (reservation.status === RestaurantReservationStatus.CANCELLED || reservation.status === RestaurantReservationStatus.NO_SHOW) throw Object.assign(new Error('No se puede registrar gasto para una reserva cancelada o ausente.'), { status: 409 });
        if (input.complete === true && existing?.status !== RestaurantVisitStatus.CLOSED && [RestaurantReservationStatus.PENDING, RestaurantReservationStatus.CONFIRMED].includes(reservation.status)) throw Object.assign(new Error('La reserva debe haber llegado o estar sentada antes de cerrar el consumo.'), { status: 409 });
        if (reservation.table && reservation.table.company_id !== companyId) throw Object.assign(new Error('La mesa de la reserva no pertenece a la empresa.'), { status: 409 });
        if (reservation.combination?.tables?.some((part: any) => part.table?.company_id && part.table.company_id !== companyId)) throw Object.assign(new Error('La combinación de la reserva no pertenece a la empresa.'), { status: 409 });
      }
      if (waiterOnly && !reservation && !input.table_id) throw Object.assign(new Error('Un mozo debe asociar el consumo a una mesa asignada.'), { status: 400 });
      const reservationPrimaryTableId = reservation?.table_id ?? reservation?.combination?.tables?.[0]?.table_id ?? null;
      const tableId = input.table_id === undefined ? existing?.table_id ?? reservationPrimaryTableId ?? null : input.table_id;
      const table = tableId ? await tx.restaurantTable.findFirst({ where: { id: tableId, company_id: companyId, is_active: true }, include: { dining_area: true } }) : null;
      if (tableId && !table) throw Object.assign(new Error('La mesa no pertenece a la empresa o está inactiva.'), { status: 400 });
      const combinationSessionId = input.combination_session_id === undefined ? existing?.combination_session_id ?? null : input.combination_session_id;
      const combinationSession = combinationSessionId ? await tx.restaurantTableCombinationSession.findFirst({ where: { id: combinationSessionId, company_id: companyId }, include: { combination: { include: { tables: { include: { table: { include: { dining_area: true } } } } } } } }) : null;
      if (combinationSessionId && !combinationSession) throw Object.assign(new Error('La sesión de combinación no pertenece a la empresa.'), { status: 400 });
      if (combinationSessionId && combinationSession?.status !== 'ACTIVE' && !existing) throw Object.assign(new Error('La sesión de combinación ya fue liberada.'), { status: 409 });
      if (combinationSession?.combination && (combinationSession.combination.company_id !== companyId || combinationSession.combination.tables.some((part: any) => part.table.company_id !== companyId))) throw Object.assign(new Error('La combinación vinculada no pertenece a la empresa.'), { status: 409 });
      if (reservation && combinationSession && combinationSession.reservation_id && combinationSession.reservation_id !== reservation.id) throw Object.assign(new Error('La sesión de combinación no pertenece a la reserva.'), { status: 409 });
      if (reservation && combinationSession && reservation.combination_id && combinationSession.combination_id !== reservation.combination_id) throw Object.assign(new Error('La sesión de combinación no corresponde a la combinación de la reserva.'), { status: 409 });
      if (reservation && tableId) {
        const reservationTableIds = [reservation.table_id, ...(reservation.combination?.tables || []).map((part: any) => part.table_id)].filter((value): value is number => Number.isInteger(value));
        if (!reservationTableIds.includes(tableId)) throw Object.assign(new Error('La mesa no pertenece a la reserva vinculada.'), { status: 409 });
      }
      const shift = await activeShift(tx, companyId, input.shift_id === undefined ? existing?.shift_id ?? null : input.shift_id, new Date());
      const waiter = input.primary_waiter_user_id === undefined ? (existing?.primary_waiter_user_id || (waiterOnly ? actorUserId : null)) : input.primary_waiter_user_id;
      if (waiterOnly && waiter !== actorUserId) throw Object.assign(new Error('Un mozo solo puede registrar consumos a su propio nombre.'), { status: 403 });
      const waiterUser = waiter ? await ensureMembership(tx, companyId, waiter) : null;
      const financial = await validateFinancialInput(input, existing);
      if (waiterOnly) {
        const now = new Date();
        const reservationTableIds = reservation ? [reservation.table_id, ...(reservation.combination?.tables || []).map((part: any) => part.table_id)].filter((value): value is number => Number.isInteger(value)) : [];
        if (reservation && (!tableId || !reservationTableIds.includes(tableId))) throw Object.assign(new Error('Solo podés registrar el consumo de una reserva en una mesa que le pertenece.'), { status: 403 });
        const assigned = waiterUser && tableId && shift ? await tx.restaurantShiftTableAssignment.findFirst({ where: { company_id: companyId, shift_id: shift.id, table_id: tableId, member: { user_id: actorUserId }, shift: { status: 'OPEN', start_at: { lte: now }, end_at: { gt: now } } } }) : null;
        if (!assigned) throw Object.assign(new Error('La mesa no está asignada a tu turno activo.'), { status: 403 });
      }
      const complete = input.complete === true;
      const now = new Date();
      const retainedClosedAt = complete && existing?.status === RestaurantVisitStatus.CLOSED ? existing.closed_at ?? now : null;
      const retainedClosedBy = complete && existing?.status === RestaurantVisitStatus.CLOSED ? existing.closed_by_user_id ?? actorUserId : actorUserId;
      const data: Prisma.RestaurantVisitUncheckedCreateInput = {
        company_id: companyId,
        reservation_id: reservation?.id ?? input.reservation_id ?? null,
        shift_id: shift?.id ?? null,
        table_id: tableId,
        combination_session_id: combinationSession?.id ?? null,
        primary_waiter_user_id: waiter || (waiterOnly ? actorUserId : null),
        primary_waiter_name: waiterUser ? userLabel(waiterUser) : waiterOnly ? userLabel(await ensureMembership(tx, companyId, actorUserId)) : existing?.primary_waiter_name ?? null,
        dining_area_snapshot: table?.dining_area.name || existing?.dining_area_snapshot || null,
        table_name_snapshot: table?.name || existing?.table_name_snapshot || null,
        shift_name_snapshot: shift?.name || existing?.shift_name_snapshot || null,
        guest_count: financial.guestCount,
        subtotal_amount_cents: financial.subtotal,
        discount_amount_cents: financial.discount,
        tip_amount_cents: financial.tip,
        total_paid_amount_cents: financial.total,
        currency: (await tx.company.findUnique({ where: { id: companyId }, select: { currency: true } }))?.currency || 'Bs.',
        payment_method: financial.paymentMethod,
        mixed_payment_breakdown: financial.breakdown ? financial.breakdown as Prisma.InputJsonValue : Prisma.JsonNull,
        pos_reference: input.pos_reference === undefined ? existing?.pos_reference ?? null : input.pos_reference?.trim() || null,
        closing_notes: input.closing_notes === undefined ? existing?.closing_notes ?? null : input.closing_notes?.trim() || null,
        status: complete ? RestaurantVisitStatus.CLOSED : (existing?.status || RestaurantVisitStatus.DRAFT),
        closed_by_user_id: complete ? retainedClosedBy : existing?.closed_by_user_id ?? null,
        closed_at: complete ? retainedClosedAt ?? now : existing?.closed_at ?? null,
      };
      let visit: any;
      if (existing) {
        const updateData: Prisma.RestaurantVisitUncheckedUpdateInput = { ...data };
        delete (updateData as any).company_id; delete (updateData as any).reservation_id;
        visit = await tx.restaurantVisit.update({ where: { id: existing.id }, data: updateData, include: { reservation: true, shift: true, table: { include: { dining_area: true } }, primary_waiter: true, closed_by: true, reopened_by: true } });
      } else {
        visit = await tx.restaurantVisit.create({ data, include: { reservation: true, shift: true, table: { include: { dining_area: true } }, primary_waiter: true, closed_by: true, reopened_by: true } });
      }
      if (complete && (reservation || combinationSession)) {
        if (reservation && (reservation.status === RestaurantReservationStatus.ARRIVED || reservation.status === RestaurantReservationStatus.SEATED)) {
          const reservationChanged = await tx.restaurantReservation.updateMany({ where: { id: reservation.id, company_id: companyId, status: { in: [RestaurantReservationStatus.ARRIVED, RestaurantReservationStatus.SEATED] } }, data: { status: RestaurantReservationStatus.COMPLETED, completed_at: now } });
          if (reservationChanged.count) {
            const assignments = await tx.restaurantReservationAssignment.findMany({ where: { company_id: companyId, reservation_id: reservation.id, released_at: null }, select: { id: true } });
            if (assignments.length) await tx.restaurantReservationAssignment.updateMany({ where: { company_id: companyId, id: { in: assignments.map((assignment) => assignment.id) }, released_at: null }, data: { released_at: now } });
            await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, reservation_id: reservation.id, event: 'RESERVATION_STATUS_CHANGED', target_type: 'RESTAURANT_RESERVATION', target_id: String(reservation.id), metadata: { reason: 'VISIT_COMPLETED', released_assignment_count: assignments.length }, previous_values: { status: reservation.status }, new_values: { status: RestaurantReservationStatus.COMPLETED } } });
          }
        }
        const sessions = reservation
          ? await tx.restaurantTableCombinationSession.findMany({
            where: { company_id: companyId, reservation_id: reservation.id, status: 'ACTIVE' },
            select: { id: true, combination_id: true, combination: { select: { tables: { select: { table_id: true } } } } },
          })
          : combinationSession?.status === 'ACTIVE'
            ? [{ id: combinationSession.id, combination_id: combinationSession.combination_id, combination: { tables: combinationSession.combination.tables.map((part: any) => ({ table_id: part.table_id })) } }]
            : [];
        if (sessions.length) {
          await tx.$queryRaw`SELECT id FROM restaurant_table_combination_session WHERE company_id = ${companyId} AND id IN (${Prisma.join(sessions.map((session) => session.id))}) FOR UPDATE`;
        }
        if (sessions.length) {
          await tx.restaurantTableCombinationSession.updateMany({ where: { company_id: companyId, id: { in: sessions.map((session) => session.id) }, status: 'ACTIVE' }, data: { status: 'RELEASED', released_at: now, released_by_user_id: actorUserId } });
          for (const session of sessions) await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, reservation_id: reservation?.id ?? null, combination_id: session.combination_id, event: 'TABLE_COMBINATION_RELEASED', target_type: 'RESTAURANT_VISIT', target_id: String(visit.id), metadata: { session_id: session.id, reason: 'VISIT_COMPLETED' } } });
        }
        const completionTableIds = new Set<number>();
        if (tableId) completionTableIds.add(tableId);
        for (const session of sessions) for (const part of session.combination.tables) completionTableIds.add(part.table_id);
        if (completionTableIds.size) await tx.$queryRaw`SELECT id FROM restaurant_table WHERE company_id = ${companyId} AND id IN (${Prisma.join([...completionTableIds])}) FOR UPDATE`;
        for (const completionTableId of completionTableIds) {
          const blocking = await tx.restaurantReservation.findFirst({ where: { company_id: companyId, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED'] }, end_time: { gt: now }, OR: [{ table_id: completionTableId }, { combination: { company_id: companyId, tables: { some: { company_id: companyId, table_id: completionTableId } } } }] }, select: { id: true } });
          if (!blocking) await tx.restaurantTableOperationalState.updateMany({ where: { company_id: companyId, table_id: completionTableId }, data: { status: 'CLEANING', status_since: now, cleaning_started_at: now, occupied_at: null, bill_requested_at: null, updated_by_user_id: actorUserId } });
        }
      }
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, shift_id: shift?.id ?? null, table_id: tableId, reservation_id: reservation?.id ?? null, event: complete && existing?.status !== RestaurantVisitStatus.CLOSED ? 'VISIT_COMPLETED' : existing ? 'VISIT_FINANCIALS_UPDATED' : 'VISIT_CREATED', target_type: 'RESTAURANT_VISIT', target_id: String(visit.id), previous_values: existing ? { status: existing.status, total_paid_amount_cents: existing.total_paid_amount_cents, subtotal_amount_cents: existing.subtotal_amount_cents, discount_amount_cents: existing.discount_amount_cents, tip_amount_cents: existing.tip_amount_cents, payment_method: existing.payment_method } : Prisma.JsonNull, new_values: { status: visit.status, total_paid_amount_cents: visit.total_paid_amount_cents, subtotal_amount_cents: visit.subtotal_amount_cents, discount_amount_cents: visit.discount_amount_cents, tip_amount_cents: visit.tip_amount_cents, payment_method: visit.payment_method } } });
      return visit;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return ok(safeVisit(result), input.complete ? 'Visita cerrada.' : 'Consumo guardado.', input.id ? 200 : 201);
  } catch (error: any) {
    const conflict = error?.status === 409 || error?.code === 'P2034' || error?.code === 'P2002';
    return fail(conflict ? 409 : (error?.status || 500), error?.message || 'No pudimos guardar el consumo.');
  }
}

export async function getVisit(companyId: number, id: number): Promise<Result> {
  const visit = await prisma.restaurantVisit.findFirst({ where: { id, company_id: companyId }, include: { reservation: true, shift: true, table: { include: { dining_area: true } }, combination_session: true, primary_waiter: true, closed_by: true, reopened_by: true } });
  return visit ? ok(safeVisit(visit)) : fail(404, 'No encontramos la visita.');
}

export async function listVisits(companyId: number, query: any): Promise<Result> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  if (!company) return fail(404, 'No encontramos la empresa.');
  const where: Prisma.RestaurantVisitWhereInput = { company_id: companyId, ...(query.shift_id ? { shift_id: query.shift_id } : {}), ...(query.waiter_user_id ? { primary_waiter_user_id: query.waiter_user_id } : {}), ...localBounds(company.timezone, query.dateFrom, query.dateTo) };
  const [total, items] = await prisma.$transaction([prisma.restaurantVisit.count({ where }), prisma.restaurantVisit.findMany({ where, include: { reservation: { select: { id: true, reservation_code: true, customer_name: true, party_size: true, source: true } }, shift: true, table: { include: { dining_area: true } }, primary_waiter: true }, orderBy: { closed_at: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit })]);
  return ok({ items: items.map(safeVisit), pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
}

export async function reopenVisit(companyId: number, id: number, actorUserId: string, reason: string): Promise<Result> {
  try {
    const visit = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM restaurant_visit WHERE company_id = ${companyId} AND id = ${id} FOR UPDATE`;
      const existing = await tx.restaurantVisit.findFirst({ where: { id, company_id: companyId } });
      if (!existing) throw Object.assign(new Error('No encontramos la visita.'), { status: 404 });
      if (existing.status !== RestaurantVisitStatus.CLOSED) throw Object.assign(new Error('Solo se pueden reabrir visitas cerradas.'), { status: 409 });
      const changed = await tx.restaurantVisit.updateMany({ where: { id, company_id: companyId, status: RestaurantVisitStatus.CLOSED }, data: { status: RestaurantVisitStatus.REOPENED, reopened_by_user_id: actorUserId, reopened_at: new Date() } });
      if (changed.count !== 1) throw Object.assign(new Error('La visita cambió mientras se reabría.'), { status: 409 });
      const updated = await tx.restaurantVisit.findFirst({ where: { id, company_id: companyId } });
      if (!updated) throw Object.assign(new Error('No encontramos la visita reabierta.'), { status: 404 });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, reservation_id: existing.reservation_id, table_id: existing.table_id, shift_id: existing.shift_id, event: 'VISIT_REOPENED', target_type: 'RESTAURANT_VISIT', target_id: String(id), previous_values: { status: existing.status }, new_values: { status: updated.status }, metadata: { reason: reason.trim().slice(0, 500) } } });
      if (existing.reservation_id) await tx.restaurantReservation.updateMany({ where: { id: existing.reservation_id, company_id: companyId, status: RestaurantReservationStatus.COMPLETED }, data: { status: RestaurantReservationStatus.SEATED, completed_at: null } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return ok(visit, 'Visita reabierta.');
  } catch (error: any) { return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos reabrir la visita.'); }
}

export async function financialMetrics(companyId: number, query: any): Promise<Result> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  if (!company) return fail(404, 'No encontramos la empresa.');
  const bounds = localBounds(company.timezone, query.dateFrom, query.dateTo);
  const where: Prisma.RestaurantVisitWhereInput = { company_id: companyId, status: { in: completedStates }, ...bounds };
  const missingFinancialWhere: Prisma.RestaurantReservationWhereInput = { company_id: companyId, status: RestaurantReservationStatus.COMPLETED, visit: null, ...(bounds.closed_at ? { completed_at: bounds.closed_at } : {}) };
  const [aggregate, paymentGroups, waiterGroups, areaGroups, shiftGroups, tableGroups, detailRows, missingFinancialCapture] = await prisma.$transaction([
    prisma.restaurantVisit.aggregate({ where, _count: { _all: true }, _sum: { guest_count: true, subtotal_amount_cents: true, discount_amount_cents: true, tip_amount_cents: true, total_paid_amount_cents: true } }),
    prisma.restaurantVisit.groupBy({ by: ['payment_method'], where, orderBy: { payment_method: 'asc' }, _count: { _all: true }, _sum: { guest_count: true, total_paid_amount_cents: true, tip_amount_cents: true } }),
    prisma.restaurantVisit.groupBy({ by: ['primary_waiter_user_id', 'primary_waiter_name'], where, orderBy: { primary_waiter_name: 'asc' }, _count: { _all: true }, _sum: { guest_count: true, total_paid_amount_cents: true, tip_amount_cents: true } }),
    prisma.restaurantVisit.groupBy({ by: ['dining_area_snapshot'], where, orderBy: { dining_area_snapshot: 'asc' }, _count: { _all: true }, _sum: { guest_count: true, total_paid_amount_cents: true, tip_amount_cents: true } }),
    prisma.restaurantVisit.groupBy({ by: ['shift_id', 'shift_name_snapshot'], where, orderBy: { shift_name_snapshot: 'asc' }, _count: { _all: true }, _sum: { guest_count: true, total_paid_amount_cents: true, tip_amount_cents: true } }),
    prisma.restaurantVisit.groupBy({ by: ['table_name_snapshot'], where, orderBy: { table_name_snapshot: 'asc' }, _count: { _all: true }, _sum: { guest_count: true, total_paid_amount_cents: true, tip_amount_cents: true } }),
    prisma.restaurantVisit.findMany({ where, select: { closed_at: true, guest_count: true, total_paid_amount_cents: true, tip_amount_cents: true, reservation: { select: { source: true } } } }),
    prisma.restaurantReservation.count({ where: missingFinancialWhere }),
  ]);
  const groups = (items: Array<{ [key: string]: any }>, key: string) => items.map((item) => {
    const visits = item._count?._all || 0;
    const total = item._sum?.total_paid_amount_cents || 0;
    return { key: item[key] == null ? null : item[key], visits, guests: item._sum?.guest_count || 0, total_paid_amount_cents: total, tip_amount_cents: item._sum?.tip_amount_cents || 0, average_spend_cents: visits ? Math.round(total / visits) : 0 };
  });
  const detailGroups = (keyFor: (row: any) => string) => {
    const grouped = new Map<string, { visits: number; guests: number; total_paid_amount_cents: number; tip_amount_cents: number }>();
    for (const row of detailRows) {
      const key = keyFor(row); const current = grouped.get(key) || { visits: 0, guests: 0, total_paid_amount_cents: 0, tip_amount_cents: 0 };
      current.visits += 1; current.guests += row.guest_count || 0; current.total_paid_amount_cents += row.total_paid_amount_cents || 0; current.tip_amount_cents += row.tip_amount_cents || 0; grouped.set(key, current);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => ({ key, ...value, average_spend_cents: value.visits ? Math.round(value.total_paid_amount_cents / value.visits) : 0 }));
  };
  const totalVisits = aggregate._count._all;
  const guests = aggregate._sum.guest_count || 0;
  const totalPaid = aggregate._sum.total_paid_amount_cents || 0;
  return ok({ totals: { visits: totalVisits, guests, subtotal_amount_cents: aggregate._sum.subtotal_amount_cents || 0, discount_amount_cents: aggregate._sum.discount_amount_cents || 0, tip_amount_cents: aggregate._sum.tip_amount_cents || 0, total_paid_amount_cents: totalPaid, average_spend_cents: totalVisits ? Math.round(totalPaid / totalVisits) : 0, average_guest_spend_cents: guests ? Math.round(totalPaid / guests) : 0 }, missing_financial_capture_count: missingFinancialCapture, by_date: detailGroups((row) => row.closed_at ? localDate(row.closed_at, company.timezone) : 'UNKNOWN'), by_table: groups(tableGroups, 'table_name_snapshot'), by_payment_method: groups(paymentGroups, 'payment_method'), by_waiter: groups(waiterGroups, 'primary_waiter_name'), by_area: groups(areaGroups, 'dining_area_snapshot'), by_shift: groups(shiftGroups, 'shift_name_snapshot'), by_source: detailGroups((row) => row.reservation?.source || 'WALK_IN'), by_reservation_source: detailGroups((row) => row.reservation?.source || 'WALK_IN') });
}
