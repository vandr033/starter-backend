import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompanyProductSubscriptionStatus,
  CompanyUserRole,
  ProductTierCode,
  RestaurantShiftMemberRole,
  ShopPlan,
} from '@prisma/client';
import {
  getProductTierDefinition,
  isCoreProductCode,
} from '../src/config/product-entitlements';
import {
  resolveEffectiveCompanyAccess,
  resolveCompanyContextForUser,
} from '../src/services/company-access.service';

const NOW = new Date('2026-09-07T12:00:00.000Z');

type SubscriptionInput = {
  id: number;
  tierCode: ProductTierCode;
  status?: CompanyProductSubscriptionStatus;
  startsAt?: Date | null;
  availableUntil?: Date | null;
  cancelledAt?: Date | null;
  productIsActive?: boolean;
  tierIsActive?: boolean;
};

function subscription(input: SubscriptionInput) {
  const tier = getProductTierDefinition(input.tierCode);
  return {
    id: input.id,
    status: input.status ?? CompanyProductSubscriptionStatus.ACTIVE,
    startsAt: input.startsAt ?? null,
    availableUntil: input.availableUntil ?? null,
    cancelledAt: input.cancelledAt ?? null,
    product: {
      code: tier.productCode,
      isCoreProduct: isCoreProductCode(tier.productCode),
      isActive: input.productIsActive ?? true,
    },
    productTier: {
      code: input.tierCode,
      isActive: input.tierIsActive ?? true,
      capabilities: tier.includedCapabilities.map((capability) => ({ capability })),
    },
  };
}

function createDb(params: {
  plan?: ShopPlan;
  availableUntil?: Date;
  isActive?: boolean;
  deletedAt?: Date | null;
  restaurantEnabled?: boolean;
  subscriptions?: SubscriptionInput[];
  membership?: boolean;
  shift?: { shift_id: number; role: RestaurantShiftMemberRole } | null;
}) {
  const company = {
    id: 41,
    plan: params.plan ?? ShopPlan.BUSINESS,
    availableUntil: params.availableUntil ?? new Date('2026-12-31T23:59:59.000Z'),
    is_active: params.isActive ?? true,
    deleted_at: params.deletedAt ?? null,
    restaurant_enabled: params.restaurantEnabled ?? true,
    product_subscriptions: (params.subscriptions ?? []).map(subscription),
    capability_overrides: [],
  };

  return {
    company: {
      findUnique: async () => company,
    },
    restaurantShiftMember: {
      findFirst: async () => params.shift ?? null,
    },
    companyUser: {
      findMany: async () => params.membership === false ? [] : [{
        id: 701,
        company_id: 41,
        user_id: 'user-41',
        role: CompanyUserRole.STAFF,
        is_primary_contact: false,
        updated_at: NOW,
        company: {
          id: 41,
          name: 'Test company',
          slug: 'test-company',
          plan: company.plan,
          availableUntil: company.availableUntil,
          is_active: company.is_active,
          deleted_at: company.deleted_at,
          restaurant_enabled: company.restaurant_enabled,
          currency: 'Bs.',
          timezone: 'America/La_Paz',
        },
      }],
    },
  } as any;
}

test('effective access ignores future, expired, inactive, cancelled, and catalog-inactive subscriptions', async () => {
  const db = createDb({
    subscriptions: [
      {
        id: 1,
        tierCode: ProductTierCode.RESERVAS_BASE,
        startsAt: new Date('2026-09-08T00:00:00.000Z'),
      },
      {
        id: 2,
        tierCode: ProductTierCode.EVENTOS_BASE,
        availableUntil: new Date('2026-09-06T23:59:59.000Z'),
      },
      {
        id: 3,
        tierCode: ProductTierCode.CLASES_BASE,
        status: CompanyProductSubscriptionStatus.SUSPENDED,
      },
      {
        id: 4,
        tierCode: ProductTierCode.CRM_PRO,
        cancelledAt: new Date('2026-09-06T12:00:00.000Z'),
      },
      {
        id: 5,
        tierCode: ProductTierCode.RESERVAS_PRO,
        productIsActive: false,
      },
    ],
  });

  const access = await resolveEffectiveCompanyAccess({ companyId: 41, db, now: NOW });

  assert.equal(access.lifecycle.mode, 'FULL');
  assert.equal(access.entitlements.source, 'modular');
  assert.deepEqual(access.entitlements.products, []);
  assert.deepEqual(
    access.configuredProducts.map((product) => [product.tierCode, product.reason]),
    [
      [ProductTierCode.RESERVAS_BASE, 'FUTURE'],
      [ProductTierCode.EVENTOS_BASE, 'EXPIRED'],
      [ProductTierCode.CLASES_BASE, 'STATUS_INACTIVE'],
      [ProductTierCode.CRM_PRO, 'CANCELLED'],
      [ProductTierCode.RESERVAS_PRO, 'CATALOG_INACTIVE'],
    ],
  );
});

