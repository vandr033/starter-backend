import assert from 'node:assert/strict';
import test from 'node:test';
import { BillingCycle, ProductCode, ProductTierCode, ShopPlan } from '@prisma/client';
import {
  diffActiveProducts,
  mapLegacyPlanCompatibility,
  normalizeCommercialConfiguration,
} from '../src/services/super-admin-shop-commercial.service';

test('normalizeCommercialConfiguration auto-includes bundled base add-ons for modular companies', () => {
  const normalized = normalizeCommercialConfiguration({
    activeProducts: [
      {
        productCode: ProductCode.RESERVAS,
        tierCode: ProductTierCode.RESERVAS_BASE,
      },
    ],
    requestedProducts: [],
    companyBillingCycle: BillingCycle.MONTHLY,
    companyPricePaid: 149,
    companyCurrency: 'Bs.',
    companyAvailableUntil: new Date('2027-03-12T23:59:59.000Z'),
  });

  assert.equal(normalized.source, 'modular');
  assert.equal(normalized.legacyPlan, ShopPlan.STARTER);
  assert.deepEqual(
    normalized.activeProducts.map((product) => product.tierCode),
    [
      ProductTierCode.RESERVAS_BASE,
      ProductTierCode.CRM_BASE,
      ProductTierCode.MENSAJERIA_BASE,
      ProductTierCode.PERSONALIZACION_BASE,
    ],
  );
});

test('normalizeCommercialConfiguration keeps requested products separate from active entitlements', () => {
  const normalized = normalizeCommercialConfiguration({
    activeProducts: [
      {
        productCode: ProductCode.RESERVAS,
        tierCode: ProductTierCode.RESERVAS_PRO,
      },
      {
        productCode: ProductCode.EVENTOS,
        tierCode: ProductTierCode.EVENTOS_BASE,
      },
      {
        productCode: ProductCode.CRM,
        tierCode: ProductTierCode.CRM_PRO,
      },
    ],
    requestedProducts: [
      {
        productCode: ProductCode.CLASES,
        tierCode: ProductTierCode.CLASES_PRO,
      },
    ],
    companyBillingCycle: BillingCycle.YEARLY,
    companyPricePaid: 399,
    companyCurrency: 'USD',
    companyAvailableUntil: new Date('2028-01-01T00:00:00.000Z'),
  });

  assert.equal(normalized.legacyPlan, ShopPlan.BUSINESS);
  assert.equal(normalized.requestedProducts.length, 1);
  assert.equal(normalized.requestedProducts[0].tierCode, ProductTierCode.CLASES_PRO);
  assert.equal(
    normalized.activeProducts.some((product) => product.productCode === ProductCode.CLASES),
    false,
  );
});

test('mapLegacyPlanCompatibility promotes any clases tier to PRO compatibility', () => {
  const compatibilityPlan = mapLegacyPlanCompatibility([
    {
      tierCode: ProductTierCode.CLASES_BASE,
    },
  ]);

  assert.equal(compatibilityPlan, ShopPlan.PRO);
});

test('diffActiveProducts detects upgrades, metadata updates, and cancellations', () => {
  const changes = diffActiveProducts(
    [
      {
        productCode: ProductCode.RESERVAS,
        productTierCode: ProductTierCode.RESERVAS_BASE,
        billingCycle: BillingCycle.MONTHLY,
        pricePaid: 149,
        currency: 'Bs.',
        availableUntil: new Date('2027-03-12T23:59:59.000Z'),
      },
      {
        productCode: ProductCode.METRICAS,
        productTierCode: ProductTierCode.METRICAS_BASE,
        billingCycle: BillingCycle.MONTHLY,
        pricePaid: null,
        currency: 'Bs.',
        availableUntil: new Date('2027-03-12T23:59:59.000Z'),
      },
    ],
    [
      {
        productCode: ProductCode.RESERVAS,
        tierCode: ProductTierCode.RESERVAS_PRO,
        billingCycle: BillingCycle.MONTHLY,
        pricePaid: 199,
        currency: 'Bs.',
        availableUntil: new Date('2027-03-12T23:59:59.000Z'),
        isCoreProduct: true,
        includedByDefault: false,
      },
    ],
  );

  assert.deepEqual(
    changes.map((change) => change.action),
    ['PRODUCT_UPGRADED', 'PRODUCT_CANCELLED'],
  );
});
