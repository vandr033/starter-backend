import assert from 'node:assert/strict';
import test from 'node:test';
import { BillingCycle, ProductAccessRequestSource, ProductAccessRequestStatus, ShopPlan } from '@prisma/client';
import {
    approveProductAccessRequest,
    createAdminProductAccessRequest,
    productAccessRequestDependencies,
} from '../src/services/product-access-requests.service';

const originalDependencies = {
  ...productAccessRequestDependencies,
};

function restoreDependencies() {
  productAccessRequestDependencies.getCompanyEntitlements = originalDependencies.getCompanyEntitlements;
  productAccessRequestDependencies.getCompanySubscriptionHistoryPayload =
    originalDependencies.getCompanySubscriptionHistoryPayload;
  productAccessRequestDependencies.syncCompanyProducts = originalDependencies.syncCompanyProducts;
}

function buildRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    companyId: 7,
    requestedByUserId: 'user_1',
    productCode: 'CRM',
    tierCode: 'CRM_PRO',
    capability: 'CRM_IMPORT_EXPORT',
    status: ProductAccessRequestStatus.PENDING,
    message: 'Necesitamos importar clientes.',
    source: ProductAccessRequestSource.ADMIN_LOCKED_PAGE,
    createdAt: new Date('2026-04-27T12:00:00.000Z'),
    updatedAt: new Date('2026-04-27T12:00:00.000Z'),
    resolvedAt: null,
    resolvedByUserId: null,
    internalNote: null,
    company: {
      id: 7,
      name: 'Studio 7',
      slug: 'studio-7',
    },
    requestedByUser: {
      id: 'user_1',
      email: 'owner@example.com',
      name: 'Owner One',
      first_name: 'Owner',
      last_name: 'One',
    },
    resolvedByUser: null,
    ...overrides,
  };
}

test('createAdminProductAccessRequest prevents duplicate pending requests for the same company/product/tier', async () => {
  productAccessRequestDependencies.getCompanyEntitlements = async () => ({
    version: 1,
    currentPlan: ShopPlan.STARTER,
    maxStaffMembers: 3,
    features: {} as never,
    requiredPlans: {} as never,
    source: 'modular',
    productCapabilities: {} as never,
    products: [{ productCode: 'RESERVAS', tierCode: 'RESERVAS_BASE', status: 'ACTIVE', isCore: true, includedByDefault: false }],
    activeCoreProducts: ['RESERVAS_BASE'],
    activeAddOns: [],
  });

  const fakeDb = {
    productAccessRequest: {
      findFirst: async () => buildRequestRow(),
      create: async () => {
        throw new Error('create should not be called when a duplicate exists');
      },
    },
  };

  const result = await createAdminProductAccessRequest({
    companyId: 7,
    requestedByUserId: 'user_1',
    productCode: 'CRM',
    tierCode: 'CRM_PRO',
    capability: 'CRM_IMPORT_EXPORT',
    message: 'Necesitamos importar clientes.',
    source: ProductAccessRequestSource.ADMIN_LOCKED_PAGE,
  }, fakeDb as any);

  assert.equal(result.code, 409);
  assert.equal(result.error, true);
  assert.ok(result.data);
  assert.equal(result.data.alreadyPending, true);
  assert.equal(result.data.request.id, 11);

  restoreDependencies();
});

