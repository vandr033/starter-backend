import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompanyProductSubscriptionStatus,
  ProductTierCode,
  ShopPlan,
} from '@prisma/client';
import {
  getProductTierDefinition,
  isCoreProductCode,
} from '../src/config/product-entitlements';
import {
  getLegacyPlanFallbackEntitlements,
  resolveCompanyEntitlementsFromState,
} from '../src/services/company-entitlements.service';

function activeSubscription(tierCode: ProductTierCode) {
  const tier = getProductTierDefinition(tierCode);

  return {
    productCode: tier.productCode,
    tierCode,
    status: CompanyProductSubscriptionStatus.ACTIVE,
    isCoreProduct: isCoreProductCode(tier.productCode),
    capabilityCodes: [...tier.includedCapabilities],
  };
}

test('legacy fallback preserves STARTER, BUSINESS, and PRO plan access when no modular subscriptions exist', () => {
  const starter = getLegacyPlanFallbackEntitlements(ShopPlan.STARTER);
  const business = getLegacyPlanFallbackEntitlements(ShopPlan.BUSINESS);
  const pro = getLegacyPlanFallbackEntitlements(ShopPlan.PRO);

  assert.equal(starter.source, 'legacy_plan');
  assert.equal(starter.features.GROUP_EVENTS, false);
  assert.equal(starter.productCapabilities.RESERVAS_BASE, true);
  assert.equal(starter.productCapabilities.CRM_BASE, true);

  assert.equal(business.features.GROUP_EVENTS, true);
  assert.equal(business.features.GROUP_CLASSES, false);
  assert.equal(business.features.CUSTOMER_IMPORT_EXPORT, false);
  assert.equal(business.features.BOOKING_REMINDERS, false);
  assert.equal(business.features.REVIEW_REQUEST_EMAIL, false);

  assert.equal(pro.features.GROUP_CLASSES, true);
  assert.equal(pro.features.BULK_WHATSAPP_MESSAGING, true);
  assert.equal(pro.features.OUTREACH_REACTIVATION_TOOLS, true);
  assert.equal(pro.productCapabilities.CRM_PRO, true);
});

test('company with Reservas Base gets booking capability', () => {
  const entitlements = resolveCompanyEntitlementsFromState({
    plan: ShopPlan.STARTER,
    hasModularSubscriptions: true,
    activeSubscriptions: [activeSubscription(ProductTierCode.RESERVAS_BASE)],
    capabilityOverrides: [],
  });

  assert.equal(entitlements.source, 'modular');
  assert.equal(entitlements.productCapabilities.RESERVAS_BASE, true);
  assert.equal(entitlements.productCapabilities.CRM_BASE, true);
  assert.equal(entitlements.activeCoreProducts.includes(ProductTierCode.RESERVAS_BASE), true);
  assert.equal(entitlements.activeAddOns.includes(ProductTierCode.CRM_BASE), true);
});

test('company with Eventos Pro gets EVENTOS_BASE and EVENTOS_PRO', () => {
  const entitlements = resolveCompanyEntitlementsFromState({
    plan: ShopPlan.STARTER,
    hasModularSubscriptions: true,
    activeSubscriptions: [activeSubscription(ProductTierCode.EVENTOS_PRO)],
    capabilityOverrides: [],
  });

  assert.equal(entitlements.productCapabilities.EVENTOS_BASE, true);
  assert.equal(entitlements.productCapabilities.EVENTOS_PRO, true);
  assert.equal(entitlements.features.GROUP_EVENTS, true);
  assert.equal(entitlements.features.GROUP_ADVANCED, true);
});

test('company with Clases Base does not get Clases Pro', () => {
  const entitlements = resolveCompanyEntitlementsFromState({
    plan: ShopPlan.STARTER,
    hasModularSubscriptions: true,
    activeSubscriptions: [activeSubscription(ProductTierCode.CLASES_BASE)],
    capabilityOverrides: [],
  });

  assert.equal(entitlements.productCapabilities.CLASES_BASE, true);
  assert.equal(entitlements.productCapabilities.CLASES_PRO, false);
  assert.equal(entitlements.features.GROUP_CLASSES, true);
  assert.equal(entitlements.features.GROUP_ADVANCED, false);
});

test('company with CRM Pro gets CRM_BASE and CRM_PRO', () => {
  const entitlements = resolveCompanyEntitlementsFromState({
    plan: ShopPlan.STARTER,
    hasModularSubscriptions: true,
    activeSubscriptions: [
      activeSubscription(ProductTierCode.RESERVAS_BASE),
      activeSubscription(ProductTierCode.CRM_PRO),
    ],
    capabilityOverrides: [],
  });

  assert.equal(entitlements.productCapabilities.CRM_BASE, true);
  assert.equal(entitlements.productCapabilities.CRM_PRO, true);
  assert.equal(entitlements.productCapabilities.CRM_IMPORT_EXPORT, true);
});

