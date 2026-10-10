"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restaurantMetricsQuerySchema = exports.restaurantReservationQuerySchema = exports.assignRestaurantTableSchema = exports.restaurantReservationStatusSchema = exports.updateRestaurantReservationSchema = exports.createRestaurantReservationSchema = void 0;
const zod_1 = require("zod");
const source = zod_1.z.enum(['ADMIN', 'PHONE', 'WHATSAPP', 'WALK_IN']);
const time = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:mm.');
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const optionalText = (max) => zod_1.z.string().trim().max(max).nullable().optional();
const shared = zod_1.z.object({
    customer_name: zod_1.z.string().trim().min(1, 'El nombre del cliente es obligatorio.').max(160),
    customer_phone: optionalText(32),
    customer_email: zod_1.z.string().trim().email('Ingresá un correo válido.').max(255).nullable().optional(),
    party_size: zod_1.z.number().int().min(1).max(100),
    reservation_date: date,
    reservation_time: time,
    table_id: zod_1.z.number().int().positive().nullable().optional(),
    auto_assign: zod_1.z.boolean().optional(),
    notes: optionalText(2000),
    internal_notes: optionalText(2000),
});
exports.createRestaurantReservationSchema = shared.extend({
    source,
    initial_status: zod_1.z.enum(['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED']).optional(),
}).superRefine((input, ctx) => {
    if (input.source === 'WALK_IN' && input.initial_status && !['ARRIVED', 'SEATED'].includes(input.initial_status)) {
        ctx.addIssue({ code: 'custom', path: ['initial_status'], message: 'Un walk-in debe iniciar como llegado o sentado.' });
    }
    if (input.source !== 'WALK_IN' && input.initial_status && !['PENDING', 'CONFIRMED'].includes(input.initial_status)) {
        ctx.addIssue({ code: 'custom', path: ['initial_status'], message: 'Estado inicial no permitido.' });
    }
});
exports.updateRestaurantReservationSchema = shared.partial().extend({
    auto_assign: zod_1.z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo.');
exports.restaurantReservationStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
    reason: optionalText(500),
});
exports.assignRestaurantTableSchema = zod_1.z.object({
    table_id: zod_1.z.number().int().positive().nullable(),
    auto_assign: zod_1.z.boolean().optional(),
}).refine((value) => value.table_id !== null || value.auto_assign === true, 'Elegí una mesa o solicitá asignación automática.');
exports.restaurantReservationQuerySchema = zod_1.z.object({
    date: date.optional(), dateFrom: date.optional(), dateTo: date.optional(),
    status: zod_1.z.enum(['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
    source: zod_1.z.enum(['ONLINE', 'ADMIN', 'PHONE', 'WHATSAPP', 'WALK_IN']).optional(),
    diningAreaId: zod_1.z.coerce.number().int().positive().optional(), tableId: zod_1.z.coerce.number().int().positive().optional(),
    search: zod_1.z.string().trim().max(160).optional(), page: zod_1.z.coerce.number().int().min(1).default(1), limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    sort: zod_1.z.enum(['start_time_asc', 'start_time_desc', 'created_at_desc']).default('start_time_asc'),
});
exports.restaurantMetricsQuerySchema = zod_1.z.object({
    dateFrom: date.optional(),
    dateTo: date.optional(),
});
