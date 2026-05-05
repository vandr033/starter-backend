import { Prisma } from '@prisma/client';

export type EffectiveCommercePrice = {
    regularPrice: Prisma.Decimal | null;
    basePrice: Prisma.Decimal;
    finalPrice: Prisma.Decimal;
    promoApplied: boolean;
    promoLabel: string | null;
    promoStartsAt: Date | null;
    promoEndsAt: Date | null;
};

type CommercePriceInput = {
    price: Prisma.Decimal | number | string;
    regularPrice?: Prisma.Decimal | number | string | null;
    promoPrice?: Prisma.Decimal | number | string | null;
    promoStartsAt?: Date | null;
    promoEndsAt?: Date | null;
    promoLabel?: string | null;
    now?: Date;
};

function toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
    return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function isCommercePromoActive(input: {
    promoPrice?: Prisma.Decimal | number | string | null;
    promoStartsAt?: Date | null;
    promoEndsAt?: Date | null;
    now?: Date;
}): boolean {
    if (input.promoPrice === null || input.promoPrice === undefined) return false;
    const now = input.now ?? new Date();

    if (input.promoStartsAt && input.promoStartsAt > now) {
        return false;
    }

    if (input.promoEndsAt && input.promoEndsAt < now) {
        return false;
    }

    return true;
}

export function resolveEffectiveCommercePrice(input: CommercePriceInput): EffectiveCommercePrice {
    const basePrice = toDecimal(input.price);
    const regularPrice = input.regularPrice != null ? toDecimal(input.regularPrice) : null;
    const promoApplied = isCommercePromoActive(input);
    const promoPrice =
        promoApplied && input.promoPrice != null ? toDecimal(input.promoPrice) : null;

    return {
        regularPrice: promoApplied ? regularPrice ?? basePrice : regularPrice,
        basePrice,
        finalPrice: promoPrice ?? basePrice,
        promoApplied,
        promoLabel: promoApplied ? input.promoLabel?.trim() || null : null,
        promoStartsAt: input.promoStartsAt ?? null,
        promoEndsAt: input.promoEndsAt ?? null,
    };
}

export function validateCommercePromoWindow(input: {
    price: number | string | Prisma.Decimal;
    regularPrice?: number | string | Prisma.Decimal | null;
    promoPrice?: number | string | Prisma.Decimal | null;
    promoStartsAt?: Date | null;
    promoEndsAt?: Date | null;
}): string | null {
    const basePrice = Number(input.price);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
        return 'El precio base del producto no es válido.';
    }

    if (input.regularPrice != null) {
        const regularPrice = Number(input.regularPrice);
        if (!Number.isFinite(regularPrice) || regularPrice < 0) {
            return 'El precio regular del producto no es válido.';
        }

        if (regularPrice < basePrice) {
            return 'El precio regular no puede ser menor al precio base.';
        }
    }

    if (input.promoPrice == null) return null;

    const promoPrice = Number(input.promoPrice);
    if (!Number.isFinite(promoPrice) || promoPrice < 0) {
        return 'El precio promocional debe ser mayor o igual a 0.';
    }

    if (promoPrice >= basePrice) {
        return 'El precio promocional debe ser menor al precio base.';
    }

    if (input.promoStartsAt && input.promoEndsAt && input.promoStartsAt >= input.promoEndsAt) {
        return 'La promoción debe terminar después de empezar.';
    }

    return null;
}
