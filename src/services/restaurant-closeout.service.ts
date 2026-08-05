import { Prisma, RestaurantShiftCloseoutStatus, RestaurantShiftStatus } from '@prisma/client';
import { prisma } from '../prisma/client';

type Result = { code: number; error: boolean; message: string; data?: unknown };
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string, data?: unknown): Result => ({ code, error: true, message, data });
const closeoutInclude = { shift: { select: { id: true, name: true, shift_date: true, start_at: true, end_at: true, status: true } }, closed_by: { select: { id: true, name: true, first_name: true, last_name: true, email: true } }, reopened_by: { select: { id: true, name: true, first_name: true, last_name: true, email: true } }, adjustments: { orderBy: { created_at: 'desc' as const }, include: { actor: { select: { id: true, name: true, first_name: true, last_name: true, email: true } } } } } satisfies Prisma.RestaurantShiftCloseoutInclude;
function userLabel(user: any) { return user ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.name || user.email || null : null; }
function sum(items: any[], field: string) { return items.reduce((total, item) => total + (Number(item[field]) || 0), 0); }
function jsonOrNull(value: unknown) { return value === null || value === undefined ? Prisma.JsonNull : value as Prisma.InputJsonValue; }

async function shift(tx: typeof prisma | Prisma.TransactionClient, companyId: number, shiftId: number) {
  const record = await tx.restaurantShift.findFirst({ where: { id: shiftId, company_id: companyId }, select: { id: true, name: true, shift_date: true, start_at: true, end_at: true, status: true } });
  if (!record) throw Object.assign(new Error('No encontramos el turno.'), { status: 404 });
  return record;
}

