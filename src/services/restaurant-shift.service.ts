import { Prisma, RestaurantShiftMemberRole, RestaurantShiftStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { parseDateTimeInTimeZone } from '../utils/timezone';

type Result = { code: number; error: boolean; message: string; data?: unknown };
type Tx = Prisma.TransactionClient;
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });
const activeShiftStatuses: RestaurantShiftStatus[] = ['DRAFT', 'OPEN'];

const shiftInclude = {
  service_period: true,
  shift_manager: { select: { id: true, name: true, first_name: true, last_name: true, email: true } },
  created_by: { select: { id: true, name: true, email: true } },
  updated_by: { select: { id: true, name: true, email: true } },
  members: { include: { user: { select: { id: true, name: true, first_name: true, last_name: true, email: true, is_active: true } } }, orderBy: { id: 'asc' as const } },
  dining_areas: { include: { dining_area: true }, orderBy: { id: 'asc' as const } },
  table_assignments: { include: { table: { include: { dining_area: true } }, member: { include: { user: { select: { id: true, name: true, first_name: true, last_name: true, email: true } } } } }, orderBy: { id: 'asc' as const } },
  _count: { select: { members: true, table_assignments: true, dining_areas: true } },
};

function userLabel(user: { name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null }) {
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return full || user.name || user.email || 'Sin nombre';
}

function validateTimezone(timezone: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); return true; } catch { return false; }
}

function shiftDateValue(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function timeInZone(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
function dateInZone(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }

async function companyContext(tx: Tx, companyId: number) {
  return tx.company.findFirst({ where: { id: companyId }, select: { timezone: true, restaurant_enabled: true } });
}

function shiftTimes(input: { shift_date: string; start_time: string; end_time: string; timezone: string }) {
  const start = parseDateTimeInTimeZone(`${input.shift_date}T${input.start_time}:00`, input.timezone);
  const end = parseDateTimeInTimeZone(`${input.shift_date}T${input.end_time}:00`, input.timezone);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw Object.assign(new Error('El horario del turno no es válido.'), { status: 400 });
  return { start, end, shiftDate: shiftDateValue(input.shift_date) };
}

async function audit(tx: Tx, companyId: number, actorUserId: string | undefined, event: string, data: { shift_id?: number; table_id?: number; metadata?: Prisma.InputJsonValue }) {
  await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, event, shift_id: data.shift_id, table_id: data.table_id, metadata: data.metadata } });
}

async function assertCompanyUser(tx: Tx, companyId: number, userId: string) {
  const membership = await tx.companyUser.findFirst({ where: { company_id: companyId, user_id: userId, deleted_at: null }, include: { user: { select: { id: true, name: true, first_name: true, last_name: true, email: true, is_active: true, deleted_at: true } } } });
  if (!membership || !membership.user.is_active || membership.user.deleted_at) throw Object.assign(new Error('El miembro seleccionado no pertenece a la empresa o está inactivo.'), { status: 400 });
  const profile = await tx.staffProfile.findFirst({ where: { company_id: companyId, user_id: userId }, select: { status: true, deleted_at: true } });
  if (profile && (profile.deleted_at || profile.status !== 'ACTIVE')) throw Object.assign(new Error('El miembro seleccionado está inactivo.'), { status: 400 });
  return membership.user;
}

async function assertArea(tx: Tx, companyId: number, diningAreaId: number) {
  const area = await tx.restaurantDiningArea.findFirst({ where: { id: diningAreaId, company_id: companyId } });
  if (!area) throw Object.assign(new Error('No encontramos el área de comedor.'), { status: 400 });
  return area;
}

async function assertShift(tx: Tx, companyId: number, shiftId: number) {
  const shift = await tx.restaurantShift.findFirst({ where: { id: shiftId, company_id: companyId }, include: shiftInclude });
  if (!shift) throw Object.assign(new Error('No encontramos el turno.'), { status: 404 });
  return shift;
}

