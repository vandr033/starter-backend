import { Prisma, RestaurantCombinationSessionStatus, RestaurantReservationStatus, RestaurantTableOperationalStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { parseDateTimeInTimeZone } from '../utils/timezone';
import { blockingReservationStatuses } from '../repositories/restaurant-reservation.repo';

type Result = { code: number; error: boolean; message: string; data?: unknown };
type Tx = Prisma.TransactionClient;
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });
const activeStatuses = blockingReservationStatuses as RestaurantReservationStatus[];
const unavailableStates = new Set<RestaurantTableOperationalStatus>(['SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED']);

const reservationInclude = {
  table: { include: { dining_area: true } },
  combination: { include: { tables: { include: { table: { include: { dining_area: true } } } } } },
};

function formatUser(user: any) { return user ? { id: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.name || user.email } : null; }
function nowOr(value?: string | Date) { const date = value instanceof Date ? value : value ? new Date(value) : new Date(); return Number.isNaN(date.getTime()) ? null : date; }
function tableIdsForReservation(reservation: any): number[] { return reservation.combination?.tables?.map((item: any) => item.table_id) || (reservation.table_id ? [reservation.table_id] : []); }
function reservationForTable(reservation: any, tableId: number) { return tableIdsForReservation(reservation).includes(tableId); }
function currentOrNext(items: any[], at: Date) { return { current: items.find((item) => item.start_time <= at && item.end_time > at) || null, next: items.find((item) => item.start_time > at) || null }; }
function severity(start: Date, at: Date) { const minutes = Math.round((start.getTime() - at.getTime()) / 60000); return start < at ? 'OVERDUE' : minutes <= 15 ? 'URGENT' : 'WARNING'; }
function effectiveCapacity(table: any) { return table.maximum_seats; }
function combinationCapacity(combination: any) { return combination.tables.reduce((sum: number, item: any) => sum + item.table.maximum_seats, 0); }

async function settingsFor(companyId: number, client: typeof prisma | Tx = prisma) {
  return client.restaurantSettings.findUnique({ where: { company_id: companyId } });
}

async function activeShiftFor(client: typeof prisma | Tx, companyId: number, at: Date, shiftId?: number) {
  return client.restaurantShift.findFirst({ where: { company_id: companyId, ...(shiftId ? { id: shiftId } : {}), status: 'OPEN', start_at: { lte: at }, end_at: { gt: at } }, include: { members: { include: { user: { select: { id: true, name: true, first_name: true, last_name: true, email: true } } } }, table_assignments: { include: { member: { include: { user: { select: { id: true, name: true, first_name: true, last_name: true, email: true } } } } } } } });
}

function shiftAssignments(shift: any) { const map = new Map<number, any>(); for (const assignment of shift?.table_assignments || []) map.set(assignment.table_id, { id: assignment.member.user.id, name: [assignment.member.user.first_name, assignment.member.user.last_name].filter(Boolean).join(' ').trim() || assignment.member.user.name || assignment.member.user.email, role: assignment.member.role }); return map; }

function reservationSummary(reservation: any, at: Date, assignedWaiter?: any) {
  return { id: reservation.id, reservation_code: reservation.reservation_code, customer_name: reservation.customer_name, customer_phone: reservation.customer_phone, party_size: reservation.party_size, start_time: reservation.start_time, end_time: reservation.end_time, status: reservation.status, source: reservation.source, notes: reservation.notes, internal_notes: reservation.internal_notes, table_id: reservation.table_id, combination_id: reservation.combination_id, assigned_waiter: assignedWaiter || null, minutes_until_start: Math.round((reservation.start_time.getTime() - at.getTime()) / 60000) };
}

