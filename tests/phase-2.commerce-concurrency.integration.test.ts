import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  CommerceDeliveryCostMode,
  CommerceFulfillmentMode,
  CommerceFulfillmentStatus,
  CommerceFulfillmentType,
  CommercePaymentStatus,
  CommerceProductType,
  CompanyUserRole,
  ProductCapabilityCode,
  Prisma,
} from '@prisma/client';
import { prisma } from '../src/prisma/client';
import {
  createPublicCommerceOrder,
  updateAdminCommerceOrderStatus,
} from '../src/services/commerce-order.service';

/**
 * These tests intentionally use a disposable migration-created MySQL schema.
 * They stay out of the ordinary unit suite and are enabled by test:mysql and
 * the fresh Phase 0/1/2 verifier.
 */
const mysqlIntegrationEnabled =
  process.env.RUN_MYSQL_INTEGRATION === '1' &&
  /^mysql(?:s)?:\/\//i.test(process.env.DATABASE_URL || '');
const skipReason = mysqlIntegrationEnabled
  ? false
  : 'RUN_MYSQL_INTEGRATION=1 and a mysql:// DATABASE_URL are required';

type Tenant = {
  companyId: number;
  slug: string;
  storeId: string;
};

type OrderResult = Awaited<ReturnType<typeof createPublicCommerceOrder>>;

const createdCompanyIds: number[] = [];
const createdStoreIds: string[] = [];
const createdProductIds: string[] = [];
const createdComboProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerProfileIds: number[] = [];
const createdCompanyUserIds: number[] = [];

let testUserId: string | null = null;

function assertNoRawDatabaseError(result: unknown): void {
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /Prisma|Unique constraint|Foreign key constraint|commerce_order_company_order_number_key/i,
  );
}