test('approveProductAccessRequest activates the requested product and marks the request approved', async () => {
  const syncCalls: any[] = [];
  const companyUpdates: any[] = [];
  const subscriptionHistoryCreates: any[] = [];
  const productHistoryCreates: any[] = [];
  const requestUpdates: any[] = [];

  productAccessRequestDependencies.getCompanySubscriptionHistoryPayload = async () => ({
    company: {
      id: 7,
      name: 'Studio 7',
      plan: 'STARTER',
      legacyPlanCompatibility: 'STARTER',
      billingCycle: 'MONTHLY',
      pricePaid: '29.00',
      availableUntil: '2027-03-12T23:59:59.000Z',
      isMarketplaceVisible: true,
      isExpired: false,
      activeProducts: [
        {
          productCode: 'RESERVAS',
          productName: 'Reservas',
          tierCode: 'RESERVAS_BASE',
          tierName: 'Reservas Base',
          isCoreProduct: true,
          includedByDefault: false,
          billingCycle: 'MONTHLY',
          pricePaid: '29.00',
          currency: 'Bs.',
          availableUntil: '2027-03-12T23:59:59.000Z',
          status: 'ACTIVE',
        },
      ],
      effectiveAccess: {
        version: 1,
        companyId: 7,
        lifecycle: {
          mode: 'FULL',
          isActive: true,
          isExpired: false,
          availableUntil: '2027-03-12T23:59:59.000Z',
          reason: null,
        },
        membership: { id: null, role: null },
        restaurant: { activeShiftId: null, activeShiftRole: null },
        entitlements: {
          version: 1,
          currentPlan: ShopPlan.STARTER,
          maxStaffMembers: 3,
          features: {} as never,
          requiredPlans: {} as never,
          source: 'modular',
          productCapabilities: {} as never,
          products: [],
          activeCoreProducts: [],
          activeAddOns: [],
        },
        configuredProducts: [],
      },
      requestedProducts: [
        {
          productCode: 'EVENTOS',
          productName: 'Eventos',
          tierCode: 'EVENTOS_BASE',
          tierName: 'Eventos Base',
          isCoreProduct: true,
        },
      ],
    },
    history: [],
    productHistory: [],
    pendingRequests: [],
  });

  productAccessRequestDependencies.syncCompanyProducts = async (params: any) => {
    syncCalls.push(params);
    return {
      source: 'modular',
      legacyPlan: ShopPlan.BUSINESS,
      activeProducts: params.activeProducts,
      requestedProducts: [],
    };
  };

  productAccessRequestDependencies.getCompanyEntitlements = async () => ({
    version: 1,
    currentPlan: ShopPlan.BUSINESS,
    maxStaffMembers: 10,
    features: {} as never,
    requiredPlans: {} as never,
    source: 'modular',
    productCapabilities: {} as never,
    products: [
      { productCode: 'RESERVAS', tierCode: 'RESERVAS_BASE', status: 'ACTIVE', isCore: true, includedByDefault: false },
      { productCode: 'EVENTOS', tierCode: 'EVENTOS_BASE', status: 'ACTIVE', isCore: true, includedByDefault: false },
    ],
    activeCoreProducts: ['RESERVAS_BASE', 'EVENTOS_BASE'],
    activeAddOns: [],
  });

  const tx = {
    productAccessRequest: {
      findUnique: async () => buildRequestRow({
        productCode: 'EVENTOS',
        tierCode: 'EVENTOS_BASE',
        capability: 'EVENTOS_BASE',
      }),
      update: async ({ data }: any) => {
        requestUpdates.push(data);
        return buildRequestRow({
          productCode: 'EVENTOS',
          tierCode: 'EVENTOS_BASE',
          capability: 'EVENTOS_BASE',
          status: ProductAccessRequestStatus.APPROVED,
          resolvedAt: data.resolvedAt,
          resolvedByUserId: data.resolvedByUserId,
          internalNote: data.internalNote,
          resolvedByUser: {
            id: data.resolvedByUserId,
            email: 'superadmin@example.com',
            name: 'Super Admin',
            first_name: 'Super',
            last_name: 'Admin',
          },
        });
      },
    },
    company: {
      findUnique: async () => ({
        id: 7,
        plan: ShopPlan.STARTER,
        billingCycle: BillingCycle.MONTHLY,
        pricePaid: { toString: () => '29.00' },
        currency: 'Bs.',
        availableUntil: new Date('2027-03-12T23:59:59.000Z'),
        isMarketplaceVisible: true,
      }),
      update: async ({ data }: any) => {
        companyUpdates.push(data);
        return null;
      },
    },
    companySubscriptionHistory: {
      create: async ({ data }: any) => {
        subscriptionHistoryCreates.push(data);
        return null;
      },
    },
    companyProductHistory: {
      create: async ({ data }: any) => {
        productHistoryCreates.push(data);
        return null;
      },
    },
  };

  const fakeDb = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };

  const result = await approveProductAccessRequest({
    requestId: 11,
    resolvedByUserId: 'super_admin_1',
    internalNote: 'Activado por solicitud aprobada',
  }, fakeDb as any);

  assert.equal(result.code, 200);
  assert.equal(result.error, false);
  assert.ok(result.data);
  assert.equal(result.data.request.status, 'APPROVED');
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0].activeProducts.some((product: any) => product.tierCode === 'EVENTOS_BASE'), true);
  assert.equal(syncCalls[0].requestedProducts.length, 0);
  assert.equal(companyUpdates.length, 1);
  assert.equal(companyUpdates[0].plan, ShopPlan.BUSINESS);
  assert.equal(subscriptionHistoryCreates.length, 1);
  assert.equal(productHistoryCreates.some((entry) => entry.action === 'REQUEST_APPROVED'), true);
  assert.equal(requestUpdates.length, 1);
  assert.equal(result.data.entitlements.currentPlan, ShopPlan.BUSINESS);

  restoreDependencies();
});