function riskForReservation(reservation: any, at: Date, settings: any, tableCards: Map<number, any>) {
  const ids = tableIdsForReservation(reservation); if (!ids.length) return null;
  const impacted = ids.map((id) => tableCards.get(id)).filter(Boolean).map((card) => ({ card, current: card.current_reservation })).filter(({ card, current }) => card.blocked || unavailableStates.has(card.operational_status) || (current && current.id !== reservation.id && ['ARRIVED', 'SEATED'].includes(current.status) && current.end_time.getTime() + (settings.turnover_buffer_minutes + settings.cleanup_buffer_minutes) * 60000 > reservation.start_time.getTime()));
  if (!impacted.length) return null;
  const current = impacted.find((item) => item.current)?.current || null;
  return { reservation: reservationSummary(reservation, at, impacted[0].card.assigned_waiter), severity: severity(reservation.start_time, at), reason: impacted.some((item) => item.card.blocked) ? 'La mesa está bloqueada.' : current ? `La reserva actual puede extenderse hasta ${current.end_time.toISOString()}.` : 'La mesa mantiene un estado operativo no disponible.', affected_table_ids: ids, current_reservation: current ? reservationSummary(current, at, impacted[0].card.assigned_waiter) : null };
}

export async function getFloor(companyId: number, atValue?: string | Date, shiftId?: number): Promise<Result> {
  const at = nowOr(atValue); if (!at) return fail(400, 'El momento de consulta no es válido.');
  const settings = await settingsFor(companyId); if (!settings) return fail(404, 'La configuración de restaurante no existe.');
  const horizon = new Date(at.getTime() + 36 * 60 * 60000);
  const [areas, tables, reservations, shift] = await Promise.all([
    prisma.restaurantDiningArea.findMany({ where: { company_id: companyId }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }),
    prisma.restaurantTable.findMany({ where: { company_id: companyId }, include: { dining_area: true, table_state: true }, orderBy: [{ dining_area: { sort_order: 'asc' } }, { sort_order: 'asc' }, { id: 'asc' }] }),
    prisma.restaurantReservation.findMany({ where: { company_id: companyId, status: { in: activeStatuses }, start_time: { lt: horizon }, end_time: { gt: new Date(at.getTime() - 24 * 60 * 60000) } }, include: reservationInclude, orderBy: { start_time: 'asc' } }),
    activeShiftFor(prisma, companyId, at, shiftId),
  ]);
  const assignments = shiftAssignments(shift);
  const byTable = new Map<number, any[]>();
  for (const reservation of reservations) for (const tableId of tableIdsForReservation(reservation)) byTable.set(tableId, [...(byTable.get(tableId) || []), reservation]);
  const cards = new Map<number, any>();
  const tableCards = tables.map((table: any) => {
    const schedule = currentOrNext(byTable.get(table.id) || [], at);
    const state = table.table_state?.company_id === companyId ? table.table_state : null;
    const derived = !table.is_active || !table.dining_area.is_active ? 'BLOCKED' : state?.status === 'BLOCKED' ? 'BLOCKED' : state && ['CLEANING', 'BILL_REQUESTED'].includes(state.status) ? state.status : schedule.current?.status === 'SEATED' ? 'SEATED' : schedule.current?.status === 'ARRIVED' ? 'ARRIVED' : state?.status === 'SEATED' ? 'SEATED' : state?.status === 'ARRIVED' ? 'ARRIVED' : schedule.current ? 'RESERVED' : schedule.next && schedule.next.start_time.getTime() - at.getTime() <= settings.at_risk_warning_window_minutes * 60000 ? 'RESERVED_SOON' : schedule.next ? 'RESERVED' : 'AVAILABLE';
    const card = { id: table.id, name: table.name, capacity: table.maximum_seats, minimum_seats: table.minimum_seats, is_active: table.is_active, dining_area: { id: table.dining_area.id, name: table.dining_area.name, is_active: table.dining_area.is_active }, operational_status: derived, status_since: state?.status_since || null, blocked: !table.is_active || !table.dining_area.is_active || state?.status === 'BLOCKED', blocked_reason: state?.blocked_reason || (!table.is_active || !table.dining_area.is_active ? 'Mesa o área inactiva.' : null), assigned_waiter: assignments.get(table.id) || null, current_reservation: schedule.current ? reservationSummary(schedule.current, at, assignments.get(table.id)) : null, next_reservation: schedule.next ? reservationSummary(schedule.next, at, assignments.get(table.id)) : null, combined: null as any };
    cards.set(table.id, card); return card;
  });
  const combinations = await prisma.restaurantTableCombination.findMany({ where: { company_id: companyId, is_active: true }, include: { dining_area: true, tables: { include: { table: { include: { dining_area: true, table_state: true } } } }, sessions: { where: { status: 'ACTIVE', start_at: { lt: horizon }, end_at: { gt: at } } } } });
  const activeCombinations = combinations.filter((combination: any) => combination.sessions.some((session: any) => session.start_at <= at && session.end_at > at));
  for (const combination of activeCombinations) for (const item of combination.tables) { const card = cards.get(item.table_id); if (card) card.combined = { id: combination.id, name: combination.name, capacity: combinationCapacity(combination), table_ids: combination.tables.map((part: any) => part.table_id) }; }
  const atRisk = reservations.filter((reservation: any) => reservation.start_time >= new Date(at.getTime() - 30 * 60000) && reservation.start_time <= new Date(at.getTime() + settings.at_risk_warning_window_minutes * 60000)).map((reservation: any) => riskForReservation(reservation, at, settings, cards)).filter(Boolean);
  const grouped = areas.map((area: any) => ({ ...area, tables: tableCards.filter((table: any) => table.dining_area.id === area.id) }));
  return ok({ generated_at: new Date().toISOString(), at: at.toISOString(), settings: { average_dining_minutes: settings.average_dining_minutes, turnover_buffer_minutes: settings.turnover_buffer_minutes, cleanup_buffer_minutes: settings.cleanup_buffer_minutes, at_risk_warning_window_minutes: settings.at_risk_warning_window_minutes }, shift: shift ? { id: shift.id, name: shift.name, status: shift.status, start_at: shift.start_at, end_at: shift.end_at, members: shift.members.map((member: any) => ({ id: member.user_id, name: [member.user.first_name, member.user.last_name].filter(Boolean).join(' ').trim() || member.user.name || member.user.email, role: member.role })) } : null, dining_areas: grouped, tables: tableCards, at_risk: atRisk });
}

