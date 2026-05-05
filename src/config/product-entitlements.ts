import {
    CompanyProductSubscriptionStatus as PrismaCompanyProductSubscriptionStatus,
    ProductCapabilityCode as PrismaProductCapabilityCode,
    ProductCode as PrismaProductCode,
    ProductTierCode as PrismaProductTierCode,
    ShopPlan,
} from '@prisma/client';
import type { PlanFeatureKey } from './plan-capabilities';

export type ProductCode = (typeof PrismaProductCode)[keyof typeof PrismaProductCode];
export type ProductTierCode = (typeof PrismaProductTierCode)[keyof typeof PrismaProductTierCode];
export type ProductCapability =
    (typeof PrismaProductCapabilityCode)[keyof typeof PrismaProductCapabilityCode];
export type CompanyProductSubscriptionStatus =
    (typeof PrismaCompanyProductSubscriptionStatus)[keyof typeof PrismaCompanyProductSubscriptionStatus];

export const PRODUCT_CAPABILITY_CODES = Object.values(
    PrismaProductCapabilityCode,
) as ProductCapability[];

export type EffectiveCompanyProduct = {
    productCode: ProductCode;
    tierCode: ProductTierCode;
    status: CompanyProductSubscriptionStatus;
    isCore: boolean;
    includedByDefault: boolean;
};

export type CompanyEntitlementPayload = {
    version: 1;
    currentPlan: ShopPlan;
    maxStaffMembers: number | null;
    features: Record<PlanFeatureKey, boolean>;
    requiredPlans: Record<PlanFeatureKey, ShopPlan>;
    source: 'legacy_plan' | 'modular';
    productCapabilities: Record<ProductCapability, boolean>;
    products: EffectiveCompanyProduct[];
    activeCoreProducts: ProductTierCode[];
    activeAddOns: ProductTierCode[];
};

export type ProductCatalogSeedDefinition = {
    code: ProductCode;
    name: string;
    description: string;
    category: 'CORE_PRODUCT' | 'ADDON';
    isCoreProduct: boolean;
    isAddon: boolean;
    isActive: boolean;
    sortOrder: number;
};

export type ProductTierSeedDefinition = {
    productCode: ProductCode;
    code: ProductTierCode;
    name: string;
    description: string;
    tierLevel: number;
    isBase: boolean;
    isPro: boolean;
    isActive: boolean;
    sortOrder: number;
};

type ProductTierRuntimeDefinition = ProductTierSeedDefinition & {
    includedCapabilities: ProductCapability[];
};

type CapabilityRequirement = {
    allOf?: ProductCapability[];
    anyOf?: ProductCapability[];
};

