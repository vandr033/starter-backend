"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRestaurantServicePeriodSchema = exports.createRestaurantServicePeriodSchema = exports.updateRestaurantTableSchema = exports.createRestaurantTableSchema = exports.updateRestaurantDiningAreaSchema = exports.createRestaurantDiningAreaSchema = exports.updateRestaurantSettingsSchema = exports.restaurantAccessSchema = void 0;
const zod_1 = require("zod");
const name = zod_1.z.string().trim().min(1, 'El nombre es obligatorio.').max(120);
const optionalDescription = zod_1.z.string().trim().max(500).nullable().optional();
const time = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:mm.');
const nonNegativeInteger = zod_1.z.number().int().nonnegative();
exports.restaurantAccessSchema = zod_1.z.object({ enabled: zod_1.z.boolean() });
exports.updateRestaurantSettingsSchema = zod_1.z.object({
    average_dining_minutes: zod_1.z.number().int().min(15).max(480),
    slot_interval_minutes: zod_1.z.number().int().min(5).max(240),
    minimum_advance_minutes: zod_1.z.number().int().min(0).max(525600),
    maximum_advance_days: zod_1.z.number().int().min(1).max(365),
    auto_confirm_reservations: zod_1.z.boolean(),
    allow_customer_cancellation: zod_1.z.boolean(),
    cancellation_limit_minutes: zod_1.z.number().int().min(0).max(525600),
    minimum_party_size: zod_1.z.number().int().min(1).max(100),
    maximum_party_size: zod_1.z.number().int().min(1).max(100),
    require_phone: zod_1.z.boolean(),
    require_email: zod_1.z.boolean(),
    allow_walk_ins: zod_1.z.boolean(),
    deposit_enabled: zod_1.z.boolean(),
    deposit_amount_cents: zod_1.z.number().int().min(0).max(100000000),
    deposit_mode: zod_1.z.enum(['PER_PERSON', 'PER_TABLE']),
    deposit_qr_image_url: zod_1.z.string().trim().max(512).nullable(),
    turnover_buffer_minutes: zod_1.z.number().int().min(0).max(240),
    cleanup_buffer_minutes: zod_1.z.number().int().min(0).max(240),
    at_risk_warning_window_minutes: zod_1.z.number().int().min(5).max(240),
}).superRefine((input, ctx) => {
    if (input.maximum_party_size < input.minimum_party_size) {
        ctx.addIssue({ code: 'custom', path: ['maximum_party_size'], message: 'Debe ser mayor o igual al tamaño mínimo.' });
    }
    if (input.deposit_enabled && input.deposit_amount_cents <= 0) {
        ctx.addIssue({ code: 'custom', path: ['deposit_amount_cents'], message: 'El depósito debe ser mayor a cero.' });
    }
    if (input.deposit_enabled && !input.deposit_qr_image_url) {
        ctx.addIssue({ code: 'custom', path: ['deposit_qr_image_url'], message: 'Subí un código QR para cobrar el depósito.' });
    }
});
const diningAreaFields = zod_1.z.object({
    name,
    description: optionalDescription,
    sort_order: nonNegativeInteger.optional(),
    is_active: zod_1.z.boolean().optional(),
});
exports.createRestaurantDiningAreaSchema = diningAreaFields;
exports.updateRestaurantDiningAreaSchema = diningAreaFields.partial().refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo.');
const rawTableFields = zod_1.z.object({
    dining_area_id: zod_1.z.number().int().positive(),
    name,
    minimum_seats: zod_1.z.number().int().min(1).max(100),
    maximum_seats: zod_1.z.number().int().min(1).max(100),
    sort_order: nonNegativeInteger.optional(),
    is_active: zod_1.z.boolean().optional(),
});
const tableFields = rawTableFields.superRefine((input, ctx) => {
    if (input.maximum_seats < input.minimum_seats) {
        ctx.addIssue({ code: 'custom', path: ['maximum_seats'], message: 'Debe ser mayor o igual a los asientos mínimos.' });
    }
});
exports.createRestaurantTableSchema = tableFields;
exports.updateRestaurantTableSchema = rawTableFields.partial().superRefine((input, ctx) => {
    if (input.minimum_seats !== undefined && input.maximum_seats !== undefined && input.maximum_seats < input.minimum_seats) {
        ctx.addIssue({ code: 'custom', path: ['maximum_seats'], message: 'Debe ser mayor o igual a los asientos mínimos.' });
    }
});
const rawServicePeriodFields = zod_1.z.object({
    day_of_week: zod_1.z.number().int().min(0).max(6),
    name: zod_1.z.string().trim().max(120).nullable().optional(),
    start_time: time,
    end_time: time,
    sort_order: nonNegativeInteger.optional(),
    is_active: zod_1.z.boolean().optional(),
});
const servicePeriodFields = rawServicePeriodFields.superRefine((input, ctx) => {
    if (input.start_time >= input.end_time) {
        ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'La hora de fin debe ser posterior a la de inicio. No se admiten períodos nocturnos.' });
    }
});
exports.createRestaurantServicePeriodSchema = servicePeriodFields;
exports.updateRestaurantServicePeriodSchema = rawServicePeriodFields.partial();