async function createTenant(label: string): Promise<Tenant> {
  const companyType = await prisma.companyType.findFirst();
  assert.ok(companyType, 'The disposable database must contain a company type');

  const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const company = await prisma.company.create({
    data: {
      slug: `phase-2-${suffix}`,
      name: `Phase 2 ${label}`,
      phone: '700000000',
      timezone: 'America/La_Paz',
      currency: 'Bs.',
      company_type_id: companyType.id,
      plan: 'PRO',
      availableUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    select: { id: true, slug: true },
  });
  createdCompanyIds.push(company.id);

  // The legacy PRO fallback does not include the separate Stores product.
  // Enable only the commerce capability needed by this disposable tenant.
  await prisma.companyCapabilityOverride.create({
    data: {
      companyId: company.id,
      capability: ProductCapabilityCode.COMMERCE_ACCESS,
      value: true,
      reason: 'Phase 2 concurrency integration fixture',
    },
  });

  const store = await prisma.commerceStore.create({
    data: {
      company_id: company.id,
      fulfillment_mode: CommerceFulfillmentMode.PICKUP_ONLY,
      delivery_cost_mode: CommerceDeliveryCostMode.FREE,
      allow_cash_payment: true,
      allow_qr_payment: false,
      allow_manual_payment: false,
      payment_proof_required: false,
      payment_review_required: false,
    },
    select: { id: true },
  });
  createdStoreIds.push(store.id);

  assert.ok(testUserId, 'The test customer must be created first');
  const membership = await prisma.companyUser.create({
    data: {
      company_id: company.id,
      user_id: testUserId,
      role: CompanyUserRole.CUSTOMER,
    },
    select: { id: true },
  });
  createdCompanyUserIds.push(membership.id);

  const profile = await prisma.customerProfile.create({
    data: {
      company_id: company.id,
      user_id: testUserId,
    },
    select: { id: true },
  });
  createdCustomerProfileIds.push(profile.id);

  return { companyId: company.id, slug: company.slug, storeId: store.id };
}

async function createProduct(
  tenant: Tenant,
  label: string,
  options: {
    price?: string;
    stockQuantity?: number;
    trackStock?: boolean;
    productType?: CommerceProductType;
  } = {},
): Promise<string> {
  const product = await prisma.commerceProduct.create({
    data: {
      company_id: tenant.companyId,
      store_id: tenant.storeId,
      name: `Phase 2 ${label}`,
      slug: `phase-2-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      product_type: options.productType ?? CommerceProductType.SIMPLE,
      price: new Prisma.Decimal(options.price ?? '10.00'),
      track_stock: options.trackStock ?? true,
      stock_quantity: options.stockQuantity ?? 1000,
      allow_out_of_stock_orders: false,
      available_for_pickup: true,
      available_for_delivery: false,
    },
    select: { id: true },
  });
  createdProductIds.push(product.id);
  if (options.productType === CommerceProductType.COMBO) {
    createdComboProductIds.push(product.id);
  }
  return product.id;
}

function orderInput(productIds: Array<{ productId: string; quantity: number }>) {
  return {
    customerName: 'Phase 2 Concurrency Customer',
    customerPhone: '700000001',
    customerPhonePrefix: '591',
    customerEmail: 'phase-2-concurrency@example.test',
    fulfillmentType: CommerceFulfillmentType.PICKUP,
    pickupPointId: null,
    paymentMethod: 'CASH' as const,
    items: productIds,
  };
}

async function requestOrder(tenant: Tenant, items: Array<{ productId: string; quantity: number }>): Promise<OrderResult> {
  assert.ok(testUserId);
  return createPublicCommerceOrder(tenant.slug, orderInput(items), testUserId);
}

async function createOrder(tenant: Tenant, items: Array<{ productId: string; quantity: number }>) {
  const result = await requestOrder(tenant, items);
  assert.equal(result.code, 201, JSON.stringify(result));
  assert.equal(result.error, false, JSON.stringify(result));
  assert.ok(result.data?.id);
  createdOrderIds.push(result.data.id);
  return result.data as { id: string; order_number: string };
}

async function updateOrderStatus(
  tenant: Tenant,
  orderId: string,
  params: {
    paymentStatus?: CommercePaymentStatus;
    fulfillmentStatus?: CommerceFulfillmentStatus;
  },
) {
  assert.ok(testUserId);
  return updateAdminCommerceOrderStatus({
    companyId: tenant.companyId,
    orderId,
    changedByUserId: testUserId,
    paymentStatus: params.paymentStatus,
    fulfillmentStatus: params.fulfillmentStatus,
  });
}

before(async () => {
  if (!mysqlIntegrationEnabled) return;
  await prisma.$connect();
  const user = await prisma.user.create({
    data: {
      email: `phase-2-concurrency-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
      name: 'Phase 2 Concurrency Customer',
      first_name: 'Phase 2',
      last_name: 'Customer',
      emailVerified: true,
      is_active: true,
    },
    select: { id: true },
  });
  testUserId = user.id;
});

after(async () => {
  if (!mysqlIntegrationEnabled) return;

  if (createdCompanyIds.length > 0) {
    await prisma.commerceOrder.deleteMany({ where: { company_id: { in: createdCompanyIds } } });
  }
  if (createdComboProductIds.length > 0) {
    await prisma.commerceComboItem.deleteMany({
      where: { combo_product_id: { in: createdComboProductIds } },
    });
  }
  if (createdProductIds.length > 0) {
    await prisma.commerceProduct.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdStoreIds.length > 0) {
    await prisma.commerceStore.deleteMany({ where: { id: { in: createdStoreIds } } });
  }
  if (createdCompanyIds.length > 0) {
    await prisma.commerceOrderSequence.deleteMany({ where: { company_id: { in: createdCompanyIds } } });
    await prisma.customerProfile.deleteMany({ where: { id: { in: createdCustomerProfileIds } } });
    await prisma.companyUser.deleteMany({ where: { id: { in: createdCompanyUserIds } } });
    await prisma.companyCapabilityOverride.deleteMany({ where: { companyId: { in: createdCompanyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: createdCompanyIds } } });
  }
  if (testUserId) {
    await prisma.user.delete({ where: { id: testUserId } });
  }
  await prisma.$disconnect();
});