test('company with Personalizacion Plus gets advanced storefront capabilities', () => {
  const entitlements = resolveCompanyEntitlementsFromState({
    plan: ShopPlan.STARTER,
    hasModularSubscriptions: true,
    activeSubscriptions: [
      activeSubscription(ProductTierCode.RESERVAS_BASE),
      activeSubscription(ProductTierCode.PERSONALIZACION_PLUS),
    ],
    capabilityOverrides: [],
  });

  assert.equal(entitlements.productCapabilities.PERSONALIZACION_BASE, true);
  assert.equal(entitlements.productCapabilities.PERSONALIZACION_PLUS, true);
  assert.equal(entitlements.productCapabilities.STOREFRONT_ADVANCED_CTA, true);
  assert.equal(entitlements.productCapabilities.STOREFRONT_SECTION_ORDER, true);
  assert.equal(entitlements.productCapabilities.STOREFRONT_FOOTER_CUSTOMIZATION, true);
  assert.equal(entitlements.productCapabilities.STOREFRONT_ANNOUNCEMENT_BANNERS, true);
});

test('capability overrides can add Mensajeria Pro reminders without enabling review requests', () => {
  const entitlements = resolveCompanyEntitlementsFromState({
    plan: ShopPlan.BUSINESS,
    hasModularSubscriptions: true,
    activeSubscriptions: [
      activeSubscription(ProductTierCode.RESERVAS_PRO),
      activeSubscription(ProductTierCode.EVENTOS_BASE),
      activeSubscription(ProductTierCode.MENSAJERIA_BASE),
    ],
    capabilityOverrides: [
      {
        capability: 'MENSAJERIA_REMINDERS',
        value: true,
      },
    ],
  });

  assert.equal(entitlements.productCapabilities.MENSAJERIA_BASE, true);
  assert.equal(entitlements.productCapabilities.MENSAJERIA_REMINDERS, true);
  assert.equal(entitlements.productCapabilities.MENSAJERIA_REVIEW_REQUESTS, false);
  assert.equal(entitlements.features.BOOKING_REMINDERS, true);
  assert.equal(entitlements.features.REVIEW_REQUEST_EMAIL, false);
});

test('reactivation tools require both CRM Pro and Mensajeria Pro capabilities', () => {
  const withoutMessaging = resolveCompanyEntitlementsFromState({
    plan: ShopPlan.STARTER,
    hasModularSubscriptions: true,
    activeSubscriptions: [
      activeSubscription(ProductTierCode.RESERVAS_BASE),
      activeSubscription(ProductTierCode.CRM_PRO),
    ],
    capabilityOverrides: [],
  });

  const withMessaging = resolveCompanyEntitlementsFromState({
    plan: ShopPlan.STARTER,
    hasModularSubscriptions: true,
    activeSubscriptions: [
      activeSubscription(ProductTierCode.RESERVAS_BASE),
      activeSubscription(ProductTierCode.CRM_PRO),
      activeSubscription(ProductTierCode.MENSAJERIA_PRO),
    ],
    capabilityOverrides: [],
  });

  assert.equal(withoutMessaging.features.OUTREACH_REACTIVATION_TOOLS, false);
  assert.equal(withMessaging.features.OUTREACH_REACTIVATION_TOOLS, true);
});

test('company must have at least one core product active', () => {
  assert.throws(
    () =>
      resolveCompanyEntitlementsFromState({
        plan: ShopPlan.STARTER,
        hasModularSubscriptions: true,
        activeSubscriptions: [activeSubscription(ProductTierCode.CRM_PRO)],
        capabilityOverrides: [],
      }),
    /at least one active core product/i,
  );
});

test('expired modular subscriptions do not fall back to legacy plan capabilities', () => {
  const entitlements = resolveCompanyEntitlementsFromState({
    plan: ShopPlan.PRO,
    hasModularSubscriptions: true,
    activeSubscriptions: [],
    capabilityOverrides: [],
  });

  assert.equal(entitlements.source, 'modular');
  assert.equal(entitlements.products.length, 0);
  assert.equal(entitlements.activeCoreProducts.length, 0);
  assert.equal(entitlements.activeAddOns.length, 0);
  assert.equal(entitlements.features.GROUP_EVENTS, false);
  assert.equal(entitlements.productCapabilities.RESERVAS_BASE, false);
  assert.equal(entitlements.productCapabilities.CRM_BASE, false);
});
