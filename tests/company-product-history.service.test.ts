import assert from 'node:assert/strict';
import test from 'node:test';
import { BillingCycle, ShopPlan } from '@prisma/client';
import { getCompanySubscriptionHistoryPayload } from '../src/services/company-subscription-history.service';
import { syncCompanyProducts } from '../src/services/super-admin-shops.service';

function buildTierRow(id: number, productId: number, code: string) {
  return { id, productId, code };
}

function buildExistingSubscription(params: {
  id: number;
  productCode: string;
  tierCode: string;
}) {
  return {
    id: params.id,
    product: { code: params.productCode },
    productTier: { code: params.tierCode },
    billingCycle: BillingCycle.MONTHLY,
    pricePaid: params.productCode === 'RESERVAS' ? 149 : null,
    currency: 'Bs.',
    availableUntil: new Date('2027-03-12T23:59:59.000Z'),
    startsAt: new Date('2026-03-12T23:59:59.000Z'),
    cancelledAt: null,
    status: 'ACTIVE',
  };
}

test('syncCompanyProducts writes modular product history during initial company setup', async () => {
  const productHistoryCreates: any[] = [];

  const tx = {
    companyProductSubscription: {
      findMany: async () => [],
      create: async () => null,
      update: async () => null,
    },
    productTier: {
      findMany: async () => ([
        buildTierRow(1, 1, 'RESERVAS_BASE'),
        buildTierRow(2, 2, 'CRM_BASE'),
        buildTierRow(3, 3, 'MENSAJERIA_BASE'),
        buildTierRow(4, 4, 'PERSONALIZACION_BASE'),
      ]),
    },
    companyProductHistory: {
      create: async ({ data }: any) => {
        productHistoryCreates.push(data);
        return null;
      },
      findFirst: async () => null,
    },
  };

  await syncCompanyProducts({
    tx: tx as any,
    companyId: 7,
    activeProducts: [
      {
        productCode: 'RESERVAS',
        tierCode: 'RESERVAS_BASE',
      },
    ],
    requestedProducts: [],
    companyBillingCycle: BillingCycle.MONTHLY,
    companyPricePaid: 149,
    companyCurrency: 'Bs.',
    companyAvailableUntil: new Date('2027-03-12T23:59:59.000Z'),
    legacyPlan: ShopPlan.STARTER,
    actorUserId: 'super_admin_1',
    source: 'SUPER_ADMIN_CREATE_SHOP',
    note: 'Shop created via super-admin',
  });

  assert.equal(
    productHistoryCreates.some(
      (entry) => entry.action === 'PRODUCT_ACTIVATED' && entry.newValue.productCode === 'RESERVAS',
    ),
    true,
  );
  assert.equal(
    productHistoryCreates.some(
      (entry) => entry.action === 'ADDON_ACTIVATED' && entry.newValue.productCode === 'MENSAJERIA',
    ),
    true,
  );
});