test('real MySQL allocates unique per-company order numbers under concurrent creates', { skip: skipReason }, async () => {
  const tenantA = await createTenant('sequence-a');
  const tenantB = await createTenant('sequence-b');
  const productA = await createProduct(tenantA, 'sequence-a-product');
  const productB = await createProduct(tenantB, 'sequence-b-product');

  const results = await Promise.all([
    ...Array.from({ length: 20 }, () => requestOrder(tenantA, [{ productId: productA, quantity: 1 }])),
    ...Array.from({ length: 4 }, () => requestOrder(tenantB, [{ productId: productB, quantity: 1 }])),
  ]);

  assert.equal(results.length, 24);
  for (const result of results) {
    assertNoRawDatabaseError(result);
    assert.equal(result.code, 201, JSON.stringify(result));
    assert.equal(result.error, false, JSON.stringify(result));
    assert.ok(result.data?.id);
    createdOrderIds.push(result.data.id);
  }

  const ordersA = results
    .slice(0, 20)
    .map((result) => result.data.order_number)
    .sort();
  const ordersB = results
    .slice(20)
    .map((result) => result.data.order_number)
    .sort();
  assert.deepEqual(ordersA, Array.from({ length: 20 }, (_, index) => `TDA-${String(index + 1).padStart(6, '0')}`));
  assert.deepEqual(ordersB, Array.from({ length: 4 }, (_, index) => `TDA-${String(index + 1).padStart(6, '0')}`));

  assert.equal(await prisma.commerceOrder.count({ where: { company_id: tenantA.companyId } }), 20);
  assert.equal(await prisma.commerceOrder.count({ where: { company_id: tenantB.companyId } }), 4);

  const crossTenantProductAttempt = await requestOrder(tenantA, [{ productId: productB, quantity: 1 }]);
  assertNoRawDatabaseError(crossTenantProductAttempt);
  assert.equal(crossTenantProductAttempt.code, 400);
  assert.equal(crossTenantProductAttempt.error, true);
  assert.equal(await prisma.commerceOrder.count({ where: { company_id: tenantA.companyId } }), 20);
  assert.equal(
    await prisma.commerceOrderSequence.findUnique({ where: { company_id: tenantA.companyId } }).then((row) => row?.next_order_number),
    21,
  );
  assert.equal(
    await prisma.commerceOrderSequence.findUnique({ where: { company_id: tenantB.companyId } }).then((row) => row?.next_order_number),
    5,
  );
});