async function createShiftInTx(tx: Tx, companyId: number, actorUserId: string, input: { name: string; shift_date: string; start_time: string; end_time: string; timezone?: string; service_period_id?: number | null; notes?: string | null; shift_manager_user_id?: string | null }) {
  const company = await companyContext(tx, companyId);
  if (!company?.restaurant_enabled) throw Object.assign(new Error('El módulo de restaurante no está habilitado.'), { status: 403 });
  const timezone = input.timezone || company.timezone;
  if (!validateTimezone(timezone)) throw Object.assign(new Error('La zona horaria no es válida.'), { status: 400 });
  const times = shiftTimes({ ...input, timezone });
  if (input.service_period_id !== undefined && input.service_period_id !== null) {
    await tx.restaurantServicePeriod.findFirst({ where: { id: input.service_period_id, company_id: companyId } }).then((period) => { if (!period) throw Object.assign(new Error('El período de servicio no pertenece a la empresa.'), { status: 400 }); });
  }
  if (input.shift_manager_user_id) await assertCompanyUser(tx, companyId, input.shift_manager_user_id);
  const shift = await tx.restaurantShift.create({ data: {
    company_id: companyId,
    name: input.name.trim(),
    shift_date: times.shiftDate,
    start_at: times.start,
    end_at: times.end,
    timezone,
    service_period_id: input.service_period_id ?? null,
    notes: input.notes?.trim() || null,
    shift_manager_user_id: input.shift_manager_user_id || null,
    created_by_user_id: actorUserId,
    updated_by_user_id: actorUserId,
  } });
  await audit(tx, companyId, actorUserId, 'SHIFT_CREATED', { shift_id: shift.id, metadata: { name: shift.name, shift_date: input.shift_date } });
  return shift;
}

async function validateMembersInTx(tx: Tx, companyId: number, members: Array<{ user_id: string; role: RestaurantShiftMemberRole }>) {
  const seen = new Set<string>();
  for (const member of members) {
    if (seen.has(member.user_id)) throw Object.assign(new Error('No podés agregar dos veces al mismo miembro.'), { status: 409 });
    seen.add(member.user_id);
    await assertCompanyUser(tx, companyId, member.user_id);
  }
}

async function replaceMembersInTx(tx: Tx, companyId: number, shift: any, actorUserId: string, members: Array<{ user_id: string; role: RestaurantShiftMemberRole }>) {
  if (shift.status === 'CLOSED' || shift.status === 'CANCELLED') throw Object.assign(new Error('No podés editar un turno cerrado o cancelado.'), { status: 409 });
  await validateMembersInTx(tx, companyId, members);
  const previous = await tx.restaurantShiftMember.findMany({ where: { shift_id: shift.id }, select: { user_id: true, role: true } });
  const nextByUser = new Map(members.map((member) => [member.user_id, member.role]));
  const affectedUserIds = previous.filter((member) => !nextByUser.has(member.user_id) || nextByUser.get(member.user_id) !== member.role || nextByUser.get(member.user_id) !== 'WAITER').map((member) => member.user_id);
  if (affectedUserIds.length) {
    const assigned = await tx.restaurantShiftTableAssignment.findFirst({ where: { shift_id: shift.id, member: { user_id: { in: affectedUserIds } } }, include: { table: { select: { name: true } }, member: { select: { user_id: true } } } });
    if (assigned) throw Object.assign(new Error(`Reasigná primero la mesa ${assigned.table.name} antes de quitar o cambiar el rol de ese mozo.`), { status: 409 });
  }
  const nextIds = new Set(members.map((member) => member.user_id));
  for (const member of previous) {
    if (!nextIds.has(member.user_id)) {
      await tx.restaurantShiftMember.delete({ where: { shift_id_user_id: { shift_id: shift.id, user_id: member.user_id } } });
      await audit(tx, companyId, actorUserId, 'SHIFT_MEMBER_REMOVED', { shift_id: shift.id, metadata: { user_id: member.user_id } });
    }
  }
  for (const member of members) {
    const old = previous.find((item) => item.user_id === member.user_id);
    if (!old) {
      await tx.restaurantShiftMember.create({ data: { company_id: companyId, shift_id: shift.id, user_id: member.user_id, role: member.role, created_by_user_id: actorUserId } });
      await audit(tx, companyId, actorUserId, 'SHIFT_MEMBER_ADDED', { shift_id: shift.id, metadata: { user_id: member.user_id, role: member.role } });
    } else if (old.role !== member.role) {
      await tx.restaurantShiftMember.update({ where: { shift_id_user_id: { shift_id: shift.id, user_id: member.user_id } }, data: { role: member.role } });
      await audit(tx, companyId, actorUserId, 'SHIFT_MEMBER_ROLE_CHANGED', { shift_id: shift.id, metadata: { user_id: member.user_id, previous_role: old.role, role: member.role } });
    }
  }
}

