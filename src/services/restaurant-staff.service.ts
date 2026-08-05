import { Prisma, RestaurantReservationStatus, RestaurantTableOperationalStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import * as ShiftService from './restaurant-shift.service';
import * as FloorService from './restaurant-floor.service';

type Result = { code: number; error: boolean; message: string; data?: unknown };
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });
const reservationTransitions: Record<RestaurantReservationStatus, RestaurantReservationStatus[]> = { PENDING: [], CONFIRMED: ['ARRIVED'], ARRIVED: ['SEATED'], SEATED: [], COMPLETED: [], CANCELLED: [], NO_SHOW: [] };
const waiterTableStatuses = new Set<RestaurantTableOperationalStatus>(['ARRIVED', 'SEATED', 'BILL_REQUESTED', 'CLEANING', 'AVAILABLE']);
function staffTable(table: any) { const scrub = (reservation: any) => reservation ? { ...reservation, customer_phone: null, internal_notes: null } : null; return { ...table, current_reservation: scrub(table.current_reservation), next_reservation: scrub(table.next_reservation) }; }

async function activeAssignment(companyId: number, userId: string, tableId: number, at = new Date(), client: typeof prisma | Prisma.TransactionClient = prisma) {
  return client.restaurantShiftTableAssignment.findFirst({ where: { company_id: companyId, table_id: tableId, member: { user_id: userId }, shift: { company_id: companyId, status: 'OPEN', start_at: { lte: at }, end_at: { gt: at } } }, include: { shift: { select: { id: true, name: true, status: true, start_at: true, end_at: true } }, member: true } });
}
function idsForReservation(reservation: any) { return reservation.combination?.tables?.map((item: any) => item.table_id) || (reservation.table_id ? [reservation.table_id] : []); }
async function assignedReservation(companyId: number, userId: string, reservationId: number, at = new Date(), client: typeof prisma | Prisma.TransactionClient = prisma) {
  const reservation = await client.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, include: { table: true, combination: { include: { tables: true } } } }); if (!reservation) return null;
  if (reservation.table && reservation.table.company_id !== companyId) return null;
  if (reservation.combination && (reservation.combination.company_id !== companyId || reservation.combination.tables.some((part: any) => part.company_id !== companyId))) return null;
  const tableIds = idsForReservation(reservation); const assignment = await client.restaurantShiftTableAssignment.findFirst({ where: { company_id: companyId, table_id: { in: tableIds }, member: { user_id: userId }, shift: { status: 'OPEN', start_at: { lte: at }, end_at: { gt: at } } }, include: { shift: { select: { id: true, name: true } } } }); return assignment ? { reservation, assignment, tableId: tableIds[0] } : null;
}

export async function myShift(companyId: number, userId: string): Promise<Result> {
  const shifts = await ShiftService.myShifts(companyId, userId); if (shifts.error) return shifts; const data: any = shifts.data || { current: null, upcoming: [] };
  const current = data.current;
  if (current) {
    const floor = await FloorService.getFloor(companyId, undefined, current.id); const snapshot: any = floor.data || null; const assignedIds = new Set((current.my_tables || []).map((item: any) => item.table_id)); if (snapshot) { snapshot.tables = snapshot.tables.filter((table: any) => assignedIds.has(table.id)).map(staffTable); snapshot.dining_areas = snapshot.dining_areas.map((area: any) => ({ ...area, tables: area.tables.filter((table: any) => assignedIds.has(table.id)).map(staffTable) })).filter((area: any) => area.tables.length); snapshot.at_risk = snapshot.at_risk.filter((risk: any) => risk.affected_table_ids.some((id: number) => assignedIds.has(id))).map((risk: any) => ({ ...risk, reservation: staffTable({ current_reservation: risk.reservation }).current_reservation, current_reservation: staffTable({ current_reservation: risk.current_reservation }).current_reservation })); if (snapshot.shift) snapshot.shift.members = snapshot.shift.members.filter((member: any) => member.id === userId); } return ok({ current_shift: current, floor: snapshot, upcoming_shifts: data.upcoming });
  }
  return ok({ current_shift: null, floor: null, upcoming_shifts: data.upcoming });
}

export async function myUpcomingShifts(companyId: number, userId: string): Promise<Result> { return ShiftService.myShifts(companyId, userId); }

export async function updateWaiterTableStatus(companyId: number, userId: string, tableId: number, status: RestaurantTableOperationalStatus, blockedReason?: string | null): Promise<Result> {
  if (!waiterTableStatuses.has(status)) return fail(403, 'Ese cambio de estado no está disponible para mozos.');
  const assignment = await activeAssignment(companyId, userId, tableId); if (!assignment) return fail(403, 'La mesa no está asignada a tu turno activo.');
  return FloorService.updateTableStatus(companyId, tableId, userId, status, blockedReason);
}

