import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:mm.');
const id = z.number().int().positive();
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const role = z.enum(['MANAGER', 'HOST', 'WAITER']);

const shiftFields = z.object({
  name: z.string().trim().min(1).max(160),
  shift_date: date,
  start_time: time,
  end_time: time,
  timezone: z.string().trim().min(1).max(64).optional(),
  service_period_id: id.nullable().optional(),
  notes: text(4000),
  shift_manager_user_id: z.string().trim().min(1).nullable().optional(),
});

export const createRestaurantShiftSchema = shiftFields.superRefine((input, ctx) => {
  if (input.start_time >= input.end_time) ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'La hora de fin debe ser posterior a la de inicio.' });
});

export const updateRestaurantShiftSchema = shiftFields.partial().superRefine((input, ctx) => {
  if (input.start_time && input.end_time && input.start_time >= input.end_time) ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'La hora de fin debe ser posterior a la de inicio.' });
}).refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo.');

export const restaurantShiftQuerySchema = z.object({
  dateFrom: date.optional(),
  dateTo: date.optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']).optional(),
});

export const shiftMemberSchema = z.object({ user_id: z.string().trim().min(1), role });
export const replaceShiftMembersSchema = z.object({ members: z.array(shiftMemberSchema).max(200) });

export const shiftTableAssignmentSchema = z.object({ table_id: id, user_id: z.string().trim().min(1) });
export const replaceShiftAssignmentsSchema = z.object({ assignments: z.array(shiftTableAssignmentSchema).max(500) });
export const replaceShiftDiningAreasSchema = z.object({ dining_area_ids: z.array(id).max(100) });
export const replaceShiftSetupSchema = z.object({ members: z.array(shiftMemberSchema).max(200), dining_area_ids: z.array(id).max(100), assignments: z.array(shiftTableAssignmentSchema).max(500) });

export const copyShiftSchema = z.object({ shift_date: date, name: z.string().trim().min(1).max(160).optional() });
export const saveShiftTemplateSchema = z.object({ name: z.string().trim().min(1).max(160) });
export const useShiftTemplateSchema = z.object({
  template_id: id,
  name: z.string().trim().min(1).max(160).optional(),
  shift_date: date,
  start_time: time.optional(),
  end_time: time.optional(),
  notes: text(4000),
  shift_manager_user_id: z.string().trim().min(1).nullable().optional(),
});

export const tableCombinationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  dining_area_id: id.nullable().optional(),
  table_ids: z.array(id).min(2).max(20),
  is_active: z.boolean().optional(),
});

export const tableStateSchema = z.object({
  status: z.enum(['AVAILABLE', 'RESERVED_SOON', 'RESERVED', 'ARRIVED', 'SEATED', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED']),
  blocked_reason: text(500),
}).superRefine((input, ctx) => { if (input.status === 'BLOCKED' && !input.blocked_reason) ctx.addIssue({ code: 'custom', path: ['blocked_reason'], message: 'Indicá por qué la mesa está bloqueada.' }); });

export const restaurantFloorQuerySchema = z.object({
  at: z.string().datetime({ offset: true }).optional(),
  shiftId: z.coerce.number().int().positive().optional(),
});

export const relocateRestaurantReservationSchema = z.object({
  table_id: id.optional(),
  combination_id: id.optional(),
  reason: text(500),
  initiated_from_at_risk: z.boolean().optional(),
}).refine((value) => Boolean(value.table_id) !== Boolean(value.combination_id), 'Elegí una mesa o una combinación válida.');

export const waiterReservationStatusSchema = z.object({ status: z.enum(['ARRIVED', 'SEATED']) });
export const waiterInternalNoteSchema = z.object({ note: z.string().trim().min(1).max(1000), table_id: id.optional(), reservation_id: id.optional() }).refine((value) => Boolean(value.table_id) || Boolean(value.reservation_id), 'Asociá la nota a una mesa o reserva.');