async function replaceAssignmentsInTx(tx: Tx, companyId: number, shift: any, actorUserId: string, assignments: Array<{ table_id: number; user_id: string }>) {
  if (shift.status === 'CLOSED' || shift.status === 'CANCELLED') throw Object.assign(new Error('No podés editar las asignaciones de un turno cerrado o cancelado.'), { status: 409 });
  const tableIds = assignments.map((item) => item.table_id);
  if (new Set(tableIds).size !== tableIds.length) throw Object.assign(new Error('Una mesa solo puede tener un mozo principal en el turno.'), { status: 409 });
  const currentMembers = await tx.restaurantShiftMember.findMany({ where: { shift_id: shift.id }, select: { id: true, user_id: true, role: true } });
  const membersByUser = new Map(currentMembers.map((member) => [member.user_id, member]));
  for (const assignment of assignments) {
    const member = membersByUser.get(assignment.user_id);
    if (!member || member.role !== 'WAITER') throw Object.assign(new Error('Cada mesa debe asignarse a un mozo incluido en el turno.'), { status: 400 });
  }
  if (tableIds.length) await tx.$queryRaw`SELECT id FROM restaurant_table WHERE company_id = ${companyId} AND id IN (${Prisma.join(tableIds)}) FOR UPDATE`;
  const tables = tableIds.length ? await tx.restaurantTable.findMany({ where: { company_id: companyId, id: { in: tableIds } }, include: { dining_area: true } }) : [];
  if (tables.length !== tableIds.length) throw Object.assign(new Error('Una o más mesas no pertenecen a la empresa.'), { status: 400 });
  const openAreas = new Set((await tx.restaurantShiftDiningArea.findMany({ where: { shift_id: shift.id }, select: { dining_area_id: true } })).map((area) => area.dining_area_id));
  for (const table of tables) {
    if (!table.is_active || !table.dining_area.is_active) throw Object.assign(new Error(`La mesa ${table.name} está inactiva.`), { status: 409 });
    if (!openAreas.has(table.dining_area_id)) throw Object.assign(new Error(`La mesa ${table.name} está fuera de las áreas abiertas del turno.`), { status: 400 });
    const conflict = await tx.restaurantShiftTableAssignment.findFirst({ where: { table_id: table.id, shift_id: { not: shift.id }, shift: { company_id: companyId, status: { in: activeShiftStatuses }, start_at: { lt: shift.end_at }, end_at: { gt: shift.start_at } } }, include: { shift: { select: { name: true } } } });
    if (conflict) throw Object.assign(new Error(`La mesa ${table.name} ya está asignada en el turno ${conflict.shift.name}.`), { status: 409 });
  }
  const previous = await tx.restaurantShiftTableAssignment.findMany({ where: { shift_id: shift.id }, include: { table: { select: { id: true, name: true } }, member: { select: { user_id: true } } } });
  await tx.restaurantShiftTableAssignment.deleteMany({ where: { shift_id: shift.id } });
  if (assignments.length) await tx.restaurantShiftTableAssignment.createMany({ data: assignments.map((item) => ({ company_id: companyId, shift_id: shift.id, table_id: item.table_id, member_id: membersByUser.get(item.user_id)!.id, assigned_by_user_id: actorUserId })) });
  const previousByTable = new Map(previous.map((item) => [item.table_id, item.member.user_id]));
  const nextByTable = new Map(assignments.map((item) => [item.table_id, item.user_id]));
  for (const item of previous) if (!nextByTable.has(item.table_id)) await audit(tx, companyId, actorUserId, 'SHIFT_TABLE_ASSIGNMENT_REMOVED', { shift_id: shift.id, table_id: item.table_id, metadata: { table_name: item.table.name, user_id: item.member.user_id } });
  for (const item of assignments) {
    const previousUser = previousByTable.get(item.table_id);
    if (previousUser !== item.user_id) await audit(tx, companyId, actorUserId, previousUser ? 'SHIFT_TABLE_REASSIGNED' : 'SHIFT_TABLE_ASSIGNED', { shift_id: shift.id, table_id: item.table_id, metadata: { previous_user_id: previousUser, user_id: item.user_id } });
  }
}