test('syncCompanyProducts writes history when upgrading Eventos Base to Eventos Pro', async () => {
  const productHistoryCreates: any[] = [];

  const tx = {
    companyProductSubscription: {
      findMany: async () => ([
        buildExistingSubscription({ id: 1, productCode: 'RESERVAS', tierCode: 'RESERVAS_PRO' }),
        buildExistingSubscription({ id: 2, productCode: 'EVENTOS', tierCode: 'EVENTOS_BASE' }),
        buildExistingSubscription({ id: 3, productCode: 'CRM', tierCode: 'CRM_BASE' }),
        buildExistingSubscription({ id: 4, productCode: 'MENSAJERIA', tierCode: 'MENSAJERIA_BASE' }),
        buildExistingSubscription({ id: 5, productCode: 'PERSONALIZACION', tierCode: 'PERSONALIZACION_BASE' }),
      ]),
      create: async () => null,
      update: async () => null,
    },
    productTier: {
      findMany: async () => ([
        buildTierRow(11, 11, 'RESERVAS_PRO'),
        buildTierRow(12, 12, 'EVENTOS_PRO'),
        buildTierRow(13, 13, 'CRM_BASE'),
        buildTierRow(14, 14, 'MENSAJERIA_BASE'),
        buildTierRow(15, 15, 'PERSONALIZACION_BASE'),
      ]),
    },
    companyProductHistory: {
      create: async ({ data }: any) => {
        productHistoryCreates.push(data);
        return null;
      },
      findFirst: async () => null,
    },
  };

  await syncCompanyProducts({
    tx: tx as any,
    companyId: 7,
    activeProducts: [
      { productCode: 'RESERVAS', tierCode: 'RESERVAS_PRO' },
      { productCode: 'EVENTOS', tierCode: 'EVENTOS_PRO' },
    ],
    requestedProducts: [],
    companyBillingCycle: BillingCycle.MONTHLY,
    companyPricePaid: 249,
    companyCurrency: 'Bs.',
    companyAvailableUntil: new Date('2027-03-12T23:59:59.000Z'),
    legacyPlan: ShopPlan.BUSINESS,
    actorUserId: 'super_admin_1',
    source: 'SUPER_ADMIN_SHOP_EDIT',
    note: 'Upgrade Eventos',
  });

  assert.equal(
    productHistoryCreates.some(
      (entry) =>
        entry.action === 'PRODUCT_UPGRADED' &&
        entry.previousValue.tierCode === 'EVENTOS_BASE' &&
        entry.newValue.tierCode === 'EVENTOS_PRO',
    ),
    true,
  );
});

test('syncCompanyProducts writes history when removing an add-on', async () => {
  const productHistoryCreates: any[] = [];

  const tx = {
    companyProductSubscription: {
      findMany: async () => ([
        buildExistingSubscription({ id: 1, productCode: 'RESERVAS', tierCode: 'RESERVAS_PRO' }),
        buildExistingSubscription({ id: 2, productCode: 'CRM', tierCode: 'CRM_BASE' }),
        buildExistingSubscription({ id: 3, productCode: 'MENSAJERIA', tierCode: 'MENSAJERIA_BASE' }),
        buildExistingSubscription({ id: 4, productCode: 'PERSONALIZACION', tierCode: 'PERSONALIZACION_BASE' }),
        buildExistingSubscription({ id: 5, productCode: 'METRICAS', tierCode: 'METRICAS_PRO' }),
      ]),
      create: async () => null,
      update: async () => null,
    },
    productTier: {
      findMany: async () => ([
        buildTierRow(21, 21, 'RESERVAS_PRO'),
        buildTierRow(22, 22, 'CRM_BASE'),
        buildTierRow(23, 23, 'MENSAJERIA_BASE'),
        buildTierRow(24, 24, 'PERSONALIZACION_BASE'),
      ]),
    },
    companyProductHistory: {
      create: async ({ data }: any) => {
        productHistoryCreates.push(data);
        return null;
      },
      findFirst: async () => null,
    },
  };

  await syncCompanyProducts({
    tx: tx as any,
    companyId: 7,
    activeProducts: [
      { productCode: 'RESERVAS', tierCode: 'RESERVAS_PRO' },
    ],
    requestedProducts: [],
    companyBillingCycle: BillingCycle.MONTHLY,
    companyPricePaid: 249,
    companyCurrency: 'Bs.',
    companyAvailableUntil: new Date('2027-03-12T23:59:59.000Z'),
    legacyPlan: ShopPlan.BUSINESS,
    actorUserId: 'super_admin_1',
    source: 'SUPER_ADMIN_SHOP_EDIT',
    note: 'Remove add-on',
  });

  assert.equal(
    productHistoryCreates.some(
      (entry) => entry.action === 'ADDON_REMOVED' && entry.previousValue.productCode === 'METRICAS',
    ),
    true,
  );
});