export const PRODUCT_CATALOG_SEED: ProductCatalogSeedDefinition[] = [
    {
        code: PrismaProductCode.RESERVAS,
        name: 'Reservas',
        description: '1:1 bookings, services, staff availability, and appointment operations.',
        category: 'CORE_PRODUCT',
        isCoreProduct: true,
        isAddon: false,
        isActive: true,
        sortOrder: 10,
    },
    {
        code: PrismaProductCode.EVENTOS,
        name: 'Eventos',
        description: 'One-time group events, paid registrations, and free registrations.',
        category: 'CORE_PRODUCT',
        isCoreProduct: true,
        isAddon: false,
        isActive: true,
        sortOrder: 20,
    },
    {
        code: PrismaProductCode.CLASES,
        name: 'Clases',
        description: 'Recurring classes, sessions, enrollments, and attendance management.',
        category: 'CORE_PRODUCT',
        isCoreProduct: true,
        isAddon: false,
        isActive: true,
        sortOrder: 30,
    },
    {
        code: PrismaProductCode.STORES,
        name: 'Stores',
        description: 'Commerce storefronts, catalog, stock, orders, and fulfillment workflows.',
        category: 'CORE_PRODUCT',
        isCoreProduct: true,
        isAddon: false,
        isActive: true,
        sortOrder: 35,
    },
    {
        code: PrismaProductCode.PERSONALIZACION,
        name: 'Personalizacion',
        description: 'Storefront branding and layout controls.',
        category: 'ADDON',
        isCoreProduct: false,
        isAddon: true,
        isActive: true,
        sortOrder: 40,
    },
    {
        code: PrismaProductCode.CRM,
        name: 'CRM',
        description: 'Customer relationship management, segmentation, and lifecycle tools.',
        category: 'ADDON',
        isCoreProduct: false,
        isAddon: true,
        isActive: true,
        sortOrder: 50,
    },
    {
        code: PrismaProductCode.MENSAJERIA,
        name: 'Mensajeria',
        description: 'Transactional notifications, reminders, campaigns, and review requests.',
        category: 'ADDON',
        isCoreProduct: false,
        isAddon: true,
        isActive: true,
        sortOrder: 60,
    },
    {
        code: PrismaProductCode.METRICAS,
        name: 'Metricas',
        description: 'Operational dashboards and analytics.',
        category: 'ADDON',
        isCoreProduct: false,
        isAddon: true,
        isActive: true,
        sortOrder: 70,
    },
    {
        code: PrismaProductCode.MARKETPLACE,
        name: 'Marketplace',
        description: 'Marketplace visibility, premium discovery, and promotional placement.',
        category: 'ADDON',
        isCoreProduct: false,
        isAddon: true,
        isActive: true,
        sortOrder: 80,
    },
];

/**
 * Compatibility note:
 * `CRM_BASE`, `MENSAJERIA_BASE`, `PERSONALIZACION_BASE`, and `METRICAS_BASE`
 * are persisted as real tiers for now so the backfill can express the legacy
 * fixed-plan bundle without inventing opaque one-off rules in application code.
 * Once legacy plans are retired they can be collapsed into implicit grants if
 * the commercial catalog stops exposing them as standalone rows.
 */