async function resultFromTransaction<T>(work: (tx: Tx) => Promise<T>, successMessage: string, successCode = 200): Promise<Result> {
  try { return ok(await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), successMessage, successCode); }
  catch (error: any) {
    const conflict = error?.status === 409 || error?.code === 'P2002' || error?.code === 'P2034';
    return fail(conflict ? 409 : (error?.status || 500), conflict ? (error.message || 'La operación entró en conflicto con otro turno.') : (error?.message || 'No pudimos completar la operación.'));
  }
}

export async function listShifts(companyId: number, query: { dateFrom?: string; dateTo?: string; status?: RestaurantShiftStatus }): Promise<Result> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  if (!company) return fail(404, 'No encontramos la empresa.');
  const from = query.dateFrom ? parseDateTimeInTimeZone(`${query.dateFrom}T00:00:00`, company.timezone) : undefined;
  const to = query.dateTo ? new Date(parseDateTimeInTimeZone(`${query.dateTo}T00:00:00`, company.timezone).getTime() + 86400000) : undefined;
  const items = await prisma.restaurantShift.findMany({ where: { company_id: companyId, ...(query.status ? { status: query.status } : {}), ...(from || to ? { shift_date: { ...(from ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}), ...(to && query.dateTo ? { lte: new Date(`${query.dateTo}T00:00:00.000Z`) } : {}) } } : {}) }, include: shiftInclude, orderBy: [{ shift_date: 'asc' }, { start_at: 'asc' }] });
  return ok(items.map((item: any) => ({ ...item, shift_manager: item.shift_manager ? { ...item.shift_manager, label: userLabel(item.shift_manager) } : null })));
}

export async function getShift(companyId: number, shiftId: number): Promise<Result> {
  const shift = await prisma.restaurantShift.findFirst({ where: { id: shiftId, company_id: companyId }, include: shiftInclude });
  return shift ? ok(shift) : fail(404, 'No encontramos el turno.');
}

export async function createShift(companyId: number, actorUserId: string, input: any): Promise<Result> {
  return resultFromTransaction((tx) => createShiftInTx(tx, companyId, actorUserId, input), 'Turno creado.', 201);
}