async function findTargetReservation(companyId: number, reservationId: number, client: typeof prisma | Tx = prisma) { return client.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId, status: { in: activeStatuses } }, include: reservationInclude }); }
async function candidateReservations(client: typeof prisma | Tx, companyId: number, start: Date, end: Date, excludeReservationId: number) { return client.restaurantReservation.findMany({ where: { company_id: companyId, id: { not: excludeReservationId }, status: { in: activeStatuses }, start_time: { lt: new Date(end.getTime() + 2 * 60 * 60000) }, end_time: { gt: new Date(start.getTime() - 2 * 60 * 60000) } }, include: { combination: { include: { tables: { select: { table_id: true } } } } } }); }
function overlapForTable(reservations: any[], tableId: number, start: Date, end: Date, bufferMinutes: number) { return reservations.find((reservation) => tableIdsForReservation(reservation).includes(tableId) && reservation.start_time.getTime() < end.getTime() + bufferMinutes * 60000 && reservation.end_time.getTime() > start.getTime() - bufferMinutes * 60000); }
function reasonsForCandidate(candidate: any, reservation: any, preferredAreaId: number | null, waiter: any, noImpact: boolean) { const reasons: string[] = []; if (candidate.capacity - reservation.party_size === 0) reasons.push('Capacidad exacta'); else reasons.push(`Capacidad ${candidate.capacity} para ${reservation.party_size}`); if (preferredAreaId && candidate.dining_area_id === preferredAreaId) reasons.push('Misma área preferida'); if (noImpact) reasons.push('No afecta reservas posteriores'); if (waiter) reasons.push('Conserva el mozo asignado'); if (candidate.combination_id) reasons.push('Configuración combinada permitida'); return reasons; }

