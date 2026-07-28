import { z } from 'zod';

const source = z.enum(['ADMIN', 'PHONE', 'WHATSAPP', 'WALK_IN']);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:mm.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const shared = z.object({
  customer_name: z.string().trim().min(1, 'El nombre del cliente es obligatorio.').max(160),
  customer_phone: optionalText(32),
  customer_email: z.string().trim().email('Ingresá un correo válido.').max(255).nullable().optional(),
  party_size: z.number().int().min(1).max(100),
  reservation_date: date,
  reservation_time: time,
  table_id: z.number().int().positive().nullable().optional(),
  auto_assign: z.boolean().optional(),
  notes: optionalText(2000),
  internal_notes: optionalText(2000),
});

export const createRestaurantReservationSchema = shared.extend({
  source,
  initial_status: z.enum(['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED']).optional(),
}).superRefine((input, ctx) => {
  if (input.source === 'WALK_IN' && input.initial_status && !['ARRIVED', 'SEATED'].includes(input.initial_status)) {
    ctx.addIssue({ code: 'custom', path: ['initial_status'], message: 'Un walk-in debe iniciar como llegado o sentado.' });
  }
  if (input.source !== 'WALK_IN' && input.initial_status && !['PENDING', 'CONFIRMED'].includes(input.initial_status)) {
    ctx.addIssue({ code: 'custom', path: ['initial_status'], message: 'Estado inicial no permitido.' });
  }
});

export const updateRestaurantReservationSchema = shared.partial().extend({
  auto_assign: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo.');

export const restaurantReservationStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  reason: optionalText(500),
});

export const assignRestaurantTableSchema = z.object({
  table_id: z.number().int().positive().nullable(),
  auto_assign: z.boolean().optional(),
}).refine((value) => value.table_id !== null || value.auto_assign === true, 'Elegí una mesa o solicitá asignación automática.');

export const restaurantReservationQuerySchema = z.object({
  date: date.optional(), dateFrom: date.optional(), dateTo: date.optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  source: z.enum(['ONLINE', 'ADMIN', 'PHONE', 'WHATSAPP', 'WALK_IN']).optional(),
  diningAreaId: z.coerce.number().int().positive().optional(), tableId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(160).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['start_time_asc', 'start_time_desc', 'created_at_desc']).default('start_time_asc'),
});

export const restaurantMetricsQuerySchema = z.object({
  dateFrom: date.optional(),
  dateTo: date.optional(),
});