export async function updateShift(companyId: number, shiftId: number, actorUserId: string, input: any): Promise<Result> {
  return resultFromTransaction(async (tx) => {
    const shift = await assertShift(tx, companyId, shiftId);
    if (shift.status === 'CLOSED' || shift.status === 'CANCELLED') throw Object.assign(new Error('No podés editar un turno cerrado o cancelado.'), { status: 409 });
    const company = await companyContext(tx, companyId);
    const timezone = input.timezone || shift.timezone || company?.timezone || 'UTC';
    const next = { name: input.name ?? shift.name, shift_date: input.shift_date ?? dateInZone(shift.start_at, timezone), start_time: input.start_time ?? timeInZone(shift.start_at, timezone), end_time: input.end_time ?? timeInZone(shift.end_at, timezone), timezone, service_period_id: input.service_period_id === undefined ? shift.service_period_id : input.service_period_id, notes: input.notes === undefined ? shift.notes : input.notes, shift_manager_user_id: input.shift_manager_user_id === undefined ? shift.shift_manager_user_id : input.shift_manager_user_id };
    if (!validateTimezone(timezone)) throw Object.assign(new Error('La zona horaria no es válida.'), { status: 400 });
    const times = shiftTimes(next);
    if (next.service_period_id) { const period = await tx.restaurantServicePeriod.findFirst({ where: { id: next.service_period_id, company_id: companyId } }); if (!period) throw Object.assign(new Error('El período de servicio no pertenece a la empresa.'), { status: 400 }); }
    if (next.shift_manager_user_id) await assertCompanyUser(tx, companyId, next.shift_manager_user_id);
    await tx.restaurantShift.update({ where: { id: shiftId }, data: { name: next.name.trim(), shift_date: times.shiftDate, start_at: times.start, end_at: times.end, timezone, service_period_id: next.service_period_id, notes: next.notes?.trim() || null, shift_manager_user_id: next.shift_manager_user_id || null, updated_by_user_id: actorUserId } });
    await audit(tx, companyId, actorUserId, 'SHIFT_EDITED', { shift_id: shiftId, metadata: { name: next.name, shift_date: next.shift_date } });
    return tx.restaurantShift.findFirst({ where: { id: shiftId, company_id: companyId }, include: shiftInclude });
  }, 'Turno actualizado.');
}

export async function deleteDraftShift(companyId: number, shiftId: number, actorUserId: string): Promise<Result> {
  return resultFromTransaction(async (tx) => { const shift = await assertShift(tx, companyId, shiftId); if (shift.status !== 'DRAFT') throw Object.assign(new Error('Solo podés eliminar turnos en borrador.'), { status: 409 }); await audit(tx, companyId, actorUserId, 'SHIFT_DELETED', { shift_id: shiftId }); await tx.restaurantShift.delete({ where: { id: shiftId } }); return null; }, 'Borrador eliminado.');
}

export async function replaceMembers(companyId: number, shiftId: number, actorUserId: string, members: Array<{ user_id: string; role: RestaurantShiftMemberRole }>): Promise<Result> {
  return resultFromTransaction(async (tx) => { const shift = await assertShift(tx, companyId, shiftId); await replaceMembersInTx(tx, companyId, shift, actorUserId, members); return tx.restaurantShift.findFirst({ where: { id: shiftId, company_id: companyId }, include: shiftInclude }); }, 'Equipo del turno actualizado.');
}

export async function replaceDiningAreas(companyId: number, shiftId: number, actorUserId: string, diningAreaIds: number[]): Promise<Result> {
  return resultFromTransaction(async (tx) => {
    const shift = await assertShift(tx, companyId, shiftId); if (shift.status === 'CLOSED' || shift.status === 'CANCELLED') throw Object.assign(new Error('No podés editar un turno cerrado o cancelado.'), { status: 409 });
    if (new Set(diningAreaIds).size !== diningAreaIds.length) throw Object.assign(new Error('No podés repetir áreas.'), { status: 400 });
    for (const areaId of diningAreaIds) { const area = await assertArea(tx, companyId, areaId); if (!area.is_active) throw Object.assign(new Error('No podés abrir un área inactiva.'), { status: 409 }); }
    const previous = await tx.restaurantShiftDiningArea.findMany({ where: { shift_id: shiftId }, select: { dining_area_id: true } });
    const assignedTables = await tx.restaurantShiftTableAssignment.findMany({ where: { shift_id: shiftId }, include: { table: true } });
    const allowed = new Set(diningAreaIds); if (assignedTables.some((assignment) => !allowed.has(assignment.table.dining_area_id))) throw Object.assign(new Error('Quitá primero las mesas asignadas de las áreas que querés cerrar.'), { status: 409 });
    await tx.restaurantShiftDiningArea.deleteMany({ where: { shift_id: shiftId } });
    if (diningAreaIds.length) await tx.restaurantShiftDiningArea.createMany({ data: diningAreaIds.map((dining_area_id) => ({ company_id: companyId, shift_id: shiftId, dining_area_id })) });
    await audit(tx, companyId, actorUserId, 'SHIFT_DINING_AREAS_UPDATED', { shift_id: shiftId, metadata: { dining_area_ids: diningAreaIds, previous_ids: previous.map((item) => item.dining_area_id) } });
    return tx.restaurantShift.findFirst({ where: { id: shiftId, company_id: companyId }, include: shiftInclude });
  }, 'Áreas del turno actualizadas.');
}