export async function alternatives(companyId: number, reservationId: number, atValue?: string | Date): Promise<Result> {
  const reservation: any = await findTargetReservation(companyId, reservationId); if (!reservation) return fail(404, 'No encontramos la reserva.');
  const settings = await settingsFor(companyId); if (!settings) return fail(404, 'La configuración de restaurante no existe.');
  const at = nowOr(atValue) || new Date();
  const [tables, combinations, conflicts, states, shift] = await Promise.all([
    prisma.restaurantTable.findMany({ where: { company_id: companyId, is_active: true, dining_area: { is_active: true } }, include: { dining_area: true } }),
    prisma.restaurantTableCombination.findMany({ where: { company_id: companyId, is_active: true }, include: { dining_area: true, tables: { include: { table: { include: { dining_area: true } } } } } }),
    candidateReservations(prisma, companyId, reservation.start_time, reservation.end_time, reservationId),
    prisma.restaurantTableOperationalState.findMany({ where: { company_id: companyId } }),
    activeShiftFor(prisma, companyId, reservation.start_time),
  ]);
  const stateByTable = new Map(states.map((state) => [state.table_id, state])); const waiters = shiftAssignments(shift); const preferredAreaId = reservation.preferred_dining_area_id || reservation.table?.dining_area_id || reservation.combination?.dining_area_id || null; const currentWaiter = reservation.table_id ? waiters.get(reservation.table_id) : null;
  const result: any[] = [];
  for (const table of tables as any[]) {
    const conflict = overlapForTable(conflicts, table.id, reservation.start_time, reservation.end_time, settings.turnover_buffer_minutes + settings.cleanup_buffer_minutes); const state = stateByTable.get(table.id); if (conflict || (state && unavailableStates.has(state.status))) continue;
    const sameArea = preferredAreaId === table.dining_area_id; const noImpact = !conflict; const waiter = waiters.get(table.id); const candidate: any = { candidate_type: 'TABLE', table_id: table.id, combination_id: null, table_ids: [table.id], tables: [{ id: table.id, name: table.name, capacity: table.maximum_seats, dining_area: table.dining_area.name }], capacity: effectiveCapacity(table), dining_area_id: table.dining_area_id, dining_area: table.dining_area.name, requires_combining: false, available_period: { start: new Date(reservation.start_time.getTime() - settings.turnover_buffer_minutes * 60000), end: new Date(reservation.end_time.getTime() + settings.turnover_buffer_minutes * 60000) }, upcoming_reservation_impact: null, assigned_waiter: waiter || null, same_area: sameArea, rank_reasons: reasonsForCandidate({ capacity: table.maximum_seats, dining_area_id: table.dining_area_id, combination_id: null }, reservation, preferredAreaId, currentWaiter && waiter?.id === currentWaiter.id, noImpact) };
    candidate.score = (candidate.capacity === reservation.party_size ? 1000 : 500 - Math.max(0, candidate.capacity - reservation.party_size) * 5) + (sameArea ? 250 : 0) + (noImpact ? 100 : 0) + (currentWaiter && waiter?.id === currentWaiter.id ? 40 : 0); result.push(candidate);
  }
  for (const combination of combinations as any[]) {
    const combinationTableIds = combination.tables.map((item: any) => item.table_id); if (combinationTableIds.length < 2 || combinationTableIds.some((id: number) => { const state = stateByTable.get(id); return state ? unavailableStates.has(state.status) : false; })) continue; const conflict = combinationTableIds.map((id: number) => overlapForTable(conflicts, id, reservation.start_time, reservation.end_time, settings.turnover_buffer_minutes + settings.cleanup_buffer_minutes)).find(Boolean); if (conflict) continue; const capacity = combinationCapacity(combination); const sameArea = Boolean(preferredAreaId && (combination.dining_area_id === preferredAreaId || combination.tables.every((item: any) => item.table.dining_area_id === preferredAreaId))); const assignedWaiter = waiters.get(combinationTableIds[0]); const candidate: any = { candidate_type: 'COMBINATION', table_id: null, combination_id: combination.id, table_ids: combinationTableIds, tables: combination.tables.map((item: any) => ({ id: item.table_id, name: item.table.name, capacity: item.table.maximum_seats, dining_area: item.table.dining_area.name })), capacity, dining_area_id: combination.dining_area_id, dining_area: combination.dining_area?.name || combination.tables[0]?.table.dining_area.name, requires_combining: true, available_period: { start: new Date(reservation.start_time.getTime() - settings.turnover_buffer_minutes * 60000), end: new Date(reservation.end_time.getTime() + settings.turnover_buffer_minutes * 60000) }, upcoming_reservation_impact: null, assigned_waiter: assignedWaiter || null, same_area: sameArea, rank_reasons: reasonsForCandidate({ capacity, dining_area_id: combination.dining_area_id, combination_id: combination.id }, reservation, preferredAreaId, currentWaiter && assignedWaiter?.id === currentWaiter.id, true) }; candidate.score = (capacity === reservation.party_size ? 1000 : 500 - Math.max(0, capacity - reservation.party_size) * 5) + (sameArea ? 250 : 0) + 100 - combinationTableIds.length * 5 + (currentWaiter && assignedWaiter?.id === currentWaiter.id ? 40 : 0); result.push(candidate);
  }
  result.sort((left, right) => right.score - left.score || left.capacity - right.capacity || left.table_ids.length - right.table_ids.length); return ok(result.map(({ score, ...candidate }) => ({ ...candidate, rank: result.findIndex((item) => item.score === score) + 1 })));
}

