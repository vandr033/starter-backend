import assert from 'node:assert/strict';
import test from 'node:test';
import { BillingCycle, Prisma, ShopPlan } from '@prisma/client';
import { buildLegacyBackfillPayload } from '../prisma/product-subscriptions.seed';

test('backfill maps STARTER to one core subscription plus bundled base add-ons', () => {
  const payload = buildLegacyBackfillPayload({
    id: 101,
    plan: ShopPlan.STARTER,
    billingCycle: BillingCycle.MONTHLY,
    pricePaid: new Prisma.Decimal('79.00'),
    currency: 'Bs.',
    availableUntil: new Date('2027-03-12T23:59:59.000Z'),
    created_at: new Date('2025-01-01T12:00:00.000Z'),
  });

  assert.deepEqual(
    payload.subscriptions.map((subscription) => subscription.tierCode),
    ['RESERVAS_BASE', 'CRM_BASE', 'PERSONALIZACION_BASE', 'MENSAJERIA_BASE'],
  );
  assert.equal(
    payload.subscriptions.filter((subscription) => subscription.pricePaid !== null).length,
    1,
  );
  assert.equal(payload.overrides.length, 0);
});

test('backfill maps BUSINESS to compatibility base tiers plus targeted override capabilities', () => {
  const payload = buildLegacyBackfillPayload({
    id: 102,
    plan: ShopPlan.BUSINESS,
    billingCycle: BillingCycle.MONTHLY,
    pricePaid: new Prisma.Decimal('149.00'),
    currency: 'Bs.',
    availableUntil: new Date('2027-03-12T23:59:59.000Z'),
    created_at: new Date('2025-01-01T12:00:00.000Z'),
  });

  assert.deepEqual(
    payload.subscriptions.map((subscription) => subscription.tierCode),
    [
      'RESERVAS_PRO',
      'EVENTOS_BASE',
      'CRM_BASE',
      'MENSAJERIA_BASE',
      'METRICAS_BASE',
      'PERSONALIZACION_BASE',
    ],
  );
  assert.deepEqual(
    payload.overrides.map((override) => override.capability),
    [
      'METRICAS_OPERATIONAL_DASHBOARD',
      'METRICAS_REVIEW_ANALYTICS',
      'STOREFRONT_SECTION_ORDER',
      'STOREFRONT_FOOTER_CUSTOMIZATION',
    ],
  );
  assert.equal(payload.historyEntry.action, 'LEGACY_PLAN_BACKFILL');
});

test('backfill maps PRO to the full modular catalog without extra overrides', () => {
  const payload = buildLegacyBackfillPayload({
    id: 103,
    plan: ShopPlan.PRO,
    billingCycle: BillingCycle.YEARLY,
    pricePaid: new Prisma.Decimal('399.00'),
    currency: 'Bs.',
    availableUntil: new Date('2027-03-12T23:59:59.000Z'),
    created_at: new Date('2025-01-01T12:00:00.000Z'),
  });

  assert.deepEqual(
    payload.subscriptions.map((subscription) => subscription.tierCode),
    [
      'RESERVAS_PRO',
      'EVENTOS_PRO',
      'CLASES_PRO',
      'CRM_PRO',
      'MENSAJERIA_PRO',
      'PERSONALIZACION_PLUS',
      'METRICAS_PRO',
    ],
  );
  assert.equal(payload.overrides.length, 0);
});