export async function replaceAssignments(companyId: number, shiftId: number, actorUserId: string, assignments: Array<{ table_id: number; user_id: string }>): Promise<Result> {
  return resultFromTransaction(async (tx) => { const shift = await assertShift(tx, companyId, shiftId); await replaceAssignmentsInTx(tx, companyId, shift, actorUserId, assignments); return tx.restaurantShift.findFirst({ where: { id: shiftId, company_id: companyId }, include: shiftInclude }); }, 'Asignaciones actualizadas.');
}

export async function replaceSetup(companyId: number, shiftId: number, actorUserId: string, input: { members: Array<{ user_id: string; role: RestaurantShiftMemberRole }>; dining_area_ids: number[]; assignments: Array<{ table_id: number; user_id: string }> }): Promise<Result> {
  return resultFromTransaction(async (tx) => {
    const shift = await assertShift(tx, companyId, shiftId);
    if (new Set(input.dining_area_ids).size !== input.dining_area_ids.length) throw Object.assign(new Error('No podés repetir áreas.'), { status: 400 });
    for (const areaId of input.dining_area_ids) { const area = await assertArea(tx, companyId, areaId); if (!area.is_active) throw Object.assign(new Error('No podés abrir un área inactiva.'), { status: 409 }); }
    await replaceAssignmentsInTx(tx, companyId, shift, actorUserId, []);
    const previousAreas = await tx.restaurantShiftDiningArea.findMany({ where: { shift_id: shiftId }, select: { dining_area_id: true } });
    await tx.restaurantShiftDiningArea.deleteMany({ where: { shift_id: shiftId } });
    if (input.dining_area_ids.length) await tx.restaurantShiftDiningArea.createMany({ data: input.dining_area_ids.map((dining_area_id) => ({ company_id: companyId, shift_id: shiftId, dining_area_id })) });
    await audit(tx, companyId, actorUserId, 'SHIFT_DINING_AREAS_UPDATED', { shift_id: shiftId, metadata: { dining_area_ids: input.dining_area_ids, previous_ids: previousAreas.map((area) => area.dining_area_id) } });
    await replaceMembersInTx(tx, companyId, shift, actorUserId, input.members);
    await replaceAssignmentsInTx(tx, companyId, shift, actorUserId, input.assignments);
    return tx.restaurantShift.findFirst({ where: { id: shiftId, company_id: companyId }, include: shiftInclude });
  }, 'Configuración del turno actualizada.');
}