test('real MySQL confirms one stock=1 order, makes repeats idempotent, and restores once', { skip: skipReason }, async () => {
  const tenant = await createTenant('stock-race');
  const productId = await createProduct(tenant, 'stock-race-product', { stockQuantity: 1 });
  const orderA = await createOrder(tenant, [{ productId, quantity: 1 }]);
  const orderB = await createOrder(tenant, [{ productId, quantity: 1 }]);

  const confirmations = await Promise.all([
    updateOrderStatus(tenant, orderA.id, { paymentStatus: CommercePaymentStatus.PAYMENT_CONFIRMED }),
    updateOrderStatus(tenant, orderB.id, { paymentStatus: CommercePaymentStatus.PAYMENT_CONFIRMED }),
  ]);
  for (const result of confirmations) assertNoRawDatabaseError(result);
  assert.equal(confirmations.filter((result) => result.code === 200 && !result.error).length, 1);
  assert.equal(confirmations.filter((result) => result.code === 409 && result.error && result.errorCode === 'INSUFFICIENT_STOCK').length, 1);

  const orders = await prisma.commerceOrder.findMany({
    where: { id: { in: [orderA.id, orderB.id] } },
    select: { id: true, payment_status: true, stock_deducted_at: true, stock_restored_at: true },
  });
  const winner = orders.find((order) => order.payment_status === CommercePaymentStatus.PAYMENT_CONFIRMED);
  const loser = orders.find((order) => order.payment_status !== CommercePaymentStatus.PAYMENT_CONFIRMED);
  assert.ok(winner);
  assert.ok(loser);
  assert.ok(winner.stock_deducted_at);
  assert.equal(loser.stock_deducted_at, null);
  assert.equal(await prisma.commerceProduct.findUnique({ where: { id: productId } }).then((product) => product?.stock_quantity), 0);

  const repeatedConfirmation = await updateOrderStatus(tenant, winner.id, {
    paymentStatus: CommercePaymentStatus.PAYMENT_CONFIRMED,
  });
  assertNoRawDatabaseError(repeatedConfirmation);
  assert.equal(repeatedConfirmation.code, 200);
  assert.equal(repeatedConfirmation.error, false);
  assert.equal(
    await prisma.commerceOrderStatusHistory.count({
      where: { order_id: winner.id, new_payment_status: CommercePaymentStatus.PAYMENT_CONFIRMED },
    }),
    1,
  );
  assert.equal(await prisma.commerceProduct.findUnique({ where: { id: productId } }).then((product) => product?.stock_quantity), 0);

  const firstCancel = await updateOrderStatus(tenant, winner.id, {
    fulfillmentStatus: CommerceFulfillmentStatus.CANCELLED,
  });
  const repeatedCancel = await updateOrderStatus(tenant, winner.id, {
    fulfillmentStatus: CommerceFulfillmentStatus.CANCELLED,
  });
  assertNoRawDatabaseError(firstCancel);
  assertNoRawDatabaseError(repeatedCancel);
  assert.equal(firstCancel.code, 200);
  assert.equal(repeatedCancel.code, 200);
  assert.equal(
    await prisma.commerceOrderStatusHistory.count({
      where: { order_id: winner.id, new_fulfillment_status: CommerceFulfillmentStatus.CANCELLED },
    }),
    1,
  );
  const restored = await prisma.commerceOrder.findUnique({ where: { id: winner.id }, select: { stock_restored_at: true } });
  assert.ok(restored?.stock_restored_at);
  assert.equal(await prisma.commerceProduct.findUnique({ where: { id: productId } }).then((product) => product?.stock_quantity), 1);
});

test('real MySQL serializes confirmation versus cancellation into a legal final state', { skip: skipReason }, async () => {
  const tenant = await createTenant('confirm-cancel-race');
  const productId = await createProduct(tenant, 'confirm-cancel-product', { stockQuantity: 1 });
  const order = await createOrder(tenant, [{ productId, quantity: 1 }]);

  const results = await Promise.all([
    updateOrderStatus(tenant, order.id, { paymentStatus: CommercePaymentStatus.PAYMENT_CONFIRMED }),
    updateOrderStatus(tenant, order.id, { fulfillmentStatus: CommerceFulfillmentStatus.CANCELLED }),
  ]);
  for (const result of results) assertNoRawDatabaseError(result);
  assert.ok(results.every((result) => result.code === 200 || result.code === 409));
  assert.ok(results.some((result) => result.code === 200));

  const finalOrder = await prisma.commerceOrder.findUnique({
    where: { id: order.id },
    select: { payment_status: true, fulfillment_status: true, stock_deducted_at: true, stock_restored_at: true },
  });
  assert.ok(finalOrder);
  assert.equal(finalOrder.fulfillment_status, CommerceFulfillmentStatus.CANCELLED);
  if (finalOrder.payment_status === CommercePaymentStatus.PAYMENT_CONFIRMED) {
    assert.ok(finalOrder.stock_deducted_at);
    assert.ok(finalOrder.stock_restored_at);
  } else {
    assert.equal(finalOrder.stock_deducted_at, null);
  }
  assert.equal(await prisma.commerceProduct.findUnique({ where: { id: productId } }).then((product) => product?.stock_quantity), 1);
});

