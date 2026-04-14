import test from 'node:test';
import assert from 'node:assert/strict';
import { CommerceOrderStatus, PaymentStatus } from '@prisma/client';
import {
    buildDefaultDeliveryRulesFromHours,
    buildTrackingEmailHtml,
    buildTrackingWhatsappText,
    classifyCommerceIdentityMatch,
    getEffectiveCommerceUnitPriceCents,
    isPaymentStatusTransitionAllowed,
    isCommercePromotionActive,
    isStatusTransitionAllowed,
    resolveDeliveryRulesWithHoursFallback,
    validateDeliverySchedulingRule,
} from '../src/services/commerce.service';

test('commerce identity matching stays conservative when email and phone disagree', () => {
    assert.equal(classifyCommerceIdentityMatch(null, null), 'NONE');
    assert.equal(classifyCommerceIdentityMatch('user-1', null), 'EMAIL_ONLY');
    assert.equal(classifyCommerceIdentityMatch(null, 'user-2'), 'PHONE_ONLY');
    assert.equal(classifyCommerceIdentityMatch('user-3', 'user-3'), 'SAME_USER');
    assert.equal(classifyCommerceIdentityMatch('user-4', 'user-5'), 'CONFLICT');
});

test('commerce delivery scheduling rejects disabled days and unknown windows', () => {
    const disabledDay = validateDeliverySchedulingRule(
        {
            delivery_enabled: false,
            scheduled_enabled: true,
            windows: [{ label: '09:00-11:00' }],
        },
        '09:00-11:00',
    );

    const invalidWindow = validateDeliverySchedulingRule(
        {
            delivery_enabled: true,
            scheduled_enabled: true,
            windows: [{ label: '09:00-11:00' }],
        },
        '15:00-17:00',
    );

    const validSelection = validateDeliverySchedulingRule(
        {
            delivery_enabled: true,
            scheduled_enabled: true,
            windows: [{ label: '09:00-11:00' }],
        },
        '09:00-11:00',
    );

    assert.equal(disabledDay.ok, false);
    assert.equal(disabledDay.message, 'Selected delivery date is unavailable');
    assert.equal(invalidWindow.ok, false);
    assert.equal(invalidWindow.message, 'Selected delivery timeframe is unavailable');
    assert.deepEqual(validSelection, {
        ok: true,
        scheduledTimeframe: '09:00-11:00',
    });
});

test('commerce delivery rules fall back to company hours when explicit rules are missing', () => {
    const derivedRules = buildDefaultDeliveryRulesFromHours([
        {
            day_of_week: 1,
            open_time: '09:00',
            close_time: '18:00',
            is_closed: false,
        },
    ]);

    assert.equal(derivedRules[1]?.delivery_enabled, true);
    assert.equal(derivedRules[1]?.asap_enabled, true);
    assert.equal(derivedRules[1]?.scheduled_enabled, true);
    assert.deepEqual(derivedRules[1]?.windows, [
        {
            id: undefined,
            label: '09:00-18:00',
            start_time: '09:00',
            end_time: '18:00',
            sort_order: 0,
        },
    ]);

    const resolution = resolveDeliveryRulesWithHoursFallback([], [
        {
            day_of_week: 1,
            open_time: '09:00',
            close_time: '18:00',
            is_closed: false,
        },
    ]);

    assert.equal(resolution.source, 'company_hours');
    assert.equal(resolution.rules[1]?.windows[0]?.label, '09:00-18:00');
});

test('commerce explicit delivery rules override company hours', () => {
    const resolution = resolveDeliveryRulesWithHoursFallback(
        [
            {
                weekday: 2,
                delivery_enabled: true,
                asap_enabled: false,
                scheduled_enabled: true,
                windows: [
                    {
                        label: 'Lunch',
                        start_time: '12:00',
                        end_time: '14:00',
                        sort_order: 0,
                    },
                ],
            },
        ],
        [
            {
                day_of_week: 2,
                open_time: '09:00',
                close_time: '18:00',
                is_closed: false,
            },
        ],
    );

    assert.equal(resolution.source, 'explicit');
    assert.equal(resolution.rules.length, 1);
    assert.equal(resolution.rules[0]?.windows[0]?.label, 'Lunch');
});