export const PRODUCT_TIER_SEED: ProductTierSeedDefinition[] = [
    {
        productCode: PrismaProductCode.RESERVAS,
        code: PrismaProductTierCode.RESERVAS_BASE,
        name: 'Reservas Base',
        description: 'Public booking, services, staff selection, and core appointment management.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 10,
    },
    {
        productCode: PrismaProductCode.RESERVAS,
        code: PrismaProductTierCode.RESERVAS_PRO,
        name: 'Reservas Pro',
        description: 'Advanced booking controls, staff availability, reminders, and admin tooling.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 20,
    },
    {
        productCode: PrismaProductCode.EVENTOS,
        code: PrismaProductTierCode.EVENTOS_BASE,
        name: 'Eventos Base',
        description: 'Paid and free event registration, capacity, and attendee management.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 30,
    },
    {
        productCode: PrismaProductCode.EVENTOS,
        code: PrismaProductTierCode.EVENTOS_PRO,
        name: 'Eventos Pro',
        description: 'Advanced event operations, ticketing, and higher-touch attendee workflows.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 40,
    },
    {
        productCode: PrismaProductCode.CLASES,
        code: PrismaProductTierCode.CLASES_BASE,
        name: 'Clases Base',
        description: 'Recurring classes, enrollments, and session scheduling.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 50,
    },
    {
        productCode: PrismaProductCode.CLASES,
        code: PrismaProductTierCode.CLASES_PRO,
        name: 'Clases Pro',
        description: 'Advanced class lifecycle workflows, attendance, and course operations.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 60,
    },
    {
        productCode: PrismaProductCode.STORES,
        code: PrismaProductTierCode.STORES_BASE,
        name: 'Stores Base',
        description: 'Catalog, stock, guest checkout, pickup, delivery, and basic order management.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 65,
    },
    {
        productCode: PrismaProductCode.STORES,
        code: PrismaProductTierCode.STORES_PRO,
        name: 'Stores Pro',
        description: 'Scheduled orders, staff assignment, promotions, and advanced store operations.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 68,
    },
    {
        productCode: PrismaProductCode.PERSONALIZACION,
        code: PrismaProductTierCode.PERSONALIZACION_BASE,
        name: 'Personalizacion Base',
        description: 'Baseline storefront customization preserved for legacy bundle compatibility.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 70,
    },
    {
        productCode: PrismaProductCode.PERSONALIZACION,
        code: PrismaProductTierCode.PERSONALIZACION_PLUS,
        name: 'Personalizacion Plus',
        description: 'Advanced storefront CTA, layout, footer, and banner customization.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 80,
    },
    {
        productCode: PrismaProductCode.CRM,
        code: PrismaProductTierCode.CRM_BASE,
        name: 'CRM Base',
        description: 'Baseline CRM access preserved for legacy bundle compatibility.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 90,
    },
    {
        productCode: PrismaProductCode.CRM,
        code: PrismaProductTierCode.CRM_PRO,
        name: 'CRM Pro',
        description: 'Advanced CRM segmentation, import/export, and reactivation tooling.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 100,
    },
    {
        productCode: PrismaProductCode.MENSAJERIA,
        code: PrismaProductTierCode.MENSAJERIA_BASE,
        name: 'Mensajeria Base',
        description: 'Baseline transactional messaging preserved for legacy bundle compatibility.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 110,
    },
    {
        productCode: PrismaProductCode.MENSAJERIA,
        code: PrismaProductTierCode.MENSAJERIA_PRO,
        name: 'Mensajeria Pro',
        description: 'Reminders, review requests, bulk WhatsApp, and campaigns.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 120,
    },
    {
        productCode: PrismaProductCode.METRICAS,
        code: PrismaProductTierCode.METRICAS_BASE,
        name: 'Metricas Base',
        description: 'Baseline analytics preserved for legacy bundle compatibility.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 130,
    },
    {
        productCode: PrismaProductCode.METRICAS,
        code: PrismaProductTierCode.METRICAS_PRO,
        name: 'Metricas Pro',
        description: 'Operational, review, and group analytics.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 140,
    },
    {
        productCode: PrismaProductCode.MARKETPLACE,
        code: PrismaProductTierCode.MARKETPLACE_PLUS,
        name: 'Marketplace Plus',
        description: 'Premium marketplace visibility and related promotional benefits.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 150,
    },
];

