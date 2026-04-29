import { BillingCycle, ProductCode, ProductTierCode } from '@prisma/client';
import type { CommercialProductInput } from '../services/super-admin-shop-commercial.service';

export const SELF_SERVICE_TRIAL_DAYS = 30;
export const SELF_SERVICE_DEFAULT_CURRENCY = 'Bs.';
export const SELF_SERVICE_DEFAULT_BILLING_CYCLE = BillingCycle.MONTHLY;
export const SELF_SERVICE_REDIRECT_PATH = '/admin/onboarding';

export const PUBLIC_CORE_PRODUCT_KEYS = ['RESERVAS', 'EVENTOS', 'CLASES', 'TIENDA'] as const;
export const SELECTABLE_CORE_PRODUCT_KEYS = ['RESERVAS', 'EVENTOS', 'CLASES'] as const;
export const PUBLIC_ADD_ON_KEYS = [
    'PERSONALIZACION_PRO',
    'METRICAS',
    'MENSAJERIA_PRO',
    'CRM_PRO',
] as const;

export type PublicCoreProductKey = (typeof PUBLIC_CORE_PRODUCT_KEYS)[number];
export type SelectableCoreProductKey = (typeof SELECTABLE_CORE_PRODUCT_KEYS)[number];
export type PublicAddOnKey = (typeof PUBLIC_ADD_ON_KEYS)[number];

type PublicProductPrice = {
    monthlyPrice: number;
};

export const PUBLIC_PRODUCT_PRICES: Record<
    SelectableCoreProductKey | PublicAddOnKey | 'TIENDA',
    PublicProductPrice
> = {
    RESERVAS: { monthlyPrice: 300 },
    EVENTOS: { monthlyPrice: 300 },
    CLASES: { monthlyPrice: 300 },
    TIENDA: { monthlyPrice: 300 },
    PERSONALIZACION_PRO: { monthlyPrice: 400 },
    METRICAS: { monthlyPrice: 250 },
    MENSAJERIA_PRO: { monthlyPrice: 300 },
    CRM_PRO: { monthlyPrice: 250 },
};

export function isSelectableCoreProduct(value: string): value is SelectableCoreProductKey {
    return SELECTABLE_CORE_PRODUCT_KEYS.includes(value as SelectableCoreProductKey);
}

export function isSupportedAddOn(value: string): value is PublicAddOnKey {
    return PUBLIC_ADD_ON_KEYS.includes(value as PublicAddOnKey);
}

export function isKnownPublicCoreProduct(value: string): value is PublicCoreProductKey {
    return PUBLIC_CORE_PRODUCT_KEYS.includes(value as PublicCoreProductKey);
}

export function getTrialEndsAt(now: Date = new Date()): Date {
    return new Date(now.getTime() + SELF_SERVICE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function mapCoreProductsToCommercialProducts(
    coreProducts: readonly SelectableCoreProductKey[],
    availableUntil: Date,
): CommercialProductInput[] {
    return coreProducts.map((productCode) => ({
        productCode,
        tierCode: mapCoreProductToTier(productCode),
        billingCycle: SELF_SERVICE_DEFAULT_BILLING_CYCLE,
        pricePaid: null,
        currency: SELF_SERVICE_DEFAULT_CURRENCY,
        availableUntil,
    }));
}

export function mapAddOnsToCommercialProducts(
    addOns: readonly PublicAddOnKey[],
    availableUntil: Date,
): CommercialProductInput[] {
    return addOns.map((addOnCode) => ({
        productCode: mapAddOnToProductCode(addOnCode),
        tierCode: mapAddOnToTier(addOnCode),
        billingCycle: SELF_SERVICE_DEFAULT_BILLING_CYCLE,
        pricePaid: null,
        currency: SELF_SERVICE_DEFAULT_CURRENCY,
        availableUntil,
    }));
}

function mapCoreProductToTier(productCode: SelectableCoreProductKey): ProductTierCode {
    if (productCode === 'RESERVAS') return ProductTierCode.RESERVAS_BASE;
    if (productCode === 'EVENTOS') return ProductTierCode.EVENTOS_BASE;
    return ProductTierCode.CLASES_BASE;
}

function mapAddOnToProductCode(addOnCode: PublicAddOnKey): ProductCode {
    if (addOnCode === 'PERSONALIZACION_PRO') return ProductCode.PERSONALIZACION;
    if (addOnCode === 'METRICAS') return ProductCode.METRICAS;
    if (addOnCode === 'MENSAJERIA_PRO') return ProductCode.MENSAJERIA;
    return ProductCode.CRM;
}

function mapAddOnToTier(addOnCode: PublicAddOnKey): ProductTierCode {
    if (addOnCode === 'PERSONALIZACION_PRO') return ProductTierCode.PERSONALIZACION_PLUS;
    if (addOnCode === 'METRICAS') return ProductTierCode.METRICAS_PRO;
    if (addOnCode === 'MENSAJERIA_PRO') return ProductTierCode.MENSAJERIA_PRO;
    return ProductTierCode.CRM_PRO;
}