async function changeShiftStatus(companyId: number, shiftId: number, actorUserId: string, nextStatus: RestaurantShiftStatus): Promise<Result> {
  return resultFromTransaction(async (tx) => {
    const shift = await assertShift(tx, companyId, shiftId);
    const allowed: Record<RestaurantShiftStatus, RestaurantShiftStatus[]> = { DRAFT: ['OPEN', 'CANCELLED'], OPEN: ['CLOSED', 'CANCELLED'], CLOSED: [], CANCELLED: [] };
    if (!allowed[shift.status].includes(nextStatus)) throw Object.assign(new Error('La transición del turno no está permitida.'), { status: 409 });
    const data: Prisma.RestaurantShiftUpdateInput = { status: nextStatus, updated_by: { connect: { id: actorUserId } } };
    if (nextStatus === 'OPEN') { data.opened_at = new Date(); data.opened_by = { connect: { id: actorUserId } }; }
    if (nextStatus === 'CLOSED') { data.closed_at = new Date(); data.closed_by = { connect: { id: actorUserId } }; }
    if (nextStatus === 'CANCELLED') { data.cancelled_at = new Date(); data.cancelled_by = { connect: { id: actorUserId } }; }
    const updated = await tx.restaurantShift.update({ where: { id: shiftId }, data, include: shiftInclude });
    await audit(tx, companyId, actorUserId, `SHIFT_${nextStatus}`, { shift_id: shiftId });
    return updated;
  }, nextStatus === 'OPEN' ? 'Turno abierto.' : nextStatus === 'CLOSED' ? 'Turno cerrado.' : 'Turno cancelado.');
}
export const openShift = (companyId: number, shiftId: number, actorUserId: string) => changeShiftStatus(companyId, shiftId, actorUserId, 'OPEN');
export const closeShift = (companyId: number, shiftId: number, actorUserId: string) => changeShiftStatus(companyId, shiftId, actorUserId, 'CLOSED');
export const cancelShift = (companyId: number, shiftId: number, actorUserId: string) => changeShiftStatus(companyId, shiftId, actorUserId, 'CANCELLED');

export async function copyShift(companyId: number, sourceId: number, actorUserId: string, input: { shift_date: string; name?: string }): Promise<Result> {
  return resultFromTransaction(async (tx) => {
    const source = await assertShift(tx, companyId, sourceId);
    const sourceMembers = await tx.restaurantShiftMember.findMany({ where: { shift_id: sourceId }, select: { user_id: true, role: true } });
    const sourceAreas = await tx.restaurantShiftDiningArea.findMany({ where: { shift_id: sourceId }, select: { dining_area_id: true } });
    const sourceAssignments = await tx.restaurantShiftTableAssignment.findMany({ where: { shift_id: sourceId }, include: { member: { select: { user_id: true } } } });
    const shift = await createShiftInTx(tx, companyId, actorUserId, { name: input.name || `${source.name} · copia`, shift_date: input.shift_date, start_time: timeInZone(source.start_at, source.timezone), end_time: timeInZone(source.end_at, source.timezone), timezone: source.timezone, service_period_id: source.service_period_id, notes: source.notes, shift_manager_user_id: source.shift_manager_user_id });
    await replaceMembersInTx(tx, companyId, shift, actorUserId, sourceMembers);
    await replaceDiningAreasInTx(tx, companyId, shift, actorUserId, sourceAreas.map((item) => item.dining_area_id));
    await replaceAssignmentsInTx(tx, companyId, shift, actorUserId, sourceAssignments.map((item) => ({ table_id: item.table_id, user_id: item.member.user_id })));
    return tx.restaurantShift.findFirst({ where: { id: shift.id, company_id: companyId }, include: shiftInclude });
  }, 'Turno copiado.', 201);
}

async function replaceDiningAreasInTx(tx: Tx, companyId: number, shift: any, actorUserId: string, diningAreaIds: number[]) {
  for (const areaId of diningAreaIds) { const area = await assertArea(tx, companyId, areaId); if (!area.is_active) throw Object.assign(new Error('El turno copia un área inactiva.'), { status: 409 }); }
  if (diningAreaIds.length) await tx.restaurantShiftDiningArea.createMany({ data: diningAreaIds.map((dining_area_id) => ({ company_id: companyId, shift_id: shift.id, dining_area_id })) });
  await audit(tx, companyId, actorUserId, 'SHIFT_DINING_AREAS_UPDATED', { shift_id: shift.id, metadata: { dining_area_ids: diningAreaIds } });
}