test('legacy CompanySubscriptionHistory payload remains available alongside modular product history', async () => {
  const payload = await getCompanySubscriptionHistoryPayload(7, {
    company: {
      findUnique: async () => ({
        id: 7,
        name: 'Studio 7',
        plan: 'BUSINESS',
        billingCycle: 'MONTHLY',
        pricePaid: { toString: () => '149.00' },
        availableUntil: new Date('2027-03-12T23:59:59.000Z'),
        currency: 'Bs.',
        isMarketplaceVisible: true,
        product_subscriptions: [
          {
            product: { code: 'RESERVAS', name: 'Reservas' },
            productTier: { code: 'RESERVAS_PRO', name: 'Reservas Pro' },
            billingCycle: 'MONTHLY',
            pricePaid: { toString: () => '149.00' },
            currency: 'Bs.',
            availableUntil: new Date('2027-03-12T23:59:59.000Z'),
            status: 'ACTIVE',
          },
        ],
      }),
    },
    companySubscriptionHistory: {
      findMany: async () => ([
        {
          id: 1,
          companyId: 7,
          previousPlan: 'STARTER',
          newPlan: 'BUSINESS',
          previousBillingCycle: 'MONTHLY',
          newBillingCycle: 'MONTHLY',
          previousPricePaid: { toString: () => '99.00' },
          newPricePaid: { toString: () => '149.00' },
          previousAvailableUntil: new Date('2026-03-12T23:59:59.000Z'),
          newAvailableUntil: new Date('2027-03-12T23:59:59.000Z'),
          previousMarketplaceVisible: false,
          newMarketplaceVisible: true,
          changedByUserId: 'super_admin_1',
          changedBy: {
            id: 'super_admin_1',
            email: 'admin@example.com',
            first_name: 'Super',
            last_name: 'Admin',
            name: 'Super Admin',
          },
          changedAt: new Date('2026-04-27T12:00:00.000Z'),
          note: 'Legacy history still stored',
        },
      ]),
    },
    companyProductHistory: {
      findMany: async () => ([
        {
          id: 2,
          companyId: 7,
          action: 'REQUEST_APPROVED',
          previousValue: {
            productCode: 'EVENTOS',
            tierCode: 'EVENTOS_BASE',
            requestStatus: 'PENDING',
            source: 'ADMIN_LOCKED_PAGE',
          },
          newValue: {
            productCode: 'EVENTOS',
            tierCode: 'EVENTOS_BASE',
            requestStatus: 'APPROVED',
            source: 'ADMIN_LOCKED_PAGE',
          },
          actorUserId: 'super_admin_1',
          actorUser: {
            id: 'super_admin_1',
            email: 'admin@example.com',
            first_name: 'Super',
            last_name: 'Admin',
            name: 'Super Admin',
          },
          createdAt: new Date('2026-04-27T13:00:00.000Z'),
          note: 'Request approved',
        },
      ]),
    },
    productAccessRequest: {
      findMany: async () => ([
        {
          id: 5,
          companyId: 7,
          requestedByUserId: 'owner_1',
          productCode: 'CLASES',
          tierCode: 'CLASES_PRO',
          capability: 'CLASES_PRO',
          status: 'PENDING',
          source: 'SETTINGS_LOCKED_CONTROL',
          message: 'Necesitamos clases',
          createdAt: new Date('2026-04-28T12:00:00.000Z'),
          requestedByUser: {
            id: 'owner_1',
            email: 'owner@example.com',
            first_name: 'Owner',
            last_name: 'One',
            name: 'Owner One',
          },
        },
      ]),
    },
  } as any);

  assert.ok(payload);
  assert.equal(payload.history.length, 1);
  assert.equal(payload.history[0].newPlan, 'BUSINESS');
  assert.equal(payload.productHistory.length, 1);
  assert.equal(payload.productHistory[0].newStatus, 'APPROVED');
  assert.equal(payload.pendingRequests.length, 1);
  assert.equal(payload.pendingRequests[0].tierCode, 'CLASES_PRO');
});
