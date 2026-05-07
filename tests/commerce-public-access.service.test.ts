import assert from 'node:assert/strict';
import test from 'node:test';

import * as CommerceRepo from '../src/repositories/commerce.repo';
import {
    getPublicCommerceOrder,
    submitPublicCommercePaymentProof,
} from '../src/services/commerce-order.service';

const originalFindActiveCommerceCompanyBySlug = CommerceRepo.findActiveCommerceCompanyBySlug;
const originalFindCommerceStoreByCompanyId = CommerceRepo.findCommerceStoreByCompanyId;
const originalGetPublicCommerceOrderByOrderNumber = CommerceRepo.getPublicCommerceOrderByOrderNumber;
const mutableCommerceRepo = CommerceRepo as {
    findActiveCommerceCompanyBySlug: typeof CommerceRepo.findActiveCommerceCompanyBySlug;
    findCommerceStoreByCompanyId: typeof CommerceRepo.findCommerceStoreByCompanyId;
    getPublicCommerceOrderByOrderNumber: typeof CommerceRepo.getPublicCommerceOrderByOrderNumber;
};

function buildPublicOrder() {
    return {
        id: 'order_1',
        company_id: 1,
        order_number: 'TDA-000123',
        public_access_token: 'opaque-public-token',
        customer_name: 'Ada Lovelace',
        customer_profile: {
            id: 10,
            user_id: 'user_owner',
        },
        payment_method: 'QR',
        payment_status: 'AWAITING_PAYMENT',
        fulfillment_status: 'NEW',
        payment_proof_url: null,
        subtotal: 120,
        delivery_cost: 0,
        total: 120,
        items: [],
        pickup_point: null,
    } as any;
}

function mockLookupDependencies() {
    mutableCommerceRepo.findActiveCommerceCompanyBySlug = async () => ({
        id: 1,
        slug: 'tienda-demo',
        name: 'Tienda Demo',
        currency: 'BOB',
        logo_url: null,
    } as any);

    mutableCommerceRepo.findCommerceStoreByCompanyId = async () => ({
        id: 'store_1',
        company_id: 1,
        allow_cash_payment: true,
        allow_qr_payment: true,
        allow_manual_payment: true,
        qr_image_url: '/api/storage/uploads/1/commerce-store/qr.png',
        payment_instructions: 'Envianos tu comprobante.',
        payment_proof_required: true,
        delivery_cost_mode: 'FIXED',
        delivery_instructions: null,
    } as any);

    mutableCommerceRepo.getPublicCommerceOrderByOrderNumber = async () => buildPublicOrder();
}

test.afterEach(() => {
    mutableCommerceRepo.findActiveCommerceCompanyBySlug = originalFindActiveCommerceCompanyBySlug;
    mutableCommerceRepo.findCommerceStoreByCompanyId = originalFindCommerceStoreByCompanyId;
    mutableCommerceRepo.getPublicCommerceOrderByOrderNumber = originalGetPublicCommerceOrderByOrderNumber;
});

test('public commerce order lookup works with a valid opaque token', async () => {
    mockLookupDependencies();

    const result = await getPublicCommerceOrder('tienda-demo', 'TDA-000123', {
        accessToken: 'opaque-public-token',
    });

    assert.equal(result.code, 200);
    assert.equal(result.error, false);
    assert.equal((result.data as any)?.order?.order_number, 'TDA-000123');
});

test('public commerce order lookup rejects a missing token for guest-style access', async () => {
    mockLookupDependencies();

    const result = await getPublicCommerceOrder('tienda-demo', 'TDA-000123');

    assert.equal(result.code, 404);
    assert.equal(result.error, true);
    assert.equal(result.data, undefined);
});

test('public commerce order lookup rejects an invalid opaque token', async () => {
    mockLookupDependencies();

    const result = await getPublicCommerceOrder('tienda-demo', 'TDA-000123', {
        accessToken: 'wrong-token',
    });

    assert.equal(result.code, 404);
    assert.equal(result.error, true);
    assert.equal(result.data, undefined);
});

test('guessing a human-readable order number still does not expose the order', async () => {
    mockLookupDependencies();

    const result = await getPublicCommerceOrder('tienda-demo', 'TDA-000123', {
        accessToken: 'guessed-token-from-order-number',
    });

    assert.equal(result.code, 404);
    assert.equal(result.error, true);
    assert.equal(result.data, undefined);
});

test('unauthorized payment proof submission is rejected before mutating another order', async () => {
    mockLookupDependencies();

    const result = await submitPublicCommercePaymentProof(
        'tienda-demo',
        'TDA-000123',
        'uploads/1/commerce-payment-proofs/orders/order_1/proof-test.png',
        {
            accessToken: 'wrong-token',
        },
    );

    assert.equal(result.code, 404);
    assert.equal(result.error, true);
    assert.equal(result.data, undefined);
});
