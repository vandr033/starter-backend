import { Prisma, RestaurantNotificationEvent, RestaurantReservationSource, RestaurantReservationStatus, RestaurantWaitlistSource, RestaurantWaitlistStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { canonicalizePhoneParts } from '../utils/phoneNormalization';
import { parseDateTimeInTimeZone } from '../utils/timezone';
import { generateRestaurantReservationCode, resolveRestaurantCustomer } from './restaurant-reservation.service';
import { notifyRestaurantWaitlist } from './restaurant-notification.service';

type Result = { code: number; error: boolean; message: string; data?: unknown };
type WaitlistInput = { guest_name: string; phone?: string | null; email?: string | null; customer_profile_id?: number | null; party_size: number; preferred_dining_area_id?: number | null; accessibility_notes?: string | null; seating_notes?: string | null; source?: RestaurantWaitlistSource; priority?: number; manual_order?: number; estimated_wait_minutes?: number; internal_notes?: string | null };
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });
const queueStatuses: RestaurantWaitlistStatus[] = [RestaurantWaitlistStatus.WAITING, RestaurantWaitlistStatus.NOTIFIED, RestaurantWaitlistStatus.ARRIVED];
const waitlistTransitions: Record<RestaurantWaitlistStatus, RestaurantWaitlistStatus[]> = {
  WAITING: [RestaurantWaitlistStatus.NOTIFIED, RestaurantWaitlistStatus.ARRIVED, RestaurantWaitlistStatus.LEFT, RestaurantWaitlistStatus.CANCELLED],
  NOTIFIED: [RestaurantWaitlistStatus.ARRIVED, RestaurantWaitlistStatus.LEFT, RestaurantWaitlistStatus.CANCELLED],
  ARRIVED: [RestaurantWaitlistStatus.LEFT, RestaurantWaitlistStatus.CANCELLED],
  SEATED: [],
  LEFT: [],
  CANCELLED: [],
};

function label(user: any) { return user ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.name || user.email : null; }
function safe(entry: any) {
  if (!entry) return null;
  const { customer_profile: customerProfile, ...rest } = entry;
  return {
    ...rest,
    customer_profile: customerProfile ? { id: customerProfile.id } : null,
    internal_notes: entry.internal_notes ?? null,
    created_by: entry.created_by ? { id: entry.created_by.id, name: label(entry.created_by) } : null,
    updated_by: entry.updated_by ? { id: entry.updated_by.id, name: label(entry.updated_by) } : null,
  };
}
function inQueue(status: RestaurantWaitlistStatus) { return queueStatuses.includes(status); }

async function company(tx: Prisma.TransactionClient, companyId: number) {
  const value = await tx.company.findFirst({ where: { id: companyId }, select: { phone_prefix: true, timezone: true, restaurant_settings: true } });
  if (!value?.restaurant_settings) throw Object.assign(new Error('La configuración de restaurante no existe.'), { status: 404 });
  return value;
}
async function validateReferences(tx: Prisma.TransactionClient, companyId: number, input: Partial<WaitlistInput>) {
  if (input.customer_profile_id !== undefined && input.customer_profile_id !== null && !await tx.customerProfile.findFirst({ where: { id: input.customer_profile_id, company_id: companyId, deleted_at: null } })) throw Object.assign(new Error('El perfil de cliente no pertenece a la empresa.'), { status: 400 });
  if (input.preferred_dining_area_id !== undefined && input.preferred_dining_area_id !== null && !await tx.restaurantDiningArea.findFirst({ where: { id: input.preferred_dining_area_id, company_id: companyId, is_active: true } })) throw Object.assign(new Error('El área preferida no pertenece a la empresa.'), { status: 400 });
}
async function estimate(tx: Prisma.TransactionClient, companyId: number, partySize: number, preferredAreaId?: number | null) {
  const context = await company(tx, companyId);
  const tables = await tx.restaurantTable.findMany({ where: { company_id: companyId, is_active: true, dining_area: { is_active: true }, maximum_seats: { gte: partySize }, ...(preferredAreaId ? { dining_area_id: preferredAreaId } : {}) }, select: { id: true, table_state: { select: { status: true } } } });
  const available = tables.filter((table) => !table.table_state || table.table_state.status === 'AVAILABLE').length;
  const ahead = await tx.restaurantWaitlist.count({ where: { company_id: companyId, status: { in: queueStatuses }, party_size: { lte: partySize } } });
  const divisor = Math.max(1, available);
  const minutes = Math.max(10, Math.ceil((ahead * context.restaurant_settings!.average_dining_minutes) / divisor / 5) * 5);
  return { minutes, readyAt: new Date(Date.now() + minutes * 60000), queueAhead: ahead, compatibleTables: tables.length };
}

