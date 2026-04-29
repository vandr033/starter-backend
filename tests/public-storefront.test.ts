import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopPlan } from '@prisma/client';
import {
  getDefaultProductCapabilities,
  type CompanyEntitlementPayload,
  type EffectiveCompanyProduct,
  type ProductCapability,
} from '../src/config/product-entitlements';
import {
  buildPublicEntitlementSummary,
  buildPublicStorefrontVisibility,
  sanitizePublicThemeConfig,
} from '../src/utils/public-storefront';

function activeProduct(product: EffectiveCompanyProduct['productCode'], tier: EffectiveCompanyProduct['tierCode'], isCore = true): EffectiveCompanyProduct {
  return {
    productCode: product,
    tierCode: tier,
    status: 'ACTIVE',
    isCore,
    includedByDefault: false,
  };
}

function buildEntitlements(params: {
  products: EffectiveCompanyProduct[];
  capabilities: ProductCapability[];
}): CompanyEntitlementPayload {
  const capabilityRecord = getDefaultProductCapabilities();
  for (const capability of params.capabilities) {
    capabilityRecord[capability] = true;
  }

  return {
    version: 1,
    currentPlan: ShopPlan.BUSINESS,
    maxStaffMembers: 10,
    features: {} as never,
    requiredPlans: {} as never,
    source: 'modular',
    productCapabilities: capabilityRecord,
    products: params.products,
    activeCoreProducts: params.products.filter((product) => product.isCore).map((product) => product.tierCode),
    activeAddOns: params.products.filter((product) => !product.isCore).map((product) => product.tierCode),
  };
}

test('company with only Reservas does not expose Events or Classes storefront areas', () => {
  const entitlements = buildEntitlements({
    products: [activeProduct('RESERVAS', 'RESERVAS_BASE')],
    capabilities: ['RESERVAS_BASE'],
  });

  const visibility = buildPublicStorefrontVisibility({
    entitlements,
    availability: {
      availableUntil: new Date('2026-12-31T23:59:59.000Z'),
      is_active: true,
      deleted_at: null,
    },
  });

  assert.equal(visibility.servicesVisible, true);
  assert.equal(visibility.bookingsEnabled, true);
  assert.equal(visibility.eventsVisible, false);
  assert.equal(visibility.classesVisible, false);
});

test('company with only Eventos does not expose Reservas visibility flags', () => {
  const entitlements = buildEntitlements({
    products: [activeProduct('EVENTOS', 'EVENTOS_BASE')],
    capabilities: ['EVENTOS_BASE'],
  });

  const visibility = buildPublicStorefrontVisibility({
    entitlements,
    availability: {
      availableUntil: new Date('2026-12-31T23:59:59.000Z'),
      is_active: true,
      deleted_at: null,
    },
  });

  assert.equal(visibility.bookingsEnabled, false);
  assert.equal(visibility.servicesVisible, false);
  assert.equal(visibility.eventsVisible, true);
});

test('company with only Clases does not expose Eventos visibility flags', () => {
  const entitlements = buildEntitlements({
    products: [activeProduct('CLASES', 'CLASES_BASE')],
    capabilities: ['CLASES_BASE'],
  });

  const visibility = buildPublicStorefrontVisibility({
    entitlements,
    availability: {
      availableUntil: new Date('2026-12-31T23:59:59.000Z'),
      is_active: true,
      deleted_at: null,
    },
  });

  assert.equal(visibility.classesVisible, true);
  assert.equal(visibility.eventsVisible, false);
});

test('expired company disables all public booking and registration areas', () => {
  const entitlements = buildEntitlements({
    products: [
      activeProduct('RESERVAS', 'RESERVAS_BASE'),
      activeProduct('EVENTOS', 'EVENTOS_BASE'),
      activeProduct('CLASES', 'CLASES_BASE'),
    ],
    capabilities: ['RESERVAS_BASE', 'EVENTOS_BASE', 'CLASES_BASE'],
  });

  const visibility = buildPublicStorefrontVisibility({
    entitlements,
    availability: {
      availableUntil: new Date('2026-01-01T00:00:00.000Z'),
      is_active: true,
      deleted_at: null,
    },
  });

  assert.equal(visibility.storefrontEnabled, false);
  assert.equal(visibility.bookingsEnabled, false);
  assert.equal(visibility.eventRegistrationEnabled, false);
  assert.equal(visibility.classEnrollmentEnabled, false);
});

test('company without Personalizacion Plus has advanced storefront fields stripped from the public payload', () => {
  const entitlements = buildEntitlements({
    products: [activeProduct('RESERVAS', 'RESERVAS_BASE')],
    capabilities: ['RESERVAS_BASE'],
  });

  const visibility = buildPublicStorefrontVisibility({
    entitlements,
    availability: {
      availableUntil: new Date('2026-12-31T23:59:59.000Z'),
      is_active: true,
      deleted_at: null,
    },
  });

  const theme = sanitizePublicThemeConfig({
    brand_color: '#2563eb',
    home_cta_buttons: [{ label: 'Reserve now' }],
    home_section_order: ['services', 'about'],
    footer_config: { show_address: false },
    announcement_banners: [{ message: 'Promo' }],
  }, visibility);

  assert.equal(theme.home_cta_buttons, null);
  assert.equal(theme.home_section_order, null);
  assert.equal(theme.footer_config, null);
  assert.equal(theme.announcement_banners, null);
});

test('public entitlement summary includes modular products, add-ons, capabilities, and visibility flags', () => {
  const entitlements = buildEntitlements({
    products: [
      activeProduct('RESERVAS', 'RESERVAS_BASE'),
      activeProduct('PERSONALIZACION', 'PERSONALIZACION_PLUS', false),
    ],
    capabilities: ['RESERVAS_BASE', 'PERSONALIZACION_PLUS', 'STOREFRONT_ADVANCED_CTA'],
  });

  const visibility = buildPublicStorefrontVisibility({
    entitlements,
    availability: {
      availableUntil: new Date('2026-12-31T23:59:59.000Z'),
      is_active: true,
      deleted_at: null,
    },
  });

  const summary = buildPublicEntitlementSummary(entitlements, visibility);

  assert.deepEqual(summary.activeProducts, ['RESERVAS_BASE']);
  assert.deepEqual(summary.activeAddOns, ['PERSONALIZACION_PLUS']);
  assert.equal(summary.capabilities.PERSONALIZACION_PLUS, true);
  assert.equal(summary.publicFeatures.customCtasVisible, true);
});