test('real MySQL rolls back every line when a multi-line order cannot be deducted atomically', { skip: skipReason }, async () => {
  const tenant = await createTenant('multi-line');
  const productA = await createProduct(tenant, 'multi-line-a', { stockQuantity: 1 });
  const productB = await createProduct(tenant, 'multi-line-b', { stockQuantity: 0 });
  const order = await createOrder(tenant, [
    { productId: productA, quantity: 1 },
    { productId: productB, quantity: 1 },
  ]);

  const result = await updateOrderStatus(tenant, order.id, {
    paymentStatus: CommercePaymentStatus.PAYMENT_CONFIRMED,
  });
  assertNoRawDatabaseError(result);
  assert.equal(result.code, 409);
  assert.equal(result.error, true);
  assert.equal(result.errorCode, 'INSUFFICIENT_STOCK');

  const products = await prisma.commerceProduct.findMany({
    where: { id: { in: [productA, productB] } },
    select: { id: true, stock_quantity: true },
  });
  assert.deepEqual(
    new Map(products.map((product) => [product.id, product.stock_quantity])),
    new Map([[productA, 1], [productB, 0]]),
  );
  const persistedOrder = await prisma.commerceOrder.findUnique({
    where: { id: order.id },
    select: { payment_status: true, stock_deducted_at: true },
  });
  assert.equal(persistedOrder?.payment_status, CommercePaymentStatus.AWAITING_PAYMENT);
  assert.equal(persistedOrder?.stock_deducted_at, null);
});

test('real MySQL applies and restores combo component inventory from immutable snapshots', { skip: skipReason }, async () => {
  const tenant = await createTenant('combo');
  const componentId = await createProduct(tenant, 'combo-component', { stockQuantity: 1 });
  const comboId = await createProduct(tenant, 'combo-product', {
    price: '25.00',
    stockQuantity: 0,
    trackStock: false,
    productType: CommerceProductType.COMBO,
  });
  await prisma.commerceComboItem.create({
    data: {
      combo_product_id: comboId,
      component_product_id: componentId,
      quantity: 1,
    },
  });

  const order = await createOrder(tenant, [{ productId: comboId, quantity: 1 }]);
  const snapshot = await prisma.commerceOrderItemComponentSnapshot.findFirst({
    where: { order_item: { order_id: order.id } },
    select: { component_product_id: true, total_component_quantity: true },
  });
  assert.deepEqual(snapshot, { component_product_id: componentId, total_component_quantity: 1 });

  const confirmed = await updateOrderStatus(tenant, order.id, {
    paymentStatus: CommercePaymentStatus.PAYMENT_CONFIRMED,
  });
  assertNoRawDatabaseError(confirmed);
  assert.equal(confirmed.code, 200);
  assert.equal(await prisma.commerceProduct.findUnique({ where: { id: componentId } }).then((product) => product?.stock_quantity), 0);

  const cancelled = await updateOrderStatus(tenant, order.id, {
    fulfillmentStatus: CommerceFulfillmentStatus.CANCELLED,
  });
  const repeatedCancellation = await updateOrderStatus(tenant, order.id, {
    fulfillmentStatus: CommerceFulfillmentStatus.CANCELLED,
  });
  assertNoRawDatabaseError(cancelled);
  assertNoRawDatabaseError(repeatedCancellation);
  assert.equal(cancelled.code, 200);
  assert.equal(repeatedCancellation.code, 200);
  assert.equal(await prisma.commerceProduct.findUnique({ where: { id: componentId } }).then((product) => product?.stock_quantity), 1);
});

test('real MySQL preserves the checkout price snapshot after catalog price changes', { skip: skipReason }, async () => {
  const tenant = await createTenant('price-snapshot');
  const productId = await createProduct(tenant, 'price-snapshot-product', { price: '12.50' });
  const order = await createOrder(tenant, [{ productId, quantity: 1 }]);

  await prisma.commerceProduct.update({
    where: { id: productId },
    data: { price: new Prisma.Decimal('99.00') },
  });
  const item = await prisma.commerceOrderItem.findFirst({
    where: { order_id: order.id },
    select: { unit_price_snapshot: true, total: true },
  });
  assert.equal(Number(item?.unit_price_snapshot), 12.5);
  assert.equal(Number(item?.total), 12.5);
});