test('legacy companies use the legacy plan only when no modular subscriptions are configured', async () => {
  const access = await resolveEffectiveCompanyAccess({
    companyId: 41,
    db: createDb({ plan: ShopPlan.PRO }),
    now: NOW,
  });

  assert.equal(access.entitlements.source, 'legacy_plan');
  assert.equal(access.entitlements.productCapabilities.RESERVAS_BASE, true);
  assert.equal(access.entitlements.productCapabilities.CRM_PRO, true);
  assert.ok(access.configuredProducts.every((product) => product.reason === 'LEGACY_FALLBACK'));
});

test('active modular access includes bundled baseline products and the current restaurant shift role', async () => {
  const access = await resolveEffectiveCompanyAccess({
    companyId: 41,
    userId: 'user-41',
    role: CompanyUserRole.STAFF,
    db: createDb({
      subscriptions: [{ id: 11, tierCode: ProductTierCode.RESERVAS_BASE }],
      shift: { shift_id: 9001, role: RestaurantShiftMemberRole.HOST },
    }),
    now: NOW,
  });

  assert.equal(access.lifecycle.mode, 'FULL');
  assert.equal(access.membership.role, CompanyUserRole.STAFF);
  assert.equal(access.restaurant.activeShiftId, 9001);
  assert.equal(access.restaurant.activeShiftRole, RestaurantShiftMemberRole.HOST);
  assert.equal(access.entitlements.productCapabilities.RESERVAS_BASE, true);
  assert.equal(access.entitlements.productCapabilities.CRM_BASE, true);
  assert.equal(access.entitlements.productCapabilities.MENSAJERIA_BASE, true);
  assert.equal(access.entitlements.productCapabilities.PERSONALIZACION_BASE, true);
  assert.equal(access.configuredProducts[0]?.reason, 'EFFECTIVE');
});

test('company lifecycle resolves to FULL, RENEWAL_ONLY, or BLOCKED independently of product entitlements', async () => {
  const full = await resolveEffectiveCompanyAccess({
    companyId: 41,
    db: createDb({ availableUntil: new Date('2026-09-08T00:00:00.000Z') }),
    now: NOW,
  });
  const expired = await resolveEffectiveCompanyAccess({
    companyId: 41,
    db: createDb({ availableUntil: new Date('2026-09-06T23:59:59.000Z') }),
    now: NOW,
  });
  const inactive = await resolveEffectiveCompanyAccess({
    companyId: 41,
    db: createDb({ isActive: false }),
    now: NOW,
  });
  const deleted = await resolveEffectiveCompanyAccess({
    companyId: 41,
    db: createDb({ deletedAt: new Date('2026-09-01T00:00:00.000Z') }),
    now: NOW,
  });

  assert.equal(full.lifecycle.mode, 'FULL');
  assert.equal(expired.lifecycle.mode, 'RENEWAL_ONLY');
  assert.equal(expired.lifecycle.reason, 'COMPANY_EXPIRED');
  assert.equal(inactive.lifecycle.mode, 'BLOCKED');
  assert.equal(inactive.lifecycle.reason, 'COMPANY_INACTIVE');
  assert.equal(deleted.lifecycle.mode, 'BLOCKED');
  assert.equal(deleted.lifecycle.reason, 'COMPANY_DELETED');
});

test('company context resolver requires an active membership before returning effective access', async () => {
  const db = createDb({});
  const context = await resolveCompanyContextForUser('user-41', 41, { db, now: NOW });

  assert.equal(context?.membership.id, 701);
  assert.equal(context?.access.companyId, 41);
  assert.equal(context?.access.membership.id, 701);
});

test('company context resolver returns no access for a user outside the selected tenant', async () => {
  const context = await resolveCompanyContextForUser(
    'user-from-another-company',
    41,
    { db: createDb({ membership: false }), now: NOW },
  );

  assert.equal(context, null);
});

test('company context resolver prefers the strongest active role over a newer customer row', async () => {
  const db = createDb({}) as any;
  const membership = (await db.companyUser.findMany())[0];
  db.companyUser.findMany = async () => [
    {
      ...membership,
      id: 702,
      role: CompanyUserRole.CUSTOMER,
      updated_at: new Date('2026-09-07T12:05:00.000Z'),
    },
    {
      ...membership,
      id: 701,
      role: CompanyUserRole.OWNER,
      updated_at: new Date('2026-09-07T12:00:00.000Z'),
    },
  ];

  const context = await resolveCompanyContextForUser('user-41', 41, { db, now: NOW });

  assert.equal(context?.membership.id, 701);
  assert.equal(context?.membership.role, CompanyUserRole.OWNER);
});
