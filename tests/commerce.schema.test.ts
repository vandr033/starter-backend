import assert from 'node:assert/strict';
import test from 'node:test';

import {
    adminCommerceCatalogQuerySchema,
    createCommerceComboSchema,
    createCommerceProductSchema,
    reorderCommerceProductImagesSchema,
    updateCommerceProductImageSchema,
    upsertCommercePromotionSchema,
} from '../src/schemas/commerce.schema';

test('createCommerceProductSchema normalizes camelCase payloads into service shape', () => {
    const parsed = createCommerceProductSchema.parse({
        name: 'Cafe',
        slug: 'cafe',
        categoryId: 'cat_123',
        price: 25,
        active: true,
        featured: true,
        trackStock: true,
        stockQuantity: 7,
        lowStockThreshold: 2,
        allowOutOfStockOrders: false,
        availableForPickup: true,
        availableForDelivery: false,
        sortOrder: 4,
        promotion: {
            promoPrice: 20,
            promoStartsAt: '2026-05-01T00:00:00.000Z',
            promoEndsAt: '2026-05-10T00:00:00.000Z',
            promoLabel: 'Promo mayo',
        },
        images: [
            {
                imageUrl: '/api/storage/uploads/1/commerce-products/product-1.png',
                altText: 'Taza de cafe',
                sortOrder: 0,
                isPrimary: true,
            },
        ],
    });

    assert.equal(parsed.category_id, 'cat_123');
    assert.equal(parsed.is_active, true);
    assert.equal(parsed.is_featured, true);
    assert.equal(parsed.track_stock, true);
    assert.equal(parsed.stock_quantity, 7);
    assert.equal(parsed.low_stock_threshold, 2);
    assert.equal(parsed.available_for_delivery, false);
    assert.equal(parsed.sort_order, 4);
    assert.equal(parsed.promo_price, 20);
    assert.equal(parsed.promo_label, 'Promo mayo');
    assert.equal(parsed.images?.[0]?.image_url, '/api/storage/uploads/1/commerce-products/product-1.png');
    assert.equal(parsed.images?.[0]?.alt_text, 'Taza de cafe');
    assert.equal(parsed.images?.[0]?.is_primary, true);
});

test('createCommerceComboSchema keeps items canonical and requires at least one item', () => {
    const parsed = createCommerceComboSchema.parse({
        name: 'Combo desayuno',
        slug: 'combo-desayuno',
        price: 40,
        visible: true,
        featured: false,
        items: [
            {
                productId: 'prod_1',
                quantity: 2,
            },
            {
                componentProductId: 'prod_2',
                quantity: 1,
            },
        ],
    });

    assert.equal(parsed.is_active, true);
    assert.deepEqual(parsed.items, [
        { productId: 'prod_1', quantity: 2 },
        { productId: 'prod_2', quantity: 1 },
    ]);
});

test('upsertCommercePromotionSchema accepts camelCase aliases', () => {
    const parsed = upsertCommercePromotionSchema.parse({
        regularPrice: 60,
        promoPrice: 45,
        promoStartsAt: '2026-05-01T00:00:00.000Z',
        promoEndsAt: '2026-05-15T00:00:00.000Z',
        promoLabel: 'Quincena',
    });

    assert.equal(parsed.regular_price, 60);
    assert.equal(parsed.promo_price, 45);
    assert.equal(parsed.promo_label, 'Quincena');
    assert.ok(parsed.promo_starts_at instanceof Date);
    assert.ok(parsed.promo_ends_at instanceof Date);
});

test('adminCommerceCatalogQuerySchema accepts categoryId and productType aliases', () => {
    const parsed = adminCommerceCatalogQuerySchema.parse({
        search: 'cafe',
        categoryId: 'cat_123',
        productType: 'COMBO',
        status: 'ACTIVE',
        page: '2',
        limit: '15',
    });

    assert.equal(parsed.category_id, 'cat_123');
    assert.equal(parsed.product_type, 'COMBO');
    assert.equal(parsed.page, 2);
    assert.equal(parsed.limit, 15);
});

test('image helper schemas accept camelCase aliases', () => {
    const reordered = reorderCommerceProductImagesSchema.parse({
        imageIds: ['img_1', 'img_2'],
    });
    const updated = updateCommerceProductImageSchema.parse({
        altText: 'Nueva descripcion',
    });

    assert.deepEqual(reordered.image_ids, ['img_1', 'img_2']);
    assert.equal(updated.alt_text, 'Nueva descripcion');
});