export async function saveTemplate(companyId: number, shiftId: number, actorUserId: string, name: string): Promise<Result> {
  return resultFromTransaction(async (tx) => {
    const shift = await assertShift(tx, companyId, shiftId);
    const members = await tx.restaurantShiftMember.findMany({ where: { shift_id: shiftId }, select: { user_id: true, role: true } });
    const areas = await tx.restaurantShiftDiningArea.findMany({ where: { shift_id: shiftId }, select: { dining_area_id: true } });
    const assignments = await tx.restaurantShiftTableAssignment.findMany({ where: { shift_id: shiftId }, include: { member: { select: { user_id: true } } } });
    const template = await tx.restaurantShiftTemplate.create({ data: { company_id: companyId, name: name.trim(), start_time: timeInZone(shift.start_at, shift.timezone), end_time: timeInZone(shift.end_at, shift.timezone), timezone: shift.timezone, notes: shift.notes, created_by_user_id: actorUserId, members: { create: members }, dining_areas: { create: areas }, table_assignments: { create: assignments.map((item) => ({ table_id: item.table_id, user_id: item.member.user_id })) } }, include: { members: true, dining_areas: true, table_assignments: true } });
    await audit(tx, companyId, actorUserId, 'SHIFT_TEMPLATE_CREATED', { shift_id: shiftId, metadata: { template_id: template.id, name: template.name } });
    return template;
  }, 'Plantilla guardada.', 201);
}

export async function listTemplates(companyId: number): Promise<Result> { return ok(await prisma.restaurantShiftTemplate.findMany({ where: { company_id: companyId }, include: { members: true, dining_areas: { include: { dining_area: true } }, table_assignments: { include: { table: true, user: { select: { id: true, name: true, first_name: true, last_name: true } } } } }, orderBy: { name: 'asc' } })); }

export async function useTemplate(companyId: number, actorUserId: string, input: any): Promise<Result> {
  return resultFromTransaction(async (tx) => {
    const template = await tx.restaurantShiftTemplate.findFirst({ where: { id: input.template_id, company_id: companyId }, include: { members: true, dining_areas: true, table_assignments: true } });
    if (!template) throw Object.assign(new Error('No encontramos la plantilla.'), { status: 404 });
    const shift = await createShiftInTx(tx, companyId, actorUserId, { name: input.name || template.name, shift_date: input.shift_date, start_time: input.start_time || template.start_time, end_time: input.end_time || template.end_time, timezone: template.timezone, notes: input.notes === undefined ? template.notes : input.notes, shift_manager_user_id: input.shift_manager_user_id });
    await replaceMembersInTx(tx, companyId, shift, actorUserId, template.members.map((member) => ({ user_id: member.user_id, role: member.role })));
    await replaceDiningAreasInTx(tx, companyId, shift, actorUserId, template.dining_areas.map((area) => area.dining_area_id));
    await replaceAssignmentsInTx(tx, companyId, shift, actorUserId, template.table_assignments.map((assignment) => ({ table_id: assignment.table_id, user_id: assignment.user_id })));
    return tx.restaurantShift.findFirst({ where: { id: shift.id, company_id: companyId }, include: shiftInclude });
  }, 'Turno creado desde plantilla.', 201);
}

export async function myShifts(companyId: number, userId: string, includePast = false): Promise<Result> {
  const now = new Date();
  const shifts = await prisma.restaurantShift.findMany({ where: { company_id: companyId, status: { in: ['OPEN', 'DRAFT'] }, members: { some: { user_id: userId } }, ...(includePast ? {} : { end_at: { gte: now } }) }, include: shiftInclude, orderBy: [{ start_at: 'asc' }] });
  const serialized = shifts.map((shift: any) => { const myMembership = shift.members.find((member: any) => member.user_id === userId) || null; const myTables = shift.table_assignments.filter((assignment: any) => assignment.member.user_id === userId); return { ...shift, members: myMembership ? [myMembership] : [], table_assignments: myTables, my_membership: myMembership, my_tables: myTables }; });
  return ok({ current: serialized.find((shift: any) => shift.status === 'OPEN' && shift.start_at <= now && shift.end_at >= now) || null, upcoming: serialized.filter((shift: any) => shift.start_at > now || (shift.status === 'DRAFT' && shift.end_at >= now)) });
}
