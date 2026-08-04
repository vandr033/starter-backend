import assert from 'node:assert/strict';
import test from 'node:test';
import { restaurantVisitSchema, staffVisitSchema, waitlistSchema, depositReviewSchema, closeoutAdjustmentSchema } from '../src/schemas/restaurant-operations.schema';
import { requireRestaurantCompanyContext } from '../src/middlewares/requireRestaurantCompanyContext';

test('restaurant operations schemas keep money in integer minor units and validate mixed payments', () => {
  assert.equal(restaurantVisitSchema.safeParse({ subtotal_amount_cents: 1250, total_paid_amount_cents: 1250, payment_method: 'CASH' }).success, true);
  assert.equal(restaurantVisitSchema.safeParse({ subtotal_amount_cents: 12.5 }).success, false);
  assert.equal(restaurantVisitSchema.safeParse({ payment_method: 'MIXED', total_paid_amount_cents: 1000, mixed_payment_breakdown: { CASH: 600, CARD: 400 } }).success, true);
  assert.equal(restaurantVisitSchema.safeParse({ payment_method: 'MIXED', total_paid_amount_cents: 1000 }).success, false);
});

test('waitlist and closeout schemas require bounded operational fields', () => {
  assert.equal(waitlistSchema.safeParse({ guest_name: 'Ana', party_size: 3, source: 'WALK_IN' }).success, true);
  assert.equal(waitlistSchema.safeParse({ guest_name: 'Ana', party_size: 0 }).success, false);
  assert.equal(staffVisitSchema.safeParse({ table_id: 12, complete: true, total_paid_amount_cents: 5000 }).success, true);
  assert.equal(staffVisitSchema.safeParse({ complete: true }).success, false);
  assert.equal(depositReviewSchema.safeParse({ action: 'APPROVE' }).success, true);
  assert.equal(closeoutAdjustmentSchema.safeParse({ section: 'revenue_summary', adjusted_snapshot: {}, reason: 'Caja corregida' }).success, true);
  assert.equal(closeoutAdjustmentSchema.safeParse({ section: 'revenue_summary', adjusted_snapshot: {} }).success, false);
});

test('restaurant middleware fails closed when an active company cookie is absent', async () => {
  let payload: any = null;
  let statusCode = 0;
  let continued = false;
  const request: any = { authUser: { id: 'user-1' }, headers: {} };
  const response: any = { status(value: number) { statusCode = value; return this; }, json(value: unknown) { payload = value; return value; } };
  await requireRestaurantCompanyContext(['OWNER'] as any)(request, response, () => { continued = true; });
  assert.equal(statusCode, 400);
  assert.equal(payload.reason, 'ACTIVE_COMPANY_REQUIRED');
  assert.equal(continued, false);
});