async function assertCombination(client: Tx, companyId: number, combinationId: number, reservation: any) {
  const combination = await client.restaurantTableCombination.findFirst({ where: { id: combinationId, company_id: companyId, is_active: true }, include: { tables: { include: { table: { include: { dining_area: true } } } }, dining_area: true } });
  if (!combination || combination.tables.length < 2) throw Object.assign(new Error('La combinación no está disponible.'), { status: 409 });
  const ids = combination.tables.map((item) => item.table_id); await client.$queryRaw`SELECT id FROM restaurant_table WHERE company_id = ${companyId} AND id IN (${Prisma.join(ids)}) FOR UPDATE`;
  const conflicts = await candidateReservations(client, companyId, reservation.start_time, reservation.end_time, reservation.id); const conflict = ids.map((id) => overlapForTable(conflicts, id, reservation.start_time, reservation.end_time, 0)).find(Boolean); if (conflict) throw Object.assign(new Error('La combinación ya no está disponible para ese horario.'), { status: 409 }); const activeSession = await client.restaurantTableCombinationSession.findFirst({ where: { company_id: companyId, combination_id: combinationId, status: 'ACTIVE', reservation_id: { not: reservation.id }, start_at: { lt: reservation.end_time }, end_at: { gt: reservation.start_time } } }); if (activeSession) throw Object.assign(new Error('La combinación ya está ocupada en ese horario.'), { status: 409 });
  return combination;
}

async function assertTable(client: Tx, companyId: number, tableId: number, reservation: any) {
  await client.$queryRaw`SELECT id FROM restaurant_table WHERE company_id = ${companyId} AND id = ${tableId} FOR UPDATE`;
  const table = await client.restaurantTable.findFirst({ where: { id: tableId, company_id: companyId, is_active: true, dining_area: { is_active: true } }, include: { dining_area: true } }); if (!table) throw Object.assign(new Error('La mesa no está disponible.'), { status: 409 }); const conflicts = await candidateReservations(client, companyId, reservation.start_time, reservation.end_time, reservation.id); if (overlapForTable(conflicts, tableId, reservation.start_time, reservation.end_time, 0)) throw Object.assign(new Error('La mesa ya no está disponible para ese horario.'), { status: 409 }); return table;
}