const PRODUCT_TIER_RUNTIME_DEFINITIONS: ProductTierRuntimeDefinition[] = [
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.RESERVAS_BASE)!,
        includedCapabilities: [PrismaProductCapabilityCode.RESERVAS_BASE],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.RESERVAS_PRO)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.RESERVAS_BASE,
            PrismaProductCapabilityCode.RESERVAS_PRO,
            PrismaProductCapabilityCode.RESERVAS_SERVICE_PROMOTIONS,
        ],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.EVENTOS_BASE)!,
        includedCapabilities: [PrismaProductCapabilityCode.EVENTOS_BASE],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.EVENTOS_PRO)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.EVENTOS_BASE,
            PrismaProductCapabilityCode.EVENTOS_PRO,
        ],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.CLASES_BASE)!,
        includedCapabilities: [PrismaProductCapabilityCode.CLASES_BASE],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.CLASES_PRO)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.CLASES_BASE,
            PrismaProductCapabilityCode.CLASES_PRO,
        ],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.STORES_BASE)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.COMMERCE_ACCESS,
            PrismaProductCapabilityCode.COMMERCE_PRODUCTS,
            PrismaProductCapabilityCode.COMMERCE_CATEGORIES,
            PrismaProductCapabilityCode.COMMERCE_STOCK,
            PrismaProductCapabilityCode.COMMERCE_ORDERS,
            PrismaProductCapabilityCode.COMMERCE_PICKUP,
            PrismaProductCapabilityCode.COMMERCE_DELIVERY,
            PrismaProductCapabilityCode.COMMERCE_COMBOS,
        ],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.STORES_PRO)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.COMMERCE_ACCESS,
            PrismaProductCapabilityCode.COMMERCE_PRODUCTS,
            PrismaProductCapabilityCode.COMMERCE_CATEGORIES,
            PrismaProductCapabilityCode.COMMERCE_STOCK,
            PrismaProductCapabilityCode.COMMERCE_ORDERS,
            PrismaProductCapabilityCode.COMMERCE_PICKUP,
            PrismaProductCapabilityCode.COMMERCE_DELIVERY,
            PrismaProductCapabilityCode.COMMERCE_COMBOS,
            PrismaProductCapabilityCode.COMMERCE_SCHEDULED_ORDERS,
            PrismaProductCapabilityCode.COMMERCE_PROMOTIONS,
            PrismaProductCapabilityCode.COMMERCE_STAFF_ASSIGNMENT,
            PrismaProductCapabilityCode.COMMERCE_METRICS,
        ],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.PERSONALIZACION_BASE)!,
        includedCapabilities: [PrismaProductCapabilityCode.PERSONALIZACION_BASE],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.PERSONALIZACION_PLUS)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.PERSONALIZACION_BASE,
            PrismaProductCapabilityCode.PERSONALIZACION_PLUS,
            PrismaProductCapabilityCode.STOREFRONT_ADVANCED_CTA,
            PrismaProductCapabilityCode.STOREFRONT_SECTION_ORDER,
            PrismaProductCapabilityCode.STOREFRONT_FOOTER_CUSTOMIZATION,
            PrismaProductCapabilityCode.STOREFRONT_ANNOUNCEMENT_BANNERS,
        ],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.CRM_BASE)!,
        includedCapabilities: [PrismaProductCapabilityCode.CRM_BASE],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.CRM_PRO)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.CRM_BASE,
            PrismaProductCapabilityCode.CRM_PRO,
            PrismaProductCapabilityCode.CRM_IMPORT_EXPORT,
            PrismaProductCapabilityCode.CRM_SEGMENTATION,
            PrismaProductCapabilityCode.CRM_REACTIVATION,
        ],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.MENSAJERIA_BASE)!,
        includedCapabilities: [PrismaProductCapabilityCode.MENSAJERIA_BASE],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.MENSAJERIA_PRO)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.MENSAJERIA_BASE,
            PrismaProductCapabilityCode.MENSAJERIA_PRO,
            PrismaProductCapabilityCode.MENSAJERIA_REMINDERS,
            PrismaProductCapabilityCode.MENSAJERIA_BULK_WHATSAPP,
            PrismaProductCapabilityCode.MENSAJERIA_REVIEW_REQUESTS,
            PrismaProductCapabilityCode.MENSAJERIA_CAMPAIGNS,
        ],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.METRICAS_BASE)!,
        includedCapabilities: [PrismaProductCapabilityCode.METRICAS_BASE],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.METRICAS_PRO)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.METRICAS_BASE,
            PrismaProductCapabilityCode.METRICAS_PRO,
            PrismaProductCapabilityCode.METRICAS_OPERATIONAL_DASHBOARD,
            PrismaProductCapabilityCode.METRICAS_GROUP_ANALYTICS,
            PrismaProductCapabilityCode.METRICAS_REVIEW_ANALYTICS,
        ],
    },
    {
        ...PRODUCT_TIER_SEED.find((tier) => tier.code === PrismaProductTierCode.MARKETPLACE_PLUS)!,
        includedCapabilities: [
            PrismaProductCapabilityCode.MARKETPLACE_LISTING,
            PrismaProductCapabilityCode.MARKETPLACE_PLUS,
        ],
    },
];

