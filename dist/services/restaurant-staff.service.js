"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.myShift = myShift;
exports.myUpcomingShifts = myUpcomingShifts;
exports.updateWaiterTableStatus = updateWaiterTableStatus;
exports.updateWaiterReservationStatus = updateWaiterReservationStatus;
exports.addInternalNote = addInternalNote;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const ShiftService = __importStar(require("./restaurant-shift.service"));
const FloorService = __importStar(require("./restaurant-floor.service"));
const ok = (data, message = 'Operación realizada correctamente.', code = 200) => ({ code, error: false, message, data });
const fail = (code, message) => ({ code, error: true, message });
const reservationTransitions = { PENDING: [], CONFIRMED: ['ARRIVED'], ARRIVED: ['SEATED'], SEATED: [], COMPLETED: [], CANCELLED: [], NO_SHOW: [] };
const waiterTableStatuses = new Set(['ARRIVED', 'SEATED', 'BILL_REQUESTED', 'CLEANING', 'AVAILABLE']);
function staffTable(table) { const scrub = (reservation) => reservation ? { ...reservation, customer_phone: null, internal_notes: null } : null; return { ...table, current_reservation: scrub(table.current_reservation), next_reservation: scrub(table.next_reservation) }; }
async function activeAssignment(companyId, userId, tableId, at = new Date(), client = client_2.prisma) {
    return client.restaurantShiftTableAssignment.findFirst({ where: { company_id: companyId, table_id: tableId, member: { user_id: userId }, shift: { company_id: companyId, status: 'OPEN', start_at: { lte: at }, end_at: { gt: at } } }, include: { shift: { select: { id: true, name: true, status: true, start_at: true, end_at: true } }, member: true } });
}
function idsForReservation(reservation) { return reservation.combination?.tables?.map((item) => item.table_id) || (reservation.table_id ? [reservation.table_id] : []); }
async function assignedReservation(companyId, userId, reservationId, at = new Date(), client = client_2.prisma) {
    const reservation = await client.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, include: { table: true, combination: { include: { tables: true } } } });
    if (!reservation)
        return null;
    if (reservation.table && reservation.table.company_id !== companyId)
        return null;
    if (reservation.combination && (reservation.combination.company_id !== companyId || reservation.combination.tables.some((part) => part.company_id !== companyId)))
        return null;
    const tableIds = idsForReservation(reservation);
    const assignment = await client.restaurantShiftTableAssignment.findFirst({ where: { company_id: companyId, table_id: { in: tableIds }, member: { user_id: userId }, shift: { status: 'OPEN', start_at: { lte: at }, end_at: { gt: at } } }, include: { shift: { select: { id: true, name: true } } } });
    return assignment ? { reservation, assignment, tableId: tableIds[0] } : null;
}
async function myShift(companyId, userId) {
    const shifts = await ShiftService.myShifts(companyId, userId);
    if (shifts.error)
        return shifts;
    const data = shifts.data || { current: null, upcoming: [] };
    const current = data.current;
    if (current) {
        const floor = await FloorService.getFloor(companyId, undefined, current.id);
        const snapshot = floor.data || null;
        const assignedIds = new Set((current.my_tables || []).map((item) => item.table_id));
        if (snapshot) {
            snapshot.tables = snapshot.tables.filter((table) => assignedIds.has(table.id)).map(staffTable);
            snapshot.dining_areas = snapshot.dining_areas.map((area) => ({ ...area, tables: area.tables.filter((table) => assignedIds.has(table.id)).map(staffTable) })).filter((area) => area.tables.length);
            snapshot.at_risk = snapshot.at_risk.filter((risk) => risk.affected_table_ids.some((id) => assignedIds.has(id))).map((risk) => ({ ...risk, reservation: staffTable({ current_reservation: risk.reservation }).current_reservation, current_reservation: staffTable({ current_reservation: risk.current_reservation }).current_reservation }));
            if (snapshot.shift)
                snapshot.shift.members = snapshot.shift.members.filter((member) => member.id === userId);
        }
        return ok({ current_shift: current, floor: snapshot, upcoming_shifts: data.upcoming });
    }
    return ok({ current_shift: null, floor: null, upcoming_shifts: data.upcoming });
}
async function myUpcomingShifts(companyId, userId) { return ShiftService.myShifts(companyId, userId); }
async function updateWaiterTableStatus(companyId, userId, tableId, status, blockedReason) {
    if (!waiterTableStatuses.has(status))
        return fail(403, 'Ese cambio de estado no está disponible para mozos.');
    const assignment = await activeAssignment(companyId, userId, tableId);
    if (!assignment)
        return fail(403, 'La mesa no está asignada a tu turno activo.');
    return FloorService.updateTableStatus(companyId, tableId, userId, status, blockedReason);
}
async function updateWaiterReservationStatus(companyId, userId, reservationId, nextStatus) {
    if (!['ARRIVED', 'SEATED'].includes(nextStatus))
        return fail(403, 'Ese cambio de reserva no está disponible para mozos.');
    try {
        const updated = await client_2.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM restaurant_reservation WHERE company_id = ${companyId} AND id = ${reservationId} FOR UPDATE`;
            const linked = await assignedReservation(companyId, userId, reservationId, new Date(), tx);
            if (!linked)
                throw Object.assign(new Error('La reserva no pertenece a una mesa asignada en tu turno activo.'), { status: 403 });
            const current = linked.reservation.status;
            if (!reservationTransitions[current].includes(nextStatus))
                throw Object.assign(new Error('La transición de reserva no está permitida.'), { status: 409 });
            const now = new Date();
            const changed = await tx.restaurantReservation.updateMany({ where: { id: reservationId, company_id: companyId, status: current }, data: { status: nextStatus, seated_at: nextStatus === 'SEATED' ? now : undefined } });
            if (!changed.count)
                throw Object.assign(new Error('La reserva cambió mientras se actualizaba.'), { status: 409 });
            const reservation = await tx.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, include: { table: true, combination: { include: { tables: true } } } });
            if (!reservation)
                throw Object.assign(new Error('No encontramos la reserva.'), { status: 404 });
            for (const tableId of idsForReservation(reservation))
                await tx.restaurantTableOperationalState.upsert({ where: { table_id: tableId }, create: { company_id: companyId, table_id: tableId, status: nextStatus === 'SEATED' ? 'SEATED' : 'ARRIVED', status_since: now, occupied_at: nextStatus === 'SEATED' ? now : null, updated_by_user_id: userId }, update: { status: nextStatus === 'SEATED' ? 'SEATED' : 'ARRIVED', status_since: now, occupied_at: nextStatus === 'SEATED' ? now : undefined, updated_by_user_id: userId } });
            await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: userId, event: nextStatus === 'ARRIVED' ? 'RESERVATION_ARRIVAL_MARKED' : 'RESERVATION_SEATED', target_type: 'RESTAURANT_RESERVATION', target_id: String(reservationId), shift_id: linked.assignment.shift.id, reservation_id: reservationId, table_id: linked.tableId, previous_values: { status: current }, new_values: { status: nextStatus }, metadata: { previous_status: current, status: nextStatus } } });
            return reservation;
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        return ok(updated, nextStatus === 'ARRIVED' ? 'Llegada marcada.' : 'Reserva sentada.');
    }
    catch (error) {
        return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos actualizar la reserva.');
    }
}
async function addInternalNote(companyId, userId, input) {
    try {
        const result = await client_2.prisma.$transaction(async (tx) => {
            if (!input.note?.trim())
                throw Object.assign(new Error('La nota no puede estar vacía.'), { status: 400 });
            let assignment = null;
            let tableId = input.table_id;
            if (input.reservation_id) {
                const linked = await assignedReservation(companyId, userId, input.reservation_id, new Date(), tx);
                if (!linked)
                    throw Object.assign(new Error('La reserva no pertenece a una mesa asignada en tu turno activo.'), { status: 403 });
                if (input.table_id && !idsForReservation(linked.reservation).includes(input.table_id))
                    throw Object.assign(new Error('La mesa no pertenece a la reserva vinculada.'), { status: 409 });
                assignment = linked.assignment;
                tableId = tableId || linked.tableId;
            }
            if (tableId) {
                assignment = assignment || await activeAssignment(companyId, userId, tableId, new Date(), tx);
                if (!assignment)
                    throw Object.assign(new Error('La mesa no está asignada a tu turno activo.'), { status: 403 });
            }
            if (!assignment)
                throw Object.assign(new Error('Asociá la nota a una mesa o reserva.'), { status: 400 });
            const note = await tx.restaurantInternalNote.create({ data: { company_id: companyId, author_user_id: userId, shift_id: assignment.shift.id, table_id: tableId, reservation_id: input.reservation_id, note: input.note.trim() } });
            await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: userId, event: 'INTERNAL_NOTE_ADDED', shift_id: assignment.shift.id, table_id: tableId, reservation_id: input.reservation_id, metadata: { note_id: note.id } } });
            return note;
        });
        return ok(result, 'Nota interna agregada.', 201);
    }
    catch (error) {
        return fail(error?.status || 500, error?.message || 'No pudimos guardar la nota.');
    }
}