export async function relocate(companyId: number, reservationId: number, actorUserId: string, input: { table_id?: number; combination_id?: number; reason?: string | null; initiated_from_at_risk?: boolean }): Promise<Result> {
  try {
    const moved = await prisma.$transaction(async (tx) => {
      const reservation = await findTargetReservation(companyId, reservationId, tx); if (!reservation) throw Object.assign(new Error('No encontramos la reserva.'), { status: 404 });
      const oldTableIds = tableIdsForReservation(reservation); const combination = input.combination_id ? await assertCombination(tx, companyId, input.combination_id, reservation) : null; const table = input.table_id ? await assertTable(tx, companyId, input.table_id, reservation) : null;
      if (!combination && !table) throw Object.assign(new Error('Elegí una mesa o una combinación.'), { status: 400 });
      const activeAssignments = await tx.restaurantReservationAssignment.findMany({ where: { company_id: companyId, reservation_id: reservationId, released_at: null } }); if (activeAssignments.length) await tx.restaurantReservationAssignment.updateMany({ where: { id: { in: activeAssignments.map((item) => item.id) } }, data: { released_at: new Date() } }); else if (oldTableIds.length) await tx.restaurantReservationAssignment.create({ data: { company_id: companyId, reservation_id: reservationId, table_id: reservation.combination_id ? null : reservation.table_id, combination_id: reservation.combination_id || null, assigned_by_user_id: reservation.created_by_user_id || null, reason: 'Asignación histórica reconstruida al reubicar.', assigned_at: reservation.created_at, released_at: new Date() } });
      const newTableIds = combination ? combination.tables.map((item) => item.table_id) : [table!.id];
      await tx.restaurantReservationAssignment.create({ data: { company_id: companyId, reservation_id: reservationId, table_id: combination ? null : table!.id, combination_id: combination?.id || null, assigned_by_user_id: actorUserId, reason: input.reason || (input.initiated_from_at_risk ? 'Reubicación por alerta de riesgo.' : 'Reubicación operativa.') } });
      if (reservation.combination_id) await tx.restaurantTableCombinationSession.updateMany({ where: { company_id: companyId, reservation_id: reservationId, status: 'ACTIVE' }, data: { status: 'RELEASED', released_at: new Date(), released_by_user_id: actorUserId } });
      if (combination) await tx.restaurantTableCombinationSession.create({ data: { company_id: companyId, combination_id: combination.id, reservation_id: reservationId, start_at: reservation.start_time, end_at: reservation.end_time, status: RestaurantCombinationSessionStatus.ACTIVE, created_by_user_id: actorUserId } });
      const updated = await tx.restaurantReservation.update({ where: { id: reservationId }, data: { table_id: combination ? null : table!.id, combination_id: combination?.id || null } });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, event: 'RESERVATION_RELOCATED', reservation_id: reservationId, table_id: table?.id, combination_id: combination?.id, metadata: { original_table_ids: oldTableIds, new_table_ids: newTableIds, reason: input.reason || null, initiated_from_at_risk: Boolean(input.initiated_from_at_risk) } } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const snapshot = await getFloor(companyId);
    return snapshot.error ? snapshot : ok(snapshot.data, 'Reserva reubicada.');
  } catch (error: any) { const conflict = error?.status === 409 || error?.code === 'P2034'; return fail(conflict ? 409 : (error?.status || 500), conflict ? (error.message || 'La alternativa ya no está disponible.') : (error.message || 'No pudimos reubicar la reserva.')); }
}

const transitions: Record<RestaurantTableOperationalStatus, RestaurantTableOperationalStatus[]> = { AVAILABLE: ['RESERVED', 'RESERVED_SOON', 'ARRIVED', 'SEATED', 'BLOCKED'], RESERVED_SOON: ['RESERVED', 'ARRIVED', 'SEATED', 'AVAILABLE', 'BLOCKED'], RESERVED: ['ARRIVED', 'SEATED', 'AVAILABLE', 'BLOCKED'], ARRIVED: ['SEATED', 'AVAILABLE', 'BLOCKED'], SEATED: ['BILL_REQUESTED', 'CLEANING', 'AVAILABLE'], BILL_REQUESTED: ['CLEANING', 'AVAILABLE'], CLEANING: ['AVAILABLE', 'BLOCKED'], BLOCKED: ['AVAILABLE'] };
export async function updateTableStatus(companyId: number, tableId: number, actorUserId: string, status: RestaurantTableOperationalStatus, blockedReason?: string | null): Promise<Result> {
  try { const state = await prisma.$transaction(async (tx) => { const table = await tx.restaurantTable.findFirst({ where: { id: tableId, company_id: companyId, is_active: true } }); if (!table) throw Object.assign(new Error('No encontramos la mesa.'), { status: 404 }); const existing = await tx.restaurantTableOperationalState.findUnique({ where: { table_id: tableId } }); if (existing && existing.company_id !== companyId) throw Object.assign(new Error('El estado de la mesa no pertenece a la empresa activa.'), { status: 409 }); const current = existing?.status || 'AVAILABLE'; if (!transitions[current].includes(status)) throw Object.assign(new Error(`No podés pasar la mesa de ${current} a ${status}.`), { status: 409 }); const now = new Date(); const updated = await tx.restaurantTableOperationalState.upsert({ where: { table_id: tableId }, create: { company_id: companyId, table_id: tableId, status, status_since: now, occupied_at: ['SEATED', 'BILL_REQUESTED'].includes(status) ? now : null, bill_requested_at: status === 'BILL_REQUESTED' ? now : null, cleaning_started_at: status === 'CLEANING' ? now : null, blocked_reason: status === 'BLOCKED' ? blockedReason || null : null, updated_by_user_id: actorUserId }, update: { company_id: companyId, status, status_since: now, occupied_at: ['SEATED', 'BILL_REQUESTED'].includes(status) ? (existing?.occupied_at || now) : null, bill_requested_at: status === 'BILL_REQUESTED' ? now : null, cleaning_started_at: status === 'CLEANING' ? now : null, blocked_reason: status === 'BLOCKED' ? blockedReason || null : null, updated_by_user_id: actorUserId } }); await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, event: 'TABLE_STATUS_CHANGED', table_id: tableId, metadata: { previous_status: current, status, blocked_reason: blockedReason || null } } }); return updated; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); return ok(state, 'Estado de mesa actualizado.'); } catch (error: any) { return fail(error?.status || 500, error?.message || 'No pudimos actualizar el estado de la mesa.'); }
}