export const PRODUCT_TIER_CAPABILITY_SEED = PRODUCT_TIER_RUNTIME_DEFINITIONS.flatMap((tier) =>
    tier.includedCapabilities.map((capability) => ({
        productTierCode: tier.code,
        capability,
    })),
);

const PRODUCT_CATALOG_BY_CODE = new Map(PRODUCT_CATALOG_SEED.map((product) => [product.code, product]));
const PRODUCT_TIER_BY_CODE = new Map(
    PRODUCT_TIER_RUNTIME_DEFINITIONS.map((tier) => [tier.code, tier]),
);

// These base add-ons reflect bundled baseline access in the legacy plans.
const LEGACY_INCLUDED_BY_DEFAULT_TIER_CODES = new Set<ProductTierCode>([
    PrismaProductTierCode.CRM_BASE,
    PrismaProductTierCode.PERSONALIZACION_BASE,
    PrismaProductTierCode.MENSAJERIA_BASE,
]);

export const CORE_PRODUCT_CODES: ProductCode[] = PRODUCT_CATALOG_SEED.filter(
    (product) => product.isCoreProduct,
).map((product) => product.code);

export const LEGACY_PLAN_BASE_PRODUCT_TIERS: Record<ShopPlan, ProductTierCode[]> = {
    STARTER: [
        PrismaProductTierCode.RESERVAS_BASE,
        PrismaProductTierCode.CRM_BASE,
        PrismaProductTierCode.PERSONALIZACION_BASE,
        PrismaProductTierCode.MENSAJERIA_BASE,
    ],
    BUSINESS: [
        PrismaProductTierCode.RESERVAS_PRO,
        PrismaProductTierCode.EVENTOS_BASE,
        PrismaProductTierCode.CRM_BASE,
        PrismaProductTierCode.MENSAJERIA_BASE,
        PrismaProductTierCode.METRICAS_BASE,
        PrismaProductTierCode.PERSONALIZACION_BASE,
    ],
    PRO: [
        PrismaProductTierCode.RESERVAS_PRO,
        PrismaProductTierCode.EVENTOS_PRO,
        PrismaProductTierCode.CLASES_PRO,
        PrismaProductTierCode.CRM_PRO,
        PrismaProductTierCode.MENSAJERIA_PRO,
        PrismaProductTierCode.PERSONALIZACION_PLUS,
        PrismaProductTierCode.METRICAS_PRO,
    ],
};

export const LEGACY_PLAN_EXTRA_CAPABILITIES: Record<ShopPlan, ProductCapability[]> = {
    STARTER: [],
    BUSINESS: [
        PrismaProductCapabilityCode.METRICAS_OPERATIONAL_DASHBOARD,
        PrismaProductCapabilityCode.METRICAS_REVIEW_ANALYTICS,
        PrismaProductCapabilityCode.STOREFRONT_SECTION_ORDER,
        PrismaProductCapabilityCode.STOREFRONT_FOOTER_CUSTOMIZATION,
    ],
    PRO: [],
};