async function buildSnapshot(tx: typeof prisma | Prisma.TransactionClient, companyId: number, shiftId: number, startAt: Date, endAt: Date) {
  const [visits, reservations, waitlist, states, combinations, company] = await Promise.all([
    tx.restaurantVisit.findMany({ where: { company_id: companyId, OR: [{ shift_id: shiftId }, { shift_id: null, closed_at: { gte: startAt, lt: endAt } }] }, select: { id: true, guest_count: true, subtotal_amount_cents: true, discount_amount_cents: true, tip_amount_cents: true, total_paid_amount_cents: true, payment_method: true, status: true, primary_waiter_user_id: true, primary_waiter_name: true, closed_at: true } }),
    tx.restaurantReservation.findMany({ where: { company_id: companyId, start_time: { lt: endAt }, end_time: { gt: startAt } }, select: { id: true, status: true, source: true, party_size: true, start_time: true, end_time: true, seated_at: true, completed_at: true } }),
    tx.restaurantWaitlist.findMany({ where: { company_id: companyId, arrival_time: { lt: endAt }, ...(startAt ? { updated_at: { gte: startAt } } : {}) }, select: { id: true, status: true, party_size: true, arrival_time: true, seated_at: true, estimated_wait_minutes: true } }),
    tx.restaurantTableOperationalState.findMany({ where: { company_id: companyId, status: { in: ['SEATED', 'BILL_REQUESTED', 'CLEANING'] }, table: { company_id: companyId, OR: [{ shift_assignments: { some: { company_id: companyId, shift_id: shiftId } } }, { dining_area: { shift_dining_areas: { some: { company_id: companyId, shift_id: shiftId } } } }] } }, select: { table_id: true, status: true } }),
    tx.restaurantTableCombinationSession.findMany({ where: { company_id: companyId, status: 'ACTIVE', start_at: { lt: endAt }, end_at: { gt: startAt } }, select: { id: true, combination_id: true } }),
    tx.company.findFirst({ where: { id: companyId }, select: { currency: true } }),
  ]);
  const financialVisits = visits.filter((visit) => visit.status !== 'DRAFT');
  const waiterMap = new Map<string, any>();
  for (const visit of financialVisits) {
    if (!visit.primary_waiter_user_id) continue;
    const current = waiterMap.get(visit.primary_waiter_user_id) || { user_id: visit.primary_waiter_user_id, waiter_name: visit.primary_waiter_name, visits: 0, guests: 0, total_paid_amount_cents: 0, tip_amount_cents: 0 };
    current.visits += 1; current.guests += visit.guest_count; current.total_paid_amount_cents += visit.total_paid_amount_cents; current.tip_amount_cents += visit.tip_amount_cents; waiterMap.set(visit.primary_waiter_user_id, current);
  }
  const completedReservations = reservations.filter((reservation) => reservation.status === 'COMPLETED');
  const noShows = reservations.filter((reservation) => reservation.status === 'NO_SHOW');
  const cancellations = reservations.filter((reservation) => reservation.status === 'CANCELLED');
  const seatedDurations = completedReservations.map((reservation) => reservation.seated_at && reservation.completed_at ? Math.max(0, Math.round((reservation.completed_at.getTime() - reservation.seated_at.getTime()) / 60000)) : null).filter((value): value is number => value !== null);
  const waitDurations = waitlist.map((entry) => entry.seated_at ? Math.max(0, Math.round((entry.seated_at.getTime() - entry.arrival_time.getTime()) / 60000)) : null).filter((value): value is number => value !== null);
  const warnings = [
    ...visits.filter((visit) => visit.status === 'DRAFT').map((visit) => `VISIT_MISSING_FINANCIALS:${visit.id}`),
    ...states.map((state) => `TABLE_${state.status}:${state.table_id}`),
    ...combinations.map((session) => `ACTIVE_COMBINATION:${session.combination_id}`),
    ...waitlist.filter((entry) => ['WAITING', 'NOTIFIED', 'ARRIVED'].includes(entry.status)).map((entry) => `WAITLIST_OPEN:${entry.id}`),
    ...reservations.filter((reservation) => ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED'].includes(reservation.status)).map((reservation) => `RESERVATION_OPEN:${reservation.id}`),
  ];
  return {
    reservations_summary: { total: reservations.length, completed: completedReservations.length, no_show: noShows.length, cancelled: cancellations.length, by_source: reservations.reduce<Record<string, number>>((acc, item) => { acc[item.source] = (acc[item.source] || 0) + 1; return acc; }, {}) },
    walk_in_summary: { reservations: reservations.filter((reservation) => reservation.source === 'WALK_IN').length, guests: reservations.filter((reservation) => reservation.source === 'WALK_IN').reduce((total, reservation) => total + reservation.party_size, 0) },
    waitlist_summary: { total: waitlist.length, seated: waitlist.filter((entry) => entry.status === 'SEATED').length, left: waitlist.filter((entry) => entry.status === 'LEFT').length, cancelled: waitlist.filter((entry) => entry.status === 'CANCELLED').length, average_wait_minutes: waitDurations.length ? Math.round(waitDurations.reduce((a, b) => a + b, 0) / waitDurations.length) : 0 },
    guest_summary: { reservations: reservations.reduce((total, reservation) => total + reservation.party_size, 0), visits: financialVisits.reduce((total, visit) => total + visit.guest_count, 0) },
    revenue_summary: { currency: company?.currency || 'Bs.', visits: financialVisits.length, subtotal_amount_cents: sum(financialVisits, 'subtotal_amount_cents'), discount_amount_cents: sum(financialVisits, 'discount_amount_cents'), total_paid_amount_cents: sum(financialVisits, 'total_paid_amount_cents') },
    tip_summary: { tip_amount_cents: sum(financialVisits, 'tip_amount_cents') },
    discount_summary: { discount_amount_cents: sum(financialVisits, 'discount_amount_cents') },
    table_turn_summary: { active_tables_at_close: states.length, active_combinations_at_close: combinations.length },
    dining_duration_summary: { average_minutes: seatedDurations.length ? Math.round(seatedDurations.reduce((a, b) => a + b, 0) / seatedDurations.length) : 0, completed_visits_with_duration: seatedDurations.length },
    wait_time_summary: { average_minutes: waitDurations.length ? Math.round(waitDurations.reduce((a, b) => a + b, 0) / waitDurations.length) : 0, measured_waits: waitDurations.length },
    no_show_summary: { count: noShows.length, guests: noShows.reduce((total, reservation) => total + reservation.party_size, 0) },
    cancellation_summary: { count: cancellations.length, guests: cancellations.reduce((total, reservation) => total + reservation.party_size, 0) },
    missing_data_warnings: warnings,
    waiter_performance_snapshots: [...waiterMap.values()].map((item) => ({ ...item, average_spend_cents: item.visits ? Math.round(item.total_paid_amount_cents / item.visits) : 0 })),
  };
}

function serialize(closeout: any) { return closeout ? { ...closeout, closed_by: closeout.closed_by ? { ...closeout.closed_by, label: userLabel(closeout.closed_by) } : null, reopened_by: closeout.reopened_by ? { ...closeout.reopened_by, label: userLabel(closeout.reopened_by) } : null, adjustments: closeout.adjustments?.map((item: any) => ({ ...item, actor: item.actor ? { ...item.actor, label: userLabel(item.actor) } : null })) } : null; }

export async function preview(companyId: number, shiftId: number): Promise<Result> {
  try { const record = await shift(prisma, companyId, shiftId); return ok({ shift: record, snapshot: await buildSnapshot(prisma, companyId, shiftId, record.start_at, record.end_at) }); } catch (error: any) { return fail(error?.status || 500, error?.message || 'No pudimos generar el cierre.'); }
}

export async function close(companyId: number, shiftId: number, actorUserId: string, input: { manager_notes?: string | null; operational_issues?: string | null; override_warnings?: boolean; override_reason?: string | null }): Promise<Result> {
  try {
    const closeout = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM restaurant_shift WHERE company_id = ${companyId} AND id = ${shiftId} FOR UPDATE`;
      const record = await shift(tx, companyId, shiftId);
      const current = await tx.restaurantShiftCloseout.findFirst({ where: { company_id: companyId, shift_id: shiftId } });
      if (record.status === RestaurantShiftStatus.DRAFT || record.status === RestaurantShiftStatus.CANCELLED) throw Object.assign(new Error('Solo se puede cerrar un turno abierto o ya iniciado.'), { status: 409 });
      if (current?.status === RestaurantShiftCloseoutStatus.CLOSED) throw Object.assign(new Error('El cierre ya está registrado. Usá ajustes o reabrilo antes de cerrar nuevamente.'), { status: 409 });
      if (current?.status === RestaurantShiftCloseoutStatus.FINALIZED) throw Object.assign(new Error('El cierre ya está finalizado y no puede sobrescribirse.'), { status: 409 });
      const snapshot = await buildSnapshot(tx, companyId, shiftId, record.start_at, record.end_at);
      if (snapshot.missing_data_warnings.length && !input.override_warnings) throw Object.assign(new Error('El cierre tiene advertencias operativas. Confirmá el cierre con un motivo de excepción.'), { status: 409, data: { warnings: snapshot.missing_data_warnings } });
      if (snapshot.missing_data_warnings.length && !input.override_reason?.trim()) throw Object.assign(new Error('Indicá el motivo para cerrar con advertencias operativas.'), { status: 400, data: { warnings: snapshot.missing_data_warnings } });
      const now = new Date();
      const overrideNote = snapshot.missing_data_warnings.length ? `Excepción de cierre: ${input.override_reason!.trim().slice(0, 500)}` : null;
      const operationalIssues = [input.operational_issues?.trim() || null, overrideNote].filter(Boolean).join('\n') || null;
      const data: Prisma.RestaurantShiftCloseoutUncheckedCreateInput = { company_id: companyId, shift_id: shiftId, status: RestaurantShiftCloseoutStatus.CLOSED, closed_by_user_id: actorUserId, closed_at: now, manager_notes: input.manager_notes?.trim() || null, operational_issues: operationalIssues, finalized_at: null, ...snapshot } as Prisma.RestaurantShiftCloseoutUncheckedCreateInput;
      const saved = current ? await tx.restaurantShiftCloseout.update({ where: { id: current.id }, data: { ...data, status: RestaurantShiftCloseoutStatus.CLOSED, closed_by_user_id: actorUserId, closed_at: now, finalized_at: null, reopened_by_user_id: null, reopened_at: null } as Prisma.RestaurantShiftCloseoutUncheckedUpdateInput, include: closeoutInclude }) : await tx.restaurantShiftCloseout.create({ data, include: closeoutInclude });
      if (record.status === RestaurantShiftStatus.OPEN) await tx.restaurantShift.update({ where: { id: shiftId }, data: { status: RestaurantShiftStatus.CLOSED, closed_by_user_id: actorUserId, closed_at: new Date(), updated_by_user_id: actorUserId } });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, shift_id: shiftId, event: 'SHIFT_CLOSEOUT_CLOSED', target_type: 'RESTAURANT_SHIFT_CLOSEOUT', target_id: String(saved.id), new_values: { status: saved.status, warnings: snapshot.missing_data_warnings }, metadata: input.override_reason?.trim() ? { override_reason: input.override_reason.trim().slice(0, 500) } : undefined } });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return ok(serialize(closeout), 'Turno cerrado con resumen operativo.');
  } catch (error: any) { return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos cerrar el turno.', error?.data); }
}

export async function finalize(companyId: number, shiftId: number, actorUserId: string): Promise<Result> {
  try { const result = await prisma.$transaction(async (tx) => { await tx.$queryRaw`SELECT id FROM restaurant_shift WHERE company_id = ${companyId} AND id = ${shiftId} FOR UPDATE`; const current = await tx.restaurantShiftCloseout.findFirst({ where: { company_id: companyId, shift_id: shiftId } }); if (!current) throw Object.assign(new Error('Primero generá el cierre del turno.'), { status: 404 }); if (current.status !== RestaurantShiftCloseoutStatus.CLOSED && current.status !== RestaurantShiftCloseoutStatus.REOPENED) throw Object.assign(new Error('El cierre no está listo para finalizarse.'), { status: 409 }); const updated = await tx.restaurantShiftCloseout.update({ where: { id: current.id }, data: { status: RestaurantShiftCloseoutStatus.FINALIZED, finalized_at: new Date() }, include: closeoutInclude }); await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, shift_id: shiftId, event: 'SHIFT_CLOSEOUT_FINALIZED', target_type: 'RESTAURANT_SHIFT_CLOSEOUT', target_id: String(current.id), previous_values: { status: current.status }, new_values: { status: updated.status } } }); return updated; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); return ok(serialize(result), 'Cierre finalizado.'); } catch (error: any) { return fail(error?.status || 500, error?.message || 'No pudimos finalizar el cierre.'); }
}

export async function reopen(companyId: number, shiftId: number, actorUserId: string, reason: string): Promise<Result> {
  try { const result = await prisma.$transaction(async (tx) => { await tx.$queryRaw`SELECT id FROM restaurant_shift WHERE company_id = ${companyId} AND id = ${shiftId} FOR UPDATE`; const record = await shift(tx, companyId, shiftId); if (record.status === RestaurantShiftStatus.CANCELLED) throw Object.assign(new Error('No se puede reabrir un turno cancelado.'), { status: 409 }); const current = await tx.restaurantShiftCloseout.findFirst({ where: { company_id: companyId, shift_id: shiftId } }); if (!current) throw Object.assign(new Error('No encontramos el cierre.'), { status: 404 }); if (current.status === RestaurantShiftCloseoutStatus.PREVIEWED) throw Object.assign(new Error('El cierre todavía no se puede reabrir.'), { status: 409 }); if (!reason?.trim()) throw Object.assign(new Error('Indicá el motivo de reapertura.'), { status: 400 }); const updated = await tx.restaurantShiftCloseout.update({ where: { id: current.id }, data: { status: RestaurantShiftCloseoutStatus.REOPENED, reopened_by_user_id: actorUserId, reopened_at: new Date() }, include: closeoutInclude }); await tx.restaurantShift.update({ where: { id: shiftId }, data: { status: RestaurantShiftStatus.OPEN, closed_at: null, closed_by_user_id: null, opened_at: new Date(), opened_by_user_id: actorUserId, updated_by_user_id: actorUserId } }); await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, shift_id: shiftId, event: 'SHIFT_CLOSEOUT_REOPENED', target_type: 'RESTAURANT_SHIFT_CLOSEOUT', target_id: String(current.id), previous_values: { status: current.status }, new_values: { status: updated.status }, metadata: { reason: reason.trim().slice(0, 500) } } }); return updated; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); return ok(serialize(result), 'Cierre reabierto.'); } catch (error: any) { return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos reabrir el cierre.'); }
}

export async function adjust(companyId: number, shiftId: number, actorUserId: string, input: { section: string; adjusted_snapshot: unknown; reason: string }): Promise<Result> {
  const allowed = new Set(['revenue_summary', 'tip_summary', 'discount_summary', 'waitlist_summary', 'guest_summary', 'waiter_performance_snapshots', 'operational_issues']);
  if (!allowed.has(input.section) || !input.reason?.trim()) return fail(400, 'La sección o el motivo del ajuste no son válidos.');
  try { const result = await prisma.$transaction(async (tx) => { await tx.$queryRaw`SELECT id FROM restaurant_shift WHERE company_id = ${companyId} AND id = ${shiftId} FOR UPDATE`; await shift(tx, companyId, shiftId); const current = await tx.restaurantShiftCloseout.findFirst({ where: { company_id: companyId, shift_id: shiftId } }); if (!current) throw Object.assign(new Error('No encontramos el cierre.'), { status: 404 }); if (current.status === RestaurantShiftCloseoutStatus.PREVIEWED) throw Object.assign(new Error('No se puede ajustar un cierre preliminar.'), { status: 409 }); const previousSnapshot = (current as any)[input.section]; const data = { [input.section]: jsonOrNull(input.adjusted_snapshot) } as any; const updated = await tx.restaurantShiftCloseout.update({ where: { id: current.id }, data, include: closeoutInclude }); await tx.restaurantShiftCloseoutAdjustment.create({ data: { company_id: companyId, closeout_id: current.id, actor_user_id: actorUserId, reason: input.reason.trim().slice(0, 500), previous_snapshot: jsonOrNull(previousSnapshot), adjusted_snapshot: jsonOrNull(input.adjusted_snapshot) } }); await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, shift_id: shiftId, event: 'SHIFT_CLOSEOUT_ADJUSTED', target_type: 'RESTAURANT_SHIFT_CLOSEOUT', target_id: String(current.id), previous_values: ({ [input.section]: previousSnapshot } as unknown as Prisma.InputJsonValue), new_values: ({ [input.section]: input.adjusted_snapshot } as unknown as Prisma.InputJsonValue), metadata: { reason: input.reason.trim().slice(0, 500) } } }); return updated; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); return ok(serialize(result), 'Ajuste de cierre registrado.'); } catch (error: any) { return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos registrar el ajuste.'); }
}

export async function get(companyId: number, shiftId: number): Promise<Result> { const closeout = await prisma.restaurantShiftCloseout.findFirst({ where: { company_id: companyId, shift_id: shiftId }, include: closeoutInclude }); return closeout ? ok(serialize(closeout)) : fail(404, 'No encontramos el cierre.'); }
export async function list(companyId: number, query: any): Promise<Result> { const items = await prisma.restaurantShiftCloseout.findMany({ where: { company_id: companyId, ...(query.status ? { status: query.status } : {}) }, include: closeoutInclude, orderBy: { created_at: 'desc' }, take: query.limit }); return ok(items.map(serialize)); }