export async function listCombinations(companyId: number): Promise<Result> { return ok(await prisma.restaurantTableCombination.findMany({ where: { company_id: companyId }, include: { dining_area: true, tables: { include: { table: { include: { dining_area: true } } } } }, orderBy: { name: 'asc' } })); }
export async function createCombination(companyId: number, actorUserId: string, input: { name: string; dining_area_id?: number | null; table_ids: number[]; is_active?: boolean }): Promise<Result> {
  try { const combo = await prisma.$transaction(async (tx) => { if (new Set(input.table_ids).size !== input.table_ids.length) throw Object.assign(new Error('No podés repetir mesas en una combinación.'), { status: 400 }); const tables = await tx.restaurantTable.findMany({ where: { company_id: companyId, id: { in: input.table_ids }, is_active: true }, include: { dining_area: true } }); if (tables.length !== input.table_ids.length) throw Object.assign(new Error('Todas las mesas deben pertenecer a la empresa y estar activas.'), { status: 400 }); const areaIds = new Set(tables.map((table) => table.dining_area_id)); if (areaIds.size > 1) throw Object.assign(new Error('Las mesas combinadas deben pertenecer a la misma área.'), { status: 400 }); if (input.dining_area_id && !areaIds.has(input.dining_area_id)) throw Object.assign(new Error('El área seleccionada no coincide con las mesas.'), { status: 400 }); const overlapping = await tx.restaurantTableCombinationTable.findFirst({ where: { company_id: companyId, table_id: { in: input.table_ids }, combination: { is_active: true } } }); if (overlapping) throw Object.assign(new Error('Una de las mesas ya pertenece a otra combinación activa.'), { status: 409 }); const created = await tx.restaurantTableCombination.create({ data: { company_id: companyId, name: input.name.trim(), dining_area_id: input.dining_area_id || tables[0].dining_area_id, is_active: input.is_active ?? true, created_by_user_id: actorUserId, tables: { create: input.table_ids.map((table_id) => ({ company_id: companyId, table_id })) } }, include: { tables: { include: { table: true } } } }); await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, event: 'TABLE_COMBINATION_CREATED', combination_id: created.id, metadata: { table_ids: input.table_ids } } }); return created; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); return ok(combo, 'Combinación creada.', 201); } catch (error: any) { return fail(error?.status || (error?.code === 'P2002' ? 409 : 500), error?.message || 'No pudimos crear la combinación.'); }
}