export const LEGACY_FEATURE_REQUIREMENTS: Record<PlanFeatureKey, CapabilityRequirement> = {
    ROLES_PERMISSIONS: {
        anyOf: [
            PrismaProductCapabilityCode.RESERVAS_BASE,
            PrismaProductCapabilityCode.EVENTOS_BASE,
            PrismaProductCapabilityCode.CLASES_BASE,
            PrismaProductCapabilityCode.COMMERCE_ACCESS,
        ],
    },
    STAFF_AVAILABILITY: {
        allOf: [PrismaProductCapabilityCode.RESERVAS_PRO],
    },
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: {
        allOf: [PrismaProductCapabilityCode.MENSAJERIA_BASE],
        anyOf: [
            PrismaProductCapabilityCode.RESERVAS_BASE,
            PrismaProductCapabilityCode.EVENTOS_BASE,
            PrismaProductCapabilityCode.CLASES_BASE,
        ],
    },
    BOOKING_REMINDERS: {
        allOf: [
            PrismaProductCapabilityCode.RESERVAS_PRO,
            PrismaProductCapabilityCode.MENSAJERIA_REMINDERS,
        ],
    },
    CUSTOMER_IMPORT_EXPORT: {
        allOf: [PrismaProductCapabilityCode.CRM_IMPORT_EXPORT],
    },
    OPERATIONAL_DASHBOARD: {
        allOf: [PrismaProductCapabilityCode.METRICAS_OPERATIONAL_DASHBOARD],
    },
    REVIEW_MANAGEMENT: {
        anyOf: [
            PrismaProductCapabilityCode.RESERVAS_BASE,
            PrismaProductCapabilityCode.EVENTOS_BASE,
            PrismaProductCapabilityCode.CLASES_BASE,
        ],
    },
    REVIEW_ANALYTICS: {
        allOf: [PrismaProductCapabilityCode.METRICAS_REVIEW_ANALYTICS],
    },
    REVIEW_REQUEST_REMINDERS: {
        allOf: [PrismaProductCapabilityCode.MENSAJERIA_REVIEW_REQUESTS],
    },
    REVIEW_REQUEST_EMAIL: {
        allOf: [PrismaProductCapabilityCode.MENSAJERIA_REVIEW_REQUESTS],
    },
    REVIEW_REQUEST_WHATSAPP: {
        allOf: [PrismaProductCapabilityCode.MENSAJERIA_REVIEW_REQUESTS],
    },
    BOOKING_FLOW_CUSTOMIZATION: {
        allOf: [PrismaProductCapabilityCode.RESERVAS_PRO],
    },
    HOME_CTA_CUSTOMIZATION: {
        allOf: [PrismaProductCapabilityCode.STOREFRONT_ADVANCED_CTA],
    },
    HOME_SECTION_ORDER: {
        allOf: [PrismaProductCapabilityCode.STOREFRONT_SECTION_ORDER],
    },
    FOOTER_CUSTOMIZATION: {
        allOf: [PrismaProductCapabilityCode.STOREFRONT_FOOTER_CUSTOMIZATION],
    },
    ANNOUNCEMENT_BANNERS: {
        allOf: [PrismaProductCapabilityCode.STOREFRONT_ANNOUNCEMENT_BANNERS],
    },
    BULK_WHATSAPP_MESSAGING: {
        allOf: [PrismaProductCapabilityCode.MENSAJERIA_BULK_WHATSAPP],
    },
    BULK_EMAIL_CAMPAIGNS: {
        allOf: [PrismaProductCapabilityCode.MENSAJERIA_CAMPAIGNS],
    },
    OUTREACH_REACTIVATION_TOOLS: {
        allOf: [
            PrismaProductCapabilityCode.CRM_REACTIVATION,
            PrismaProductCapabilityCode.MENSAJERIA_PRO,
        ],
    },
    GROUP_EVENTS: {
        allOf: [PrismaProductCapabilityCode.EVENTOS_BASE],
    },
    GROUP_CLASSES: {
        allOf: [PrismaProductCapabilityCode.CLASES_BASE],
    },
    GROUP_ADVANCED: {
        anyOf: [
            PrismaProductCapabilityCode.EVENTOS_PRO,
            PrismaProductCapabilityCode.CLASES_PRO,
        ],
    },
};

export function getDefaultProductCapabilities(): Record<ProductCapability, boolean> {
    return PRODUCT_CAPABILITY_CODES.reduce(
        (acc, capability) => {
            acc[capability] = false;
            return acc;
        },
        {} as Record<ProductCapability, boolean>,
    );
}

export function isCoreProductCode(productCode: ProductCode): boolean {
    return CORE_PRODUCT_CODES.includes(productCode);
}

export function isCoreTierCode(tierCode: ProductTierCode): boolean {
    const tier = getProductTierDefinition(tierCode);
    return getProductCatalogDefinition(tier.productCode).isCoreProduct;
}

