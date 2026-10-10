"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waiterInternalNoteSchema = exports.waiterReservationStatusSchema = exports.relocateRestaurantReservationSchema = exports.restaurantFloorQuerySchema = exports.tableStateSchema = exports.tableCombinationSchema = exports.useShiftTemplateSchema = exports.saveShiftTemplateSchema = exports.copyShiftSchema = exports.replaceShiftSetupSchema = exports.replaceShiftDiningAreasSchema = exports.replaceShiftAssignmentsSchema = exports.shiftTableAssignmentSchema = exports.replaceShiftMembersSchema = exports.shiftMemberSchema = exports.restaurantShiftQuerySchema = exports.updateRestaurantShiftSchema = exports.createRestaurantShiftSchema = void 0;
const zod_1 = require("zod");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const time = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:mm.');
const id = zod_1.z.number().int().positive();
const text = (max) => zod_1.z.string().trim().max(max).nullable().optional();
const role = zod_1.z.enum(['MANAGER', 'HOST', 'WAITER']);
const shiftFields = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(160),
    shift_date: date,
    start_time: time,
    end_time: time,
    timezone: zod_1.z.string().trim().min(1).max(64).optional(),
    service_period_id: id.nullable().optional(),
    notes: text(4000),
    shift_manager_user_id: zod_1.z.string().trim().min(1).nullable().optional(),
});
exports.createRestaurantShiftSchema = shiftFields.superRefine((input, ctx) => {
    if (input.start_time >= input.end_time)
        ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'La hora de fin debe ser posterior a la de inicio.' });
});
exports.updateRestaurantShiftSchema = shiftFields.partial().superRefine((input, ctx) => {
    if (input.start_time && input.end_time && input.start_time >= input.end_time)
        ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'La hora de fin debe ser posterior a la de inicio.' });
}).refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo.');
exports.restaurantShiftQuerySchema = zod_1.z.object({
    dateFrom: date.optional(),
    dateTo: date.optional(),
    status: zod_1.z.enum(['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']).optional(),
});
exports.shiftMemberSchema = zod_1.z.object({ user_id: zod_1.z.string().trim().min(1), role });
exports.replaceShiftMembersSchema = zod_1.z.object({ members: zod_1.z.array(exports.shiftMemberSchema).max(200) });
exports.shiftTableAssignmentSchema = zod_1.z.object({ table_id: id, user_id: zod_1.z.string().trim().min(1) });
exports.replaceShiftAssignmentsSchema = zod_1.z.object({ assignments: zod_1.z.array(exports.shiftTableAssignmentSchema).max(500) });
exports.replaceShiftDiningAreasSchema = zod_1.z.object({ dining_area_ids: zod_1.z.array(id).max(100) });
exports.replaceShiftSetupSchema = zod_1.z.object({ members: zod_1.z.array(exports.shiftMemberSchema).max(200), dining_area_ids: zod_1.z.array(id).max(100), assignments: zod_1.z.array(exports.shiftTableAssignmentSchema).max(500) });
exports.copyShiftSchema = zod_1.z.object({ shift_date: date, name: zod_1.z.string().trim().min(1).max(160).optional() });
exports.saveShiftTemplateSchema = zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(160) });
exports.useShiftTemplateSchema = zod_1.z.object({
    template_id: id,
    name: zod_1.z.string().trim().min(1).max(160).optional(),
    shift_date: date,
    start_time: time.optional(),
    end_time: time.optional(),
    notes: text(4000),
    shift_manager_user_id: zod_1.z.string().trim().min(1).nullable().optional(),
});
exports.tableCombinationSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(160),
    dining_area_id: id.nullable().optional(),
    table_ids: zod_1.z.array(id).min(2).max(20),
    is_active: zod_1.z.boolean().optional(),
});
exports.tableStateSchema = zod_1.z.object({
    status: zod_1.z.enum(['AVAILABLE', 'RESERVED_SOON', 'RESERVED', 'ARRIVED', 'SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED']),
    blocked_reason: text(500),
}).superRefine((input, ctx) => { if (input.status === 'BLOCKED' && !input.blocked_reason)
    ctx.addIssue({ code: 'custom', path: ['blocked_reason'], message: 'Indicá por qué la mesa está bloqueada.' }); });
exports.restaurantFloorQuerySchema = zod_1.z.object({
    at: zod_1.z.string().datetime({ offset: true }).optional(),
    shiftId: zod_1.z.coerce.number().int().positive().optional(),
});
exports.relocateRestaurantReservationSchema = zod_1.z.object({
    table_id: id.optional(),
    combination_id: id.optional(),
    reason: text(500),
    initiated_from_at_risk: zod_1.z.boolean().optional(),
}).refine((value) => Boolean(value.table_id) !== Boolean(value.combination_id), 'Elegí una mesa o una combinación válida.');
exports.waiterReservationStatusSchema = zod_1.z.object({ status: zod_1.z.enum(['ARRIVED', 'SEATED']) });
exports.waiterInternalNoteSchema = zod_1.z.object({ note: zod_1.z.string().trim().min(1).max(1000), table_id: id.optional(), reservation_id: id.optional() }).refine((value) => Boolean(value.table_id) || Boolean(value.reservation_id), 'Asociá la nota a una mesa o reserva.');