export async function deleteCombination(companyId: number, combinationId: number, actorUserId: string): Promise<Result> { try { await prisma.$transaction(async (tx) => { const combo = await tx.restaurantTableCombination.findFirst({ where: { id: combinationId, company_id: companyId }, include: { sessions: { where: { status: 'ACTIVE' } }, reservations: { where: { status: { in: activeStatuses } } } } }); if (!combo) throw Object.assign(new Error('No encontramos la combinación.'), { status: 404 }); if (combo.sessions.length || combo.reservations.length) throw Object.assign(new Error('No podés eliminar una combinación que está en uso.'), { status: 409 }); await tx.restaurantTableCombination.update({ where: { id: combinationId }, data: { is_active: false } }); await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, event: 'TABLE_COMBINATION_DEACTIVATED', combination_id: combinationId } }); }); return ok(null, 'Combinación desactivada.'); } catch (error: any) { return fail(error?.status || 500, error?.message || 'No pudimos desactivar la combinación.'); } }

export async function releaseCombinationSession(companyId: number, sessionId: number, actorUserId: string): Promise<Result> {
  try {
    const session = await prisma.$transaction(async (tx) => {
      const current = await tx.restaurantTableCombinationSession.findFirst({ where: { id: sessionId, company_id: companyId, status: 'ACTIVE' }, include: { combination: { include: { tables: { select: { table_id: true } } } } } });
      if (!current) throw Object.assign(new Error('No encontramos una combinación activa.'), { status: 404 });
      const tableIds = current.combination.tables.map((item) => item.table_id);
      if (tableIds.length) await tx.$queryRaw`SELECT id FROM restaurant_table WHERE company_id = ${companyId} AND id IN (${Prisma.join(tableIds)}) FOR UPDATE`;
      const updated = await tx.restaurantTableCombinationSession.update({ where: { id: sessionId }, data: { status: 'RELEASED', released_at: new Date(), released_by_user_id: actorUserId } });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, event: 'TABLE_COMBINATION_RELEASED', combination_id: current.combination_id, reservation_id: current.reservation_id, metadata: { session_id: sessionId } } });
      return updated;
    });
    return ok(session, 'Combinación separada.');
  } catch (error: any) { return fail(error?.status || 500, error?.message || 'No pudimos separar la combinación.'); }
}