test('commerce promotions only apply when the scheduled date range is active', () => {
    const activeProduct = {
        regular_price_cents: 5000,
        promotional_price_cents: 4500,
        promo_valid_from: null,
        promo_valid_until: null,
    };
    const futurePromoProduct = {
        regular_price_cents: 5000,
        promotional_price_cents: 4500,
        promo_valid_from: new Date('2026-05-01T00:00:00.000Z'),
        promo_valid_until: null,
    };
    const expiredPromoProduct = {
        regular_price_cents: 5000,
        promotional_price_cents: 4500,
        promo_valid_from: null,
        promo_valid_until: new Date('2026-04-01T23:59:59.999Z'),
    };
    const referenceDate = new Date('2026-04-14T12:00:00.000Z');

    assert.equal(isCommercePromotionActive(activeProduct, referenceDate), true);
    assert.equal(isCommercePromotionActive(futurePromoProduct, referenceDate), false);
    assert.equal(isCommercePromotionActive(expiredPromoProduct, referenceDate), false);
    assert.equal(getEffectiveCommerceUnitPriceCents(activeProduct, referenceDate), 4500);
    assert.equal(getEffectiveCommerceUnitPriceCents(futurePromoProduct, referenceDate), 5000);
    assert.equal(getEffectiveCommerceUnitPriceCents(expiredPromoProduct, referenceDate), 5000);
});

test('commerce status transitions keep staff within the expected fulfillment workflow', () => {
    assert.equal(
        isStatusTransitionAllowed(CommerceOrderStatus.NEW, CommerceOrderStatus.CANCELLED, 'admin'),
        true,
    );
    assert.equal(
        isStatusTransitionAllowed(CommerceOrderStatus.NEW, CommerceOrderStatus.CANCELLED, 'staff'),
        false,
    );
    assert.equal(
        isStatusTransitionAllowed(CommerceOrderStatus.ASSIGNED, CommerceOrderStatus.IN_PROCESS, 'staff'),
        true,
    );
    assert.equal(
        isStatusTransitionAllowed(CommerceOrderStatus.ASSIGNED, CommerceOrderStatus.DELIVERED, 'staff'),
        false,
    );
});

test('commerce tracking messages include the link and support channel', () => {
    const whatsappText = buildTrackingWhatsappText({
        brandName: 'PriConPri Store',
        trackingLink: 'https://tracking.example/abc',
        supportPhone: '+59177777777',
    });
    const emailHtml = buildTrackingEmailHtml({
        brandName: 'PriConPri Store',
        trackingLink: 'https://tracking.example/abc',
        supportPhone: '+59177777777',
    });

    assert.match(whatsappText, /PriConPri Store/);
    assert.match(whatsappText, /https:\/\/tracking\.example\/abc/);
    assert.match(whatsappText, /\+59177777777/);
    assert.match(emailHtml, /Ver seguimiento/);
    assert.match(emailHtml, /https:\/\/tracking\.example\/abc/);
});

test('commerce payment transitions allow review flows but prevent downgrading paid orders', () => {
    assert.equal(
        isPaymentStatusTransitionAllowed(PaymentStatus.UNPAID, PaymentStatus.PENDING_CONFIRMATION),
        true,
    );
    assert.equal(
        isPaymentStatusTransitionAllowed(PaymentStatus.PENDING_CONFIRMATION, PaymentStatus.PAID),
        true,
    );
    assert.equal(
        isPaymentStatusTransitionAllowed(PaymentStatus.REJECTED, PaymentStatus.PENDING_CONFIRMATION),
        true,
    );
    assert.equal(
        isPaymentStatusTransitionAllowed(PaymentStatus.PAID, PaymentStatus.REJECTED),
        false,
    );
});
