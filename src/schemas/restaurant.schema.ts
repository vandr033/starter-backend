import { z } from 'zod';

const name = z.string().trim().min(1, 'El nombre es obligatorio.').max(120);
const optionalDescription = z.string().trim().max(500).nullable().optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:mm.');
const nonNegativeInteger = z.number().int().nonnegative();

export const restaurantAccessSchema = z.object({ enabled: z.boolean() });

export const updateRestaurantSettingsSchema = z.object({
  average_dining_minutes: z.number().int().min(15).max(480),
  slot_interval_minutes: z.number().int().min(5).max(240),
  minimum_advance_minutes: z.number().int().min(0).max(525600),
  maximum_advance_days: z.number().int().min(1).max(365),
  auto_confirm_reservations: z.boolean(),
  allow_customer_cancellation: z.boolean(),
  cancellation_limit_minutes: z.number().int().min(0).max(525600),
  minimum_party_size: z.number().int().min(1).max(100),
  maximum_party_size: z.number().int().min(1).max(100),
  require_phone: z.boolean(),
  require_email: z.boolean(),
  allow_walk_ins: z.boolean(),
  deposit_enabled: z.boolean(),
  deposit_amount_cents: z.number().int().min(0).max(100000000),
  deposit_mode: z.enum(['PER_PERSON', 'PER_TABLE']),
  deposit_qr_image_url: z.string().trim().max(512).nullable(),
  turnover_buffer_minutes: z.number().int().min(0).max(240),
  cleanup_buffer_minutes: z.number().int().min(0).max(240),
  at_risk_warning_window_minutes: z.number().int().min(5).max(240),
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

const diningAreaFields = z.object({
  name,
  description: optionalDescription,
  sort_order: nonNegativeInteger.optional(),
  is_active: z.boolean().optional(),
});
export const createRestaurantDiningAreaSchema = diningAreaFields;
export const updateRestaurantDiningAreaSchema = diningAreaFields.partial().refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo.');

const rawTableFields = z.object({
  dining_area_id: z.number().int().positive(),
  name,
  minimum_seats: z.number().int().min(1).max(100),
  maximum_seats: z.number().int().min(1).max(100),
  sort_order: nonNegativeInteger.optional(),
  is_active: z.boolean().optional(),
});
const tableFields = rawTableFields.superRefine((input, ctx) => {
  if (input.maximum_seats < input.minimum_seats) {
    ctx.addIssue({ code: 'custom', path: ['maximum_seats'], message: 'Debe ser mayor o igual a los asientos mínimos.' });
  }
});
export const createRestaurantTableSchema = tableFields;
export const updateRestaurantTableSchema = rawTableFields.partial().superRefine((input, ctx) => {
  if (input.minimum_seats !== undefined && input.maximum_seats !== undefined && input.maximum_seats < input.minimum_seats) {
    ctx.addIssue({ code: 'custom', path: ['maximum_seats'], message: 'Debe ser mayor o igual a los asientos mínimos.' });
  }
});

const rawServicePeriodFields = z.object({
  day_of_week: z.number().int().min(0).max(6),
  name: z.string().trim().max(120).nullable().optional(),
  start_time: time,
  end_time: time,
  sort_order: nonNegativeInteger.optional(),
  is_active: z.boolean().optional(),
});
const servicePeriodFields = rawServicePeriodFields.superRefine((input, ctx) => {
  if (input.start_time >= input.end_time) {
    ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'La hora de fin debe ser posterior a la de inicio. No se admiten períodos nocturnos.' });
  }
});
export const createRestaurantServicePeriodSchema = servicePeriodFields;
export const updateRestaurantServicePeriodSchema = rawServicePeriodFields.partial();