export function getProductCatalogDefinition(productCode: ProductCode): ProductCatalogSeedDefinition {
    const definition = PRODUCT_CATALOG_BY_CODE.get(productCode);

    if (!definition) {
        throw new Error(`Missing product catalog definition for ${productCode}`);
    }

    return definition;
}

export function getProductTierDefinition(tierCode: ProductTierCode): ProductTierRuntimeDefinition {
    const definition = PRODUCT_TIER_BY_CODE.get(tierCode);

    if (!definition) {
        throw new Error(`Missing product tier definition for ${tierCode}`);
    }

    return definition;
}

export function buildEffectiveProductsFromTiers(
    tierCodes: ProductTierCode[],
    options?: {
        includedByDefaultTierCodes?: Set<ProductTierCode>;
        includedByDefault?: boolean;
        status?: CompanyProductSubscriptionStatus;
    },
): EffectiveCompanyProduct[] {
    const status = options?.status ?? PrismaCompanyProductSubscriptionStatus.ACTIVE;
    const includedByDefaultTierCodes =
        options?.includedByDefaultTierCodes ?? LEGACY_INCLUDED_BY_DEFAULT_TIER_CODES;
    const productMap = new Map<ProductCode, EffectiveCompanyProduct>();

    for (const tierCode of tierCodes) {
        const tier = getProductTierDefinition(tierCode);
        const product = getProductCatalogDefinition(tier.productCode);

        productMap.set(product.code, {
            productCode: product.code,
            tierCode: tier.code,
            status,
            isCore: product.isCoreProduct,
            includedByDefault:
                options?.includedByDefault ?? includedByDefaultTierCodes.has(tier.code),
        });
    }

    return Array.from(productMap.values()).sort((left, right) => {
        if (left.isCore !== right.isCore) return left.isCore ? -1 : 1;
        return left.productCode.localeCompare(right.productCode);
    });
}

export function buildProductCapabilitiesFromTierCodes(
    tierCodes: ProductTierCode[],
    extraCapabilities: ProductCapability[] = [],
): Record<ProductCapability, boolean> {
    const capabilities = getDefaultProductCapabilities();

    for (const tierCode of tierCodes) {
        const definition = getProductTierDefinition(tierCode);
        for (const capability of definition.includedCapabilities) {
            capabilities[capability] = true;
        }
    }

    for (const capability of extraCapabilities) {
        capabilities[capability] = true;
    }

    return capabilities;
}

export function buildProductCapabilitiesFromCapabilityList(
    capabilityList: Iterable<ProductCapability>,
): Record<ProductCapability, boolean> {
    const capabilities = getDefaultProductCapabilities();

    for (const capability of capabilityList) {
        capabilities[capability] = true;
    }

    return capabilities;
}

export function getEnabledProductCapabilities(
    productCapabilities: Record<ProductCapability, boolean>,
): Set<ProductCapability> {
    return new Set(
        PRODUCT_CAPABILITY_CODES.filter((capability) => productCapabilities[capability] === true),
    );
}

export function satisfiesCapabilityRequirement(
    enabledCapabilities: Set<ProductCapability>,
    requirement: CapabilityRequirement,
): boolean {
    const allOfSatisfied = (requirement.allOf ?? []).every((capability) =>
        enabledCapabilities.has(capability),
    );
    const anyOf = requirement.anyOf ?? [];
    const anyOfSatisfied =
        anyOf.length === 0 || anyOf.some((capability) => enabledCapabilities.has(capability));

    return allOfSatisfied && anyOfSatisfied;
}

export function resolveLegacyFeatureFromCapabilities(
    feature: PlanFeatureKey,
    productCapabilities: Record<ProductCapability, boolean>,
): boolean {
    return satisfiesCapabilityRequirement(
        getEnabledProductCapabilities(productCapabilities),
        LEGACY_FEATURE_REQUIREMENTS[feature],
    );
}