export async function updateWaiterReservationStatus(companyId: number, userId: string, reservationId: number, nextStatus: RestaurantReservationStatus): Promise<Result> {
  if (!['ARRIVED', 'SEATED'].includes(nextStatus)) return fail(403, 'Ese cambio de reserva no está disponible para mozos.');
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM restaurant_reservation WHERE company_id = ${companyId} AND id = ${reservationId} FOR UPDATE`;
      const linked = await assignedReservation(companyId, userId, reservationId, new Date(), tx); if (!linked) throw Object.assign(new Error('La reserva no pertenece a una mesa asignada en tu turno activo.'), { status: 403 });
      const current = linked.reservation.status as RestaurantReservationStatus; if (!reservationTransitions[current].includes(nextStatus)) throw Object.assign(new Error('La transición de reserva no está permitida.'), { status: 409 });
      const now = new Date(); const changed = await tx.restaurantReservation.updateMany({ where: { id: reservationId, company_id: companyId, status: current }, data: { status: nextStatus, seated_at: nextStatus === 'SEATED' ? now : undefined } }); if (!changed.count) throw Object.assign(new Error('La reserva cambió mientras se actualizaba.'), { status: 409 }); const reservation = await tx.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, include: { table: true, combination: { include: { tables: true } } } }); if (!reservation) throw Object.assign(new Error('No encontramos la reserva.'), { status: 404 });
      for (const tableId of idsForReservation(reservation)) await tx.restaurantTableOperationalState.upsert({ where: { table_id: tableId }, create: { company_id: companyId, table_id: tableId, status: nextStatus === 'SEATED' ? 'SEATED' : 'ARRIVED', status_since: now, occupied_at: nextStatus === 'SEATED' ? now : null, updated_by_user_id: userId }, update: { status: nextStatus === 'SEATED' ? 'SEATED' : 'ARRIVED', status_since: now, occupied_at: nextStatus === 'SEATED' ? now : undefined, updated_by_user_id: userId } });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: userId, event: nextStatus === 'ARRIVED' ? 'RESERVATION_ARRIVAL_MARKED' : 'RESERVATION_SEATED', target_type: 'RESTAURANT_RESERVATION', target_id: String(reservationId), shift_id: linked.assignment.shift.id, reservation_id: reservationId, table_id: linked.tableId, previous_values: { status: current }, new_values: { status: nextStatus }, metadata: { previous_status: current, status: nextStatus } } }); return reservation;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return ok(updated, nextStatus === 'ARRIVED' ? 'Llegada marcada.' : 'Reserva sentada.');
  } catch (error: any) { return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos actualizar la reserva.'); }
}

export async function addInternalNote(companyId: number, userId: string, input: { note: string; table_id?: number; reservation_id?: number }): Promise<Result> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!input.note?.trim()) throw Object.assign(new Error('La nota no puede estar vacía.'), { status: 400 });
      let assignment: any = null; let tableId = input.table_id;
      if (input.reservation_id) { const linked = await assignedReservation(companyId, userId, input.reservation_id, new Date(), tx); if (!linked) throw Object.assign(new Error('La reserva no pertenece a una mesa asignada en tu turno activo.'), { status: 403 }); if (input.table_id && !idsForReservation(linked.reservation).includes(input.table_id)) throw Object.assign(new Error('La mesa no pertenece a la reserva vinculada.'), { status: 409 }); assignment = linked.assignment; tableId = tableId || linked.tableId; }
      if (tableId) { assignment = assignment || await activeAssignment(companyId, userId, tableId, new Date(), tx); if (!assignment) throw Object.assign(new Error('La mesa no está asignada a tu turno activo.'), { status: 403 }); }
      if (!assignment) throw Object.assign(new Error('Asociá la nota a una mesa o reserva.'), { status: 400 });
      const note = await tx.restaurantInternalNote.create({ data: { company_id: companyId, author_user_id: userId, shift_id: assignment.shift.id, table_id: tableId, reservation_id: input.reservation_id, note: input.note.trim() } });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: userId, event: 'INTERNAL_NOTE_ADDED', shift_id: assignment.shift.id, table_id: tableId, reservation_id: input.reservation_id, metadata: { note_id: note.id } } }); return note;
    }); return ok(result, 'Nota interna agregada.', 201);
  } catch (error: any) { return fail(error?.status || 500, error?.message || 'No pudimos guardar la nota.'); }
}
