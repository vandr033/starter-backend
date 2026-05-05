import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isServicePromoActive,
    resolveEffectiveServicePrice,
    validateServicePromoWindow,
} from '../src/services/service-pricing.service';

test('service promo activates only inside its configured window', () => {
    const now = new Date('2026-04-30T12:00:00.000Z');

    assert.equal(
        isServicePromoActive({
            promoPriceCents: 8500,
            promoStartsAt: new Date('2026-04-29T00:00:00.000Z'),
            promoEndsAt: new Date('2026-05-01T00:00:00.000Z'),
            promotionsEnabled: true,
            now,
        }),
        true,
    );

    assert.equal(
        isServicePromoActive({
            promoPriceCents: 8500,
            promoStartsAt: new Date('2026-05-02T00:00:00.000Z'),
            promoEndsAt: new Date('2026-05-04T00:00:00.000Z'),
            promotionsEnabled: true,
            now,
        }),
        false,
    );

    assert.equal(
        isServicePromoActive({
            promoPriceCents: 8500,
            promoStartsAt: new Date('2026-04-29T00:00:00.000Z'),
            promoEndsAt: new Date('2026-05-01T00:00:00.000Z'),
            promotionsEnabled: false,
            now,
        }),
        false,
    );
});

test('effective service price snapshots keep regular and final amounts when promo is active', () => {
    const pricing = resolveEffectiveServicePrice({
        priceCents: 12000,
        promoPriceCents: 9900,
        promoStartsAt: new Date('2026-04-01T00:00:00.000Z'),
        promoEndsAt: new Date('2026-05-30T00:00:00.000Z'),
        promoLabel: 'Otoño',
        promotionsEnabled: true,
        now: new Date('2026-04-30T12:00:00.000Z'),
    });

    assert.equal(pricing.basePriceCents, 12000);
    assert.equal(pricing.finalPriceCents, 9900);
    assert.equal(pricing.regularPriceCents, 12000);
    assert.equal(pricing.promoApplied, true);
    assert.equal(pricing.promoLabel, 'Otoño');
});

test('service promo validation rejects inverted windows', () => {
    const error = validateServicePromoWindow({
        priceCents: 12000,
        promoPriceCents: 9900,
        promoStartsAt: new Date('2026-05-10T00:00:00.000Z'),
        promoEndsAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    assert.match(error || '', /terminar antes de empezar/i);
});
