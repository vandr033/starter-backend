export type EffectiveServicePrice = {
    basePriceCents: number;
    finalPriceCents: number;
    regularPriceCents: number | null;
    promoPriceCents: number | null;
    promoApplied: boolean;
    promoLabel: string | null;
    promoStartsAt: Date | null;
    promoEndsAt: Date | null;
};

type ServicePriceInput = {
    priceCents: number;
    promoPriceCents?: number | null;
    promoStartsAt?: Date | null;
    promoEndsAt?: Date | null;
    promoLabel?: string | null;
    promotionsEnabled?: boolean;
    now?: Date;
};

export function isServicePromoActive(input: {
    promoPriceCents?: number | null;
    promoStartsAt?: Date | null;
    promoEndsAt?: Date | null;
    promotionsEnabled?: boolean;
    now?: Date;
}): boolean {
    if (input.promotionsEnabled === false) return false;
    if (input.promoPriceCents == null) return false;
    const now = input.now ?? new Date();

    if (input.promoStartsAt && input.promoStartsAt > now) {
        return false;
    }

    if (input.promoEndsAt && input.promoEndsAt < now) {
        return false;
    }

    return true;
}

export function resolveEffectiveServicePrice(
    input: ServicePriceInput,
): EffectiveServicePrice {
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

export function validateServicePromoWindow(input: {
    priceCents: number;
    promoPriceCents?: number | null;
    promoStartsAt?: Date | null;
    promoEndsAt?: Date | null;
}): string | null {
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
