"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isServicePromoActive = isServicePromoActive;
exports.resolveEffectiveServicePrice = resolveEffectiveServicePrice;
exports.validateServicePromoWindow = validateServicePromoWindow;
function isServicePromoActive(input) {
    if (input.promotionsEnabled === false)
        return false;
    if (input.promoPriceCents == null)
        return false;
    const now = input.now ?? new Date();
    if (input.promoStartsAt && input.promoStartsAt > now) {
        return false;
    }
    if (input.promoEndsAt && input.promoEndsAt < now) {
        return false;
    }
    return true;
}
function resolveEffectiveServicePrice(input) {
    const promoApplied = isServicePromoActive(input);
    const promoPriceCents = promoApplied ? input.promoPriceCents ?? null : null;
    return {
        basePriceCents: input.priceCents,
        finalPriceCents: promoPriceCents ?? input.priceCents,
        regularPriceCents: promoApplied ? input.priceCents : null,
        promoPriceCents,
        promoApplied,
        promoLabel: promoApplied ? input.promoLabel?.trim() || null : null,
        promoStartsAt: input.promoStartsAt ?? null,
        promoEndsAt: input.promoEndsAt ?? null,
    };
}
function validateServicePromoWindow(input) {
    if (input.promoPriceCents == null) {
        return null;
    }
    if (!Number.isFinite(input.promoPriceCents) || input.promoPriceCents < 0) {
        return 'El precio promocional debe ser mayor o igual a 0.';
    }
    if (input.promoStartsAt && input.promoEndsAt && input.promoStartsAt > input.promoEndsAt) {
        return 'La promoción no puede terminar antes de empezar.';
    }
    if (!Number.isFinite(input.priceCents) || input.priceCents < 0) {
        return 'El precio regular del servicio no es válido.';
    }
    return null;
}
