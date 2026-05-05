import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isCommercePromoActive,
    resolveEffectiveCommercePrice,
    validateCommercePromoWindow,
} from '../src/services/commerce-pricing.service';

test('commerce promo activates only inside its configured window', () => {
    const now = new Date('2026-04-30T12:00:00.000Z');

    assert.equal(
        isCommercePromoActive({
            promoPrice: 85,
            promoStartsAt: new Date('2026-04-29T00:00:00.000Z'),
            promoEndsAt: new Date('2026-05-01T00:00:00.000Z'),
            now,
        }),
        true,
    );

    assert.equal(
        isCommercePromoActive({
            promoPrice: 85,
            promoStartsAt: new Date('2026-05-02T00:00:00.000Z'),
            promoEndsAt: new Date('2026-05-04T00:00:00.000Z'),
            now,
        }),
        false,
    );

    assert.equal(
        isCommercePromoActive({
            promoPrice: 85,
            promoStartsAt: new Date('2026-04-01T00:00:00.000Z'),
            promoEndsAt: new Date('2026-04-15T00:00:00.000Z'),
            now,
        }),
        false,
    );
});

test('effective commerce price falls back to base price as comparison when promo is active', () => {
    const pricing = resolveEffectiveCommercePrice({
        price: 120,
        promoPrice: 99,
        promoStartsAt: new Date('2026-04-01T00:00:00.000Z'),
        promoEndsAt: new Date('2026-05-30T00:00:00.000Z'),
        promoLabel: 'Otono',
        now: new Date('2026-04-30T12:00:00.000Z'),
    });

    assert.equal(pricing.basePrice.toNumber(), 120);
    assert.equal(pricing.finalPrice.toNumber(), 99);
    assert.equal(pricing.regularPrice?.toNumber(), 120);
    assert.equal(pricing.promoApplied, true);
    assert.equal(pricing.promoLabel, 'Otono');
});

test('commerce promo validation rejects non-discount promos and non-forward windows', () => {
    const samePriceError = validateCommercePromoWindow({
        price: 120,
        promoPrice: 120,
    });
    assert.match(samePriceError || '', /menor al precio base/i);

    const invertedWindowError = validateCommercePromoWindow({
        price: 120,
        promoPrice: 99,
        promoStartsAt: new Date('2026-05-10T00:00:00.000Z'),
        promoEndsAt: new Date('2026-05-10T00:00:00.000Z'),
    });
    assert.match(invertedWindowError || '', /terminar.*empezar/i);
});