export async function add(companyId: number, actorUserId: string, input: WaitlistInput): Promise<Result> {
  try {
    const entry = await prisma.$transaction(async (tx) => {
      const context = await company(tx, companyId);
      if (!Number.isInteger(input.party_size) || input.party_size < context.restaurant_settings!.minimum_party_size || input.party_size > context.restaurant_settings!.maximum_party_size) throw Object.assign(new Error('El tamaño del grupo no cumple la configuración del restaurante.'), { status: 400 });
      await validateReferences(tx, companyId, input);
      const phone = input.phone ? canonicalizePhoneParts({ phoneNumber: input.phone, defaultPrefix: context.phone_prefix }).fullPhone : null;
      const prediction = await estimate(tx, companyId, input.party_size, input.preferred_dining_area_id);
      const created = await tx.restaurantWaitlist.create({ data: { company_id: companyId, guest_name: input.guest_name.trim(), phone, email: input.email?.trim().toLowerCase() || null, customer_profile_id: input.customer_profile_id ?? null, party_size: input.party_size, preferred_dining_area_id: input.preferred_dining_area_id ?? null, accessibility_notes: input.accessibility_notes?.trim() || null, seating_notes: input.seating_notes?.trim() || null, estimated_wait_minutes: input.estimated_wait_minutes ?? prediction.minutes, quoted_ready_at: prediction.readyAt, source: input.source || RestaurantWaitlistSource.WALK_IN, priority: input.priority || 0, manual_order: input.manual_order || 0, internal_notes: input.internal_notes?.trim() || null, created_by_user_id: actorUserId }, include: { preferred_dining_area: true, assigned_table: true, assigned_combination: true, created_by: true } });
      await tx.restaurantWaitlistEvent.create({ data: { company_id: companyId, waitlist_id: created.id, event: 'ADDED', to_status: created.status, actor_user_id: actorUserId, metadata: { estimated_wait_minutes: prediction.minutes, queue_ahead: prediction.queueAhead } } });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, event: 'WAITLIST_ADDED', target_type: 'RESTAURANT_WAITLIST', target_id: String(created.id), new_values: { status: created.status, party_size: created.party_size } } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    try { await notifyRestaurantWaitlist({ companyId, waitlistId: entry.id, event: RestaurantNotificationEvent.WAITLIST_ADDED }); } catch { /* Queue persistence is independent of delivery. */ }
    return ok(safe(entry), 'Cliente agregado a la lista de espera.', 201);
  } catch (error: any) { return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos agregar al cliente a la lista de espera.'); }
}

export async function list(companyId: number, query: any): Promise<Result> {
  const where: Prisma.RestaurantWaitlistWhereInput = { company_id: companyId, ...(query.status ? { status: query.status } : {}), ...(query.preferred_dining_area_id ? { preferred_dining_area_id: query.preferred_dining_area_id } : {}), ...(query.search ? { OR: [{ guest_name: { contains: query.search } }, { phone: { contains: query.search.replace(/\D/g, '') } }, { email: { contains: query.search } }] } : {}) };
  const [total, items] = await prisma.$transaction([prisma.restaurantWaitlist.count({ where }), prisma.restaurantWaitlist.findMany({ where, include: { preferred_dining_area: true, assigned_table: true, assigned_combination: true, customer_profile: true, created_by: true, updated_by: true }, orderBy: [{ priority: 'desc' }, { manual_order: 'asc' }, { arrival_time: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit })]);
  return ok({ items: items.map(safe), pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
}

export async function update(companyId: number, actorUserId: string, id: number, input: Partial<WaitlistInput>): Promise<Result> {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM restaurant_waitlist WHERE company_id = ${companyId} AND id = ${id} FOR UPDATE`;
      const existing = await tx.restaurantWaitlist.findFirst({ where: { id, company_id: companyId } });
      if (!existing) throw Object.assign(new Error('No encontramos el registro de espera.'), { status: 404 });
      await validateReferences(tx, companyId, input);
      const context = await company(tx, companyId);
      const nextStatus = (input as any).status as RestaurantWaitlistStatus | undefined;
      if (nextStatus && nextStatus !== existing.status && !waitlistTransitions[existing.status].includes(nextStatus)) throw Object.assign(new Error('La transición de lista de espera no está permitida. Usá la acción de sentar para convertir una espera en visita.'), { status: 409 });
      const phone = input.phone === undefined ? existing.phone : input.phone ? canonicalizePhoneParts({ phoneNumber: input.phone, defaultPrefix: context.phone_prefix }).fullPhone : null;
      const prediction = input.party_size && input.party_size !== existing.party_size ? await estimate(tx, companyId, input.party_size, input.preferred_dining_area_id ?? existing.preferred_dining_area_id) : null;
      const data: Prisma.RestaurantWaitlistUpdateInput = { guest_name: input.guest_name?.trim(), phone, email: input.email === undefined ? undefined : input.email?.trim().toLowerCase() || null, customer_profile: input.customer_profile_id === undefined ? undefined : input.customer_profile_id === null ? { disconnect: true } : { connect: { id: input.customer_profile_id } }, party_size: input.party_size, preferred_dining_area: input.preferred_dining_area_id === undefined ? undefined : input.preferred_dining_area_id === null ? { disconnect: true } : { connect: { id: input.preferred_dining_area_id } }, accessibility_notes: input.accessibility_notes === undefined ? undefined : input.accessibility_notes?.trim() || null, seating_notes: input.seating_notes === undefined ? undefined : input.seating_notes?.trim() || null, source: input.source, priority: input.priority, manual_order: input.manual_order, estimated_wait_minutes: prediction?.minutes ?? input.estimated_wait_minutes, quoted_ready_at: prediction?.readyAt, internal_notes: input.internal_notes === undefined ? undefined : input.internal_notes?.trim() || null, updated_by: { connect: { id: actorUserId } } };
      if (nextStatus && nextStatus !== existing.status) { data.status = nextStatus; if (nextStatus === 'NOTIFIED') { data.notified_at = new Date(); data.actual_ready_at = new Date(); } if (nextStatus === 'ARRIVED' && !existing.actual_ready_at) data.actual_ready_at = new Date(); if (nextStatus === 'CANCELLED') data.cancelled_at = new Date(); if (nextStatus === 'LEFT') data.left_at = new Date(); }
      const result = await tx.restaurantWaitlist.update({ where: { id }, data, include: { preferred_dining_area: true, assigned_table: true, assigned_combination: true, created_by: true, updated_by: true } });
      if (nextStatus && nextStatus !== existing.status) await tx.restaurantWaitlistEvent.create({ data: { company_id: companyId, waitlist_id: id, event: `STATUS_${nextStatus}`, from_status: existing.status, to_status: nextStatus, actor_user_id: actorUserId, metadata: { reason: input.internal_notes || null } } });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, event: nextStatus && nextStatus !== existing.status ? `WAITLIST_${nextStatus}` : 'WAITLIST_UPDATED', target_type: 'RESTAURANT_WAITLIST', target_id: String(id), previous_values: { status: existing.status, party_size: existing.party_size }, new_values: { status: result.status, party_size: result.party_size } } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if ((input as any).status === RestaurantWaitlistStatus.NOTIFIED) try { await notifyRestaurantWaitlist({ companyId, waitlistId: id, event: RestaurantNotificationEvent.WAITLIST_TABLE_READY }); } catch { /* Delivery is isolated. */ }
    return ok(safe(updated), 'Lista de espera actualizada.');
  } catch (error: any) { return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos actualizar la lista de espera.'); }
}

export async function recommendations(companyId: number, query: { table_id?: number; at?: string }): Promise<Result> {
  const at = query.at ? new Date(query.at) : new Date();
  if (Number.isNaN(at.getTime())) return fail(400, 'El momento de consulta no es válido.');
  const [entries, tables, states, settings, combinations] = await Promise.all([
    prisma.restaurantWaitlist.findMany({ where: { company_id: companyId, status: { in: queueStatuses } }, include: { preferred_dining_area: true }, orderBy: [{ priority: 'desc' }, { manual_order: 'asc' }, { arrival_time: 'asc' }], take: 100 }),
    prisma.restaurantTable.findMany({ where: { company_id: companyId, is_active: true, dining_area: { is_active: true }, ...(query.table_id ? { id: query.table_id } : {}) }, include: { dining_area: true }, orderBy: [{ maximum_seats: 'asc' }, { id: 'asc' }] }),
    prisma.restaurantTableOperationalState.findMany({ where: { company_id: companyId } }),
    prisma.restaurantSettings.findFirst({ where: { company_id: companyId }, select: { average_dining_minutes: true } }),
    prisma.restaurantTableCombination.findMany({ where: { company_id: companyId, is_active: true }, include: { dining_area: true, tables: { include: { table: { include: { dining_area: true } } } } }, orderBy: [{ id: 'asc' }] }),
  ]);
  const stateByTable = new Map(states.map((state) => [state.table_id, state]));
  const tableIds = tables.map((table) => table.id);
  const reservationEnd = new Date(at.getTime() + (settings?.average_dining_minutes || 90) * 60000);
  const reservations = tableIds.length ? await prisma.restaurantReservation.findMany({ where: { company_id: companyId, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED'] }, start_time: { lt: reservationEnd }, end_time: { gt: at }, OR: [{ table_id: { in: tableIds } }, { combination: { company_id: companyId, tables: { some: { company_id: companyId, table_id: { in: tableIds } } } } }] }, select: { table_id: true, combination: { select: { tables: { select: { table_id: true } } } } } }) : [];
  const reservedTableIds = new Set<number>();
  for (const reservation of reservations) {
    if (reservation.table_id) reservedTableIds.add(reservation.table_id);
    for (const part of reservation.combination?.tables || []) reservedTableIds.add(part.table_id);
  }
  const result = entries.map((entry, index) => {
    const compatible = tables.filter((table) => table.maximum_seats >= entry.party_size && (!entry.preferred_dining_area_id || table.dining_area_id === entry.preferred_dining_area_id) && !reservedTableIds.has(table.id) && !['SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED'].includes(stateByTable.get(table.id)?.status || 'AVAILABLE'));
    const selected = compatible[0] || tables.find((table) => table.maximum_seats >= entry.party_size && !reservedTableIds.has(table.id) && !['SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED'].includes(stateByTable.get(table.id)?.status || 'AVAILABLE'));
    const compatibleCombinations = combinations.filter((combination: any) => combination.dining_area?.is_active && combination.tables.length >= 2 && combination.tables.every((part: any) => part.table.is_active && part.table.dining_area.is_active && !reservedTableIds.has(part.table_id) && !['SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED'].includes(stateByTable.get(part.table_id)?.status || 'AVAILABLE')) && combination.tables.reduce((sum: number, part: any) => sum + part.table.maximum_seats, 0) >= entry.party_size && (!entry.preferred_dining_area_id || combination.dining_area_id === entry.preferred_dining_area_id || combination.tables.every((part: any) => part.table.dining_area_id === entry.preferred_dining_area_id)));
    const selectedCombination = compatibleCombinations[0] || combinations.find((combination: any) => combination.dining_area?.is_active && combination.tables.length >= 2 && combination.tables.every((part: any) => part.table.is_active && part.table.dining_area.is_active && !reservedTableIds.has(part.table_id) && !['SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED'].includes(stateByTable.get(part.table_id)?.status || 'AVAILABLE')) && combination.tables.reduce((sum: number, part: any) => sum + part.table.maximum_seats, 0) >= entry.party_size);
    const reasons = [`${index + 1}° en la cola`, selected ? `Capacidad ${selected.maximum_seats} para ${entry.party_size}` : selectedCombination ? `Combinación de ${selectedCombination.tables.reduce((sum: number, part: any) => sum + part.table.maximum_seats, 0)} para ${entry.party_size}` : 'Sin mesa compatible disponible'];
    if (entry.preferred_dining_area_id && selected?.dining_area_id === entry.preferred_dining_area_id) reasons.push('Área preferida');
    if (entry.priority > 0) reasons.push('Prioridad manual');
    if (!selected && reservedTableIds.size) reasons.push('Las mesas compatibles tienen reservas próximas');
    return { waitlist_id: entry.id, guest_name: entry.guest_name, party_size: entry.party_size, arrival_time: entry.arrival_time, status: entry.status, recommended_table: selected ? { id: selected.id, name: selected.name, capacity: selected.maximum_seats, dining_area: selected.dining_area.name } : null, recommended_combination: selectedCombination ? { id: selectedCombination.id, name: selectedCombination.name, capacity: selectedCombination.tables.reduce((sum: number, part: any) => sum + part.table.maximum_seats, 0), table_ids: selectedCombination.tables.map((part: any) => part.table_id), dining_area: selectedCombination.dining_area?.name || null } : null, score: (selected ? 100 : selectedCombination ? 80 : 0) + entry.priority * 1000 - index, reasons, at: at.toISOString() };
  });
  return ok(result.sort((a, b) => b.score - a.score));
}

export async function seat(companyId: number, actorUserId: string, id: number, input: { table_id?: number | null; combination_id?: number | null }): Promise<Result> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM restaurant_waitlist WHERE company_id = ${companyId} AND id = ${id} FOR UPDATE`;
      const actor = await tx.companyUser.findFirst({ where: { company_id: companyId, user_id: actorUserId, deleted_at: null }, select: { id: true } });
      if (!actor) throw Object.assign(new Error('El usuario no pertenece a esta empresa.'), { status: 403 });
      const entry = await tx.restaurantWaitlist.findFirst({ where: { id, company_id: companyId }, include: { preferred_dining_area: true } });
      if (!entry) throw Object.assign(new Error('No encontramos el registro de espera.'), { status: 404 });
      if (!inQueue(entry.status)) throw Object.assign(new Error('El cliente ya no está disponible para ser sentado.'), { status: 409 });
      const context = await company(tx, companyId);
      const tableId = input.table_id ?? null;
      const combinationId = input.combination_id ?? null;
      if ((tableId ? 1 : 0) + (combinationId ? 1 : 0) !== 1) throw Object.assign(new Error('Elegí una mesa o una combinación.'), { status: 400 });
      let table: any = null;
      let combination: any = null;
      let tableIds: number[] = [];
      if (tableId) {
        await tx.$queryRaw`SELECT id FROM restaurant_table WHERE company_id = ${companyId} AND id = ${tableId} FOR UPDATE`;
        table = await tx.restaurantTable.findFirst({ where: { id: tableId, company_id: companyId, is_active: true, dining_area: { is_active: true } }, include: { dining_area: true, table_state: true } });
        if (!table || ['SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED'].includes(table.table_state?.status || 'AVAILABLE')) throw Object.assign(new Error('La mesa seleccionada no está disponible.'), { status: 409 });
        if (table.maximum_seats < entry.party_size) throw Object.assign(new Error('La mesa no tiene capacidad suficiente para este grupo.'), { status: 409 });
        if (table.dining_area.company_id !== companyId) throw Object.assign(new Error('El área de la mesa no pertenece a la empresa.'), { status: 409 });
        if (table.table_state && table.table_state.company_id !== companyId) throw Object.assign(new Error('El estado operativo de la mesa no pertenece a la empresa.'), { status: 409 });
        tableIds = [table.id];
      } else {
        combination = await tx.restaurantTableCombination.findFirst({
          where: { id: combinationId!, company_id: companyId, is_active: true },
          include: { dining_area: true, tables: { include: { table: { include: { dining_area: true, table_state: true } } } } },
        });
        if (!combination || combination.company_id !== companyId || !combination.dining_area || !combination.dining_area.is_active || combination.dining_area.company_id !== companyId || combination.tables.length < 2 || combination.tables.some((part: any) => part.table.company_id !== companyId || !part.table.is_active || !part.table.dining_area.is_active || part.table.dining_area.company_id !== companyId) || combination.tables.reduce((sum: number, part: any) => sum + part.table.maximum_seats, 0) < entry.party_size) throw Object.assign(new Error('La combinación no está disponible o no tiene capacidad suficiente.'), { status: 409 });
        tableIds = combination.tables.map((part: any) => part.table_id);
        await tx.$queryRaw`SELECT id FROM restaurant_table WHERE company_id = ${companyId} AND id IN (${Prisma.join(tableIds)}) FOR UPDATE`;
        if (combination.tables.some((part: any) => part.table.table_state && part.table.table_state.company_id !== companyId || ['SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED'].includes(part.table.table_state?.status || 'AVAILABLE'))) throw Object.assign(new Error('Una mesa de la combinación no está disponible.'), { status: 409 });
      }
      const start = new Date();
      const end = new Date(start.getTime() + context.restaurant_settings!.average_dining_minutes * 60000);
      const shift = await tx.restaurantShift.findFirst({ where: { company_id: companyId, status: 'OPEN', start_at: { lte: start }, end_at: { gt: start } }, orderBy: { start_at: 'desc' } });
      const overlap = await tx.restaurantReservation.findFirst({ where: { company_id: companyId, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED'] }, start_time: { lt: end }, end_time: { gt: start }, OR: [{ table_id: { in: tableIds } }, { combination: { company_id: companyId, tables: { some: { company_id: companyId, table_id: { in: tableIds } } } } }] }, select: { id: true } });
      if (overlap) throw Object.assign(new Error('La mesa acaba de ser ocupada.'), { status: 409 });
      if (entry.customer_profile_id && !await tx.customerProfile.findFirst({ where: { id: entry.customer_profile_id, company_id: companyId, deleted_at: null } })) throw Object.assign(new Error('El perfil de cliente no pertenece a la empresa.'), { status: 409 });
      const customerProfileId = entry.customer_profile_id || await resolveRestaurantCustomer(tx, companyId, context.phone_prefix, { customer_name: entry.guest_name, customer_phone: entry.phone, customer_email: entry.email });
      const phone = entry.phone ? canonicalizePhoneParts({ phoneNumber: entry.phone, defaultPrefix: context.phone_prefix }).fullPhone : null;
      const reservationDate = parseDateTimeInTimeZone(`${new Intl.DateTimeFormat('en-CA', { timeZone: context.timezone }).format(start)}T00:00:00`, context.timezone);
      const reservation = await tx.restaurantReservation.create({ data: { company_id: companyId, customer_profile_id: customerProfileId, table_id: tableId, combination_id: combinationId, reservation_code: generateRestaurantReservationCode(), reservation_date: reservationDate, start_time: start, end_time: end, party_size: entry.party_size, customer_name: entry.guest_name, customer_phone: phone, customer_email: entry.email, status: RestaurantReservationStatus.SEATED, source: RestaurantReservationSource.WALK_IN, seated_at: start, created_by_user_id: actorUserId } });
      await tx.restaurantReservationAssignment.create({ data: { company_id: companyId, reservation_id: reservation.id, table_id: tableId, combination_id: combinationId, assigned_by_user_id: actorUserId, reason: 'Asignación inicial desde la lista de espera.' } });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, reservation_id: reservation.id, table_id: tableId, combination_id: combinationId, event: 'RESERVATION_CREATED', target_type: 'RESTAURANT_RESERVATION', target_id: String(reservation.id), new_values: { status: reservation.status, table_id: tableId, combination_id: combinationId, source: reservation.source } } });
      let sessionId: number | null = null;
      if (combinationId) { const session = await tx.restaurantTableCombinationSession.create({ data: { company_id: companyId, combination_id: combinationId, reservation_id: reservation.id, start_at: start, end_at: end, created_by_user_id: actorUserId } }); sessionId = session.id; }
      const visit = await tx.restaurantVisit.create({ data: { company_id: companyId, reservation_id: reservation.id, shift_id: shift?.id ?? null, table_id: tableId, combination_session_id: sessionId, primary_waiter_user_id: null, primary_waiter_name: null, dining_area_snapshot: table?.dining_area.name || combination?.dining_area?.name || null, table_name_snapshot: table?.name || null, shift_name_snapshot: shift?.name || null, guest_count: entry.party_size, currency: (await tx.company.findUnique({ where: { id: companyId }, select: { currency: true } }))?.currency || 'Bs.', status: 'DRAFT' } });
      const updated = await tx.restaurantWaitlist.update({ where: { id }, data: { status: RestaurantWaitlistStatus.SEATED, seated_at: start, actual_ready_at: entry.actual_ready_at || start, linked_reservation_id: reservation.id, linked_visit_id: visit.id, assigned_table_id: tableId, assigned_combination_id: combinationId, updated_by_user_id: actorUserId } });
      await tx.restaurantWaitlistEvent.create({ data: { company_id: companyId, waitlist_id: id, event: 'SEATED', from_status: entry.status, to_status: RestaurantWaitlistStatus.SEATED, actor_user_id: actorUserId, metadata: { reservation_id: reservation.id, visit_id: visit.id } } });
      for (const tablePartId of tableIds) await tx.restaurantTableOperationalState.upsert({ where: { table_id: tablePartId }, create: { company_id: companyId, table_id: tablePartId, status: 'SEATED', status_since: start, occupied_at: start, updated_by_user_id: actorUserId }, update: { status: 'SEATED', status_since: start, occupied_at: start, updated_by_user_id: actorUserId } });
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, reservation_id: reservation.id, table_id: tableId, combination_id: combinationId, event: 'WAITLIST_SEATED', target_type: 'RESTAURANT_WAITLIST', target_id: String(id), new_values: { reservation_id: reservation.id, visit_id: visit.id } } });
      return { waitlist: updated, reservation, visit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return ok(result, 'Cliente sentado y visita iniciada.', 201);
  } catch (error: any) { return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos sentar al cliente.'); }
}
