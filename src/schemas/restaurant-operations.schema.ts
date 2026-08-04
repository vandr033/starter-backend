import { z } from 'zod';

const id = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const restaurantVisitSchema = z.object({
  id: id.optional(), reservation_id: id.nullable().optional(), shift_id: id.nullable().optional(), table_id: id.nullable().optional(), combination_session_id: id.nullable().optional(), primary_waiter_user_id: z.string().trim().min(1).nullable().optional(), guest_count: z.number().int().min(1).max(100).optional(), subtotal_amount_cents: z.number().int().min(0).max(2_000_000_000).optional(), discount_amount_cents: z.number().int().min(0).max(2_000_000_000).optional(), tip_amount_cents: z.number().int().min(0).max(2_000_000_000).optional(), total_paid_amount_cents: z.number().int().min(0).max(2_000_000_000).optional(), payment_method: z.enum(['CASH', 'CARD', 'QR', 'TRANSFER', 'MIXED', 'OTHER']).optional(), mixed_payment_breakdown: z.record(z.string(), z.number().int().min(0)).nullable().optional(), pos_reference: text(160), closing_notes: text(4000), complete: z.boolean().optional(), }).superRefine((value, ctx) => {
  if (value.payment_method === 'MIXED' && !value.mixed_payment_breakdown) ctx.addIssue({ code: 'custom', path: ['mixed_payment_breakdown'], message: 'Indicá el desglose de pagos mixtos.' });
});
export const staffVisitSchema = restaurantVisitSchema.refine((value) => Boolean(value.reservation_id) || Boolean(value.table_id), 'Asociá el consumo a una reserva o mesa.');

export const visitQuerySchema = z.object({ dateFrom: date.optional(), dateTo: date.optional(), shift_id: id.optional(), waiter_user_id: z.string().trim().min(1).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
export const reopenVisitSchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const waitlistSchema = z.object({ guest_name: z.string().trim().min(1).max(160), phone: text(32), email: z.string().trim().email().max(255).nullable().optional(), customer_profile_id: id.nullable().optional(), party_size: z.number().int().min(1).max(100), preferred_dining_area_id: id.nullable().optional(), accessibility_notes: text(1000), seating_notes: text(1000), source: z.enum(['WALK_IN', 'PHONE', 'WHATSAPP', 'OTHER']).optional(), priority: z.number().int().min(0).max(100).optional(), manual_order: z.number().int().min(0).max(100000).optional(), estimated_wait_minutes: z.number().int().min(1).max(1440).optional(), internal_notes: text(4000), });
export const waitlistUpdateSchema = waitlistSchema.partial().extend({ status: z.enum(['WAITING', 'NOTIFIED', 'ARRIVED', 'SEATED', 'LEFT', 'CANCELLED']).optional() }).refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo.');
export const waitlistQuerySchema = z.object({ status: z.enum(['WAITING', 'NOTIFIED', 'ARRIVED', 'SEATED', 'LEFT', 'CANCELLED']).optional(), preferred_dining_area_id: id.optional(), search: z.string().trim().max(160).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const waitlistRecommendationSchema = z.object({ table_id: id.optional(), at: z.string().datetime({ offset: true }).optional() });
export const seatWaitlistSchema = z.object({ table_id: id.nullable().optional(), combination_id: id.nullable().optional() }).refine((value) => Boolean(value.table_id) !== Boolean(value.combination_id), 'Elegí una mesa o una combinación.');

export const depositQuerySchema = z.object({ status: z.enum(['REQUIRED', 'PENDING', 'PROOF_SUBMITTED', 'APPROVED', 'REJECTED', 'WAIVED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'EXPIRED']).optional(), dateFrom: date.optional(), dateTo: date.optional(), search: z.string().trim().max(160).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
export const depositReviewSchema = z.object({ action: z.enum(['APPROVE', 'REJECT', 'WAIVE', 'REFUND']), reason: z.string().trim().max(500).nullable().optional(), amountCents: z.number().int().positive().optional(), paymentMethod: z.enum(['CASH', 'CARD', 'QR', 'TRANSFER', 'OTHER']).nullable().optional() });

export const crmQuerySchema = z.object({ vip: z.enum(['true', 'false']).transform((value) => value === 'true').optional(), search: z.string().trim().max(160).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const crmProfileSchema = z.object({ vip: z.boolean().optional(), vip_level: text(40), birthday: date.nullable().optional(), anniversary: date.nullable().optional(), preferred_dining_area_id: id.nullable().optional(), preferred_table_id: id.nullable().optional(), preferred_waiter_user_id: z.string().trim().min(1).nullable().optional(), seating_preference: text(500), accessibility_requirements: text(1000), dietary_preferences: text(1000), allergies: text(1000), favorite_items: z.unknown().nullable().optional(), customer_facing_notes: text(1000), internal_hospitality_notes: text(4000), tags: z.unknown().nullable().optional(), }).refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo.');

export const closeoutQuerySchema = z.object({ status: z.enum(['PREVIEWED', 'CLOSED', 'FINALIZED', 'REOPENED']).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const closeoutSchema = z.object({ manager_notes: text(4000), operational_issues: text(4000), override_warnings: z.boolean().optional(), override_reason: text(500) });
export const closeoutReopenSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export const closeoutAdjustmentSchema = z.object({ section: z.string().trim().min(1).max(80), adjusted_snapshot: z.unknown(), reason: z.string().trim().min(1).max(500) });
