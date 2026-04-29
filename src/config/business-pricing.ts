import {
    BillingCycle,
    BusinessPricingProductKey,
    BusinessPricingProductType,
    ProductCode,
    ProductTierCode,
} from '@prisma/client';

export const SELF_SERVICE_DEFAULT_CURRENCY = 'Bs.';
export const SELF_SERVICE_DEFAULT_BILLING_CYCLE = BillingCycle.MONTHLY;
export const SELF_SERVICE_REDIRECT_PATH = '/admin/onboarding';

export const PUBLIC_CORE_PRODUCT_KEYS = [
    BusinessPricingProductKey.RESERVAS,
    BusinessPricingProductKey.EVENTOS,
    BusinessPricingProductKey.CLASES,
    BusinessPricingProductKey.TIENDA,
] as const;

export const SELECTABLE_CORE_PRODUCT_KEYS = [
    BusinessPricingProductKey.RESERVAS,
    BusinessPricingProductKey.EVENTOS,
    BusinessPricingProductKey.CLASES,
] as const;

export const PUBLIC_ADD_ON_KEYS = [
    BusinessPricingProductKey.PERSONALIZACION_PRO,
    BusinessPricingProductKey.METRICAS,
    BusinessPricingProductKey.MENSAJERIA_PRO,
    BusinessPricingProductKey.CRM_PRO,
] as const;

export type PublicCoreProductKey = (typeof PUBLIC_CORE_PRODUCT_KEYS)[number];
export type SelectableCoreProductKey = (typeof SELECTABLE_CORE_PRODUCT_KEYS)[number];
export type PublicAddOnKey = (typeof PUBLIC_ADD_ON_KEYS)[number];
export type PublicBusinessPricingProductKey = PublicCoreProductKey | PublicAddOnKey;

export type BusinessPricingProductDefault = {
    productKey: PublicBusinessPricingProductKey;
    type: BusinessPricingProductType;
    displayName: string;
    description: string;
    monthlyPriceBs: number;
    isActive: boolean;
    isComingSoon: boolean;
    sortOrder: number;
    metadata?: Record<string, unknown>;
};

export const DEFAULT_BUSINESS_PRICING_PRODUCTS: BusinessPricingProductDefault[] = [
    {
        productKey: BusinessPricingProductKey.RESERVAS,
        type: BusinessPricingProductType.CORE,
        displayName: 'Reservas',
        description: 'Para negocios que viven de citas, servicios y horarios.',
        monthlyPriceBs: 300,
        isActive: true,
        isComingSoon: false,
        sortOrder: 1,
    },
    {
        productKey: BusinessPricingProductKey.EVENTOS,
        type: BusinessPricingProductType.CORE,
        displayName: 'Eventos',
        description: 'Para vender entradas, registrar asistentes y manejar eventos sin planillas eternas.',
        monthlyPriceBs: 300,
        isActive: true,
        isComingSoon: false,
        sortOrder: 2,
    },
    {
        productKey: BusinessPricingProductKey.CLASES,
        type: BusinessPricingProductType.CORE,
        displayName: 'Clases',
        description: 'Para operar clases recurrentes, sesiones, alumnos y asistencia.',
        monthlyPriceBs: 300,
        isActive: true,
        isComingSoon: false,
        sortOrder: 3,
    },
    {
        productKey: BusinessPricingProductKey.TIENDA,
        type: BusinessPricingProductType.CORE,
        displayName: 'Tienda',
        description: 'Tu tienda online en Priconpri está en camino.',
        monthlyPriceBs: 300,
        isActive: false,
        isComingSoon: true,
        sortOrder: 4,
    },
    {
        productKey: BusinessPricingProductKey.PERSONALIZACION_PRO,
        type: BusinessPricingProductType.ADDON,
        displayName: 'Personalización Pro',
        description: 'Una página que no parece plantilla.',
        monthlyPriceBs: 400,
        isActive: true,
        isComingSoon: false,
        sortOrder: 10,
    },
    {
        productKey: BusinessPricingProductKey.METRICAS,
        type: BusinessPricingProductType.ADDON,
        displayName: 'Métricas',
        description: 'Tomá decisiones con números, no con intuición.',
        monthlyPriceBs: 250,
        isActive: true,
        isComingSoon: false,
        sortOrder: 11,
    },
    {
        productKey: BusinessPricingProductKey.MENSAJERIA_PRO,
        type: BusinessPricingProductType.ADDON,
        displayName: 'Mensajería Pro',
        description: 'Menos ausencias, más recompra y clientes mejor atendidos.',
        monthlyPriceBs: 300,
        isActive: true,
        isComingSoon: false,
        sortOrder: 12,
    },
    {
        productKey: BusinessPricingProductKey.CRM_PRO,
        type: BusinessPricingProductType.ADDON,
        displayName: 'CRM Pro',
        description: 'Tus clientes no deberían vivir perdidos en chats.',
        monthlyPriceBs: 250,
        isActive: true,
        isComingSoon: false,
        sortOrder: 13,
    },
];

export const DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS = [
    { minSelectedItems: 1, discountPercent: 0, label: '1 producto', isActive: true },
    { minSelectedItems: 2, discountPercent: 10, label: '2 productos', isActive: true },
    { minSelectedItems: 3, discountPercent: 15, label: '3 productos', isActive: true },
    { minSelectedItems: 4, discountPercent: 20, label: '4+ productos', isActive: true },
] as const;

export const DEFAULT_BUSINESS_PRICING_SETTINGS = {
    annualDiscountPercent: 15,
    trialLengthDays: 30,
    firstMonthFree: true,
} as const;

export function isSelectableCoreProduct(value: string): value is SelectableCoreProductKey {
    return SELECTABLE_CORE_PRODUCT_KEYS.includes(value as SelectableCoreProductKey);
}

export function isSupportedAddOn(value: string): value is PublicAddOnKey {
    return PUBLIC_ADD_ON_KEYS.includes(value as PublicAddOnKey);
}

export function isKnownPublicCoreProduct(value: string): value is PublicCoreProductKey {
    return PUBLIC_CORE_PRODUCT_KEYS.includes(value as PublicCoreProductKey);
}

export function mapCoreProductsToCommercialProducts(
    coreProducts: readonly SelectableCoreProductKey[],
    availableUntil: Date,
): Array<{
    productCode: ProductCode;
    tierCode: ProductTierCode;
    billingCycle: BillingCycle;
    pricePaid: null;
    currency: string;
    availableUntil: Date;
}> {
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
): Array<{
    productCode: ProductCode;
    tierCode: ProductTierCode;
    billingCycle: BillingCycle;
    pricePaid: null;
    currency: string;
    availableUntil: Date;
}> {
    return addOns.map((addOnCode) => ({
        productCode: mapAddOnToProductCode(addOnCode),
        tierCode: mapAddOnToTier(addOnCode),
        billingCycle: SELF_SERVICE_DEFAULT_BILLING_CYCLE,
        pricePaid: null,
        currency: SELF_SERVICE_DEFAULT_CURRENCY,
        availableUntil,
    }));
}

export function mapBusinessPricingKeyToProductCode(
    key: PublicBusinessPricingProductKey,
): ProductCode {
    if (key === BusinessPricingProductKey.RESERVAS) return ProductCode.RESERVAS;
    if (key === BusinessPricingProductKey.EVENTOS) return ProductCode.EVENTOS;
    if (key === BusinessPricingProductKey.CLASES) return ProductCode.CLASES;
    if (key === BusinessPricingProductKey.TIENDA) return ProductCode.MARKETPLACE;
    if (key === BusinessPricingProductKey.PERSONALIZACION_PRO) return ProductCode.PERSONALIZACION;
    if (key === BusinessPricingProductKey.METRICAS) return ProductCode.METRICAS;
    if (key === BusinessPricingProductKey.MENSAJERIA_PRO) return ProductCode.MENSAJERIA;
    return ProductCode.CRM;
}

function mapCoreProductToTier(productCode: SelectableCoreProductKey): ProductTierCode {
    if (productCode === BusinessPricingProductKey.RESERVAS) return ProductTierCode.RESERVAS_BASE;
    if (productCode === BusinessPricingProductKey.EVENTOS) return ProductTierCode.EVENTOS_BASE;
    return ProductTierCode.CLASES_BASE;
}

function mapAddOnToProductCode(addOnCode: PublicAddOnKey): ProductCode {
    return mapBusinessPricingKeyToProductCode(addOnCode);
}

function mapAddOnToTier(addOnCode: PublicAddOnKey): ProductTierCode {
    if (addOnCode === BusinessPricingProductKey.PERSONALIZACION_PRO) {
        return ProductTierCode.PERSONALIZACION_PLUS;
    }
    if (addOnCode === BusinessPricingProductKey.METRICAS) return ProductTierCode.METRICAS_PRO;
    if (addOnCode === BusinessPricingProductKey.MENSAJERIA_PRO) return ProductTierCode.MENSAJERIA_PRO;
    return ProductTierCode.CRM_PRO;
}
