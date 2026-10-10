"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_FEATURE_REQUIREMENTS = exports.LEGACY_PLAN_EXTRA_CAPABILITIES = exports.LEGACY_PLAN_BASE_PRODUCT_TIERS = exports.CORE_PRODUCT_CODES = exports.PRODUCT_TIER_CAPABILITY_SEED = exports.PRODUCT_TIER_SEED = exports.PRODUCT_CATALOG_SEED = exports.PRODUCT_CAPABILITY_CODES = void 0;
exports.isIncludedByDefaultTierCode = isIncludedByDefaultTierCode;
exports.getDefaultProductCapabilities = getDefaultProductCapabilities;
exports.isCoreProductCode = isCoreProductCode;
exports.isCoreTierCode = isCoreTierCode;
exports.getProductCatalogDefinition = getProductCatalogDefinition;
exports.getProductTierDefinition = getProductTierDefinition;
exports.buildEffectiveProductsFromTiers = buildEffectiveProductsFromTiers;
exports.buildProductCapabilitiesFromTierCodes = buildProductCapabilitiesFromTierCodes;
exports.buildProductCapabilitiesFromCapabilityList = buildProductCapabilitiesFromCapabilityList;
exports.getEnabledProductCapabilities = getEnabledProductCapabilities;
exports.satisfiesCapabilityRequirement = satisfiesCapabilityRequirement;
exports.resolveLegacyFeatureFromCapabilities = resolveLegacyFeatureFromCapabilities;
const client_1 = require("@prisma/client");
exports.PRODUCT_CAPABILITY_CODES = Object.values(client_1.ProductCapabilityCode);
exports.PRODUCT_CATALOG_SEED = [
    {
        code: client_1.ProductCode.RESERVAS,
        name: 'Reservas',
        description: '1:1 bookings, services, staff availability, and appointment operations.',
        category: 'CORE_PRODUCT',
        isCoreProduct: true,
        isAddon: false,
        isActive: true,
        sortOrder: 10,
    },
    {
        code: client_1.ProductCode.EVENTOS,
        name: 'Eventos',
        description: 'One-time group events, paid registrations, and free registrations.',
        category: 'CORE_PRODUCT',
        isCoreProduct: true,
        isAddon: false,
        isActive: true,
        sortOrder: 20,
    },
    {
        code: client_1.ProductCode.CLASES,
        name: 'Clases',
        description: 'Recurring classes, sessions, enrollments, and attendance management.',
        category: 'CORE_PRODUCT',
        isCoreProduct: true,
        isAddon: false,
        isActive: true,
        sortOrder: 30,
    },
    {
        code: client_1.ProductCode.STORES,
        name: 'Stores',
        description: 'Commerce storefronts, catalog, stock, orders, and fulfillment workflows.',
        category: 'CORE_PRODUCT',
        isCoreProduct: true,
        isAddon: false,
        isActive: true,
        sortOrder: 35,
    },
    {
        code: client_1.ProductCode.RESTAURANTE,
        name: 'Restaurante',
        description: 'Table reservations, dining areas, service periods, and digital menus.',
        category: 'CORE_PRODUCT',
        isCoreProduct: true,
        isAddon: false,
        isActive: true,
        sortOrder: 37,
    },
    {
        code: client_1.ProductCode.PERSONALIZACION,
        name: 'Personalizacion',
        description: 'Storefront branding and layout controls.',
        category: 'ADDON',
        isCoreProduct: false,
        isAddon: true,
        isActive: true,
        sortOrder: 40,
    },
    {
        code: client_1.ProductCode.CRM,
        name: 'CRM',
        description: 'Customer relationship management, segmentation, and lifecycle tools.',
        category: 'ADDON',
        isCoreProduct: false,
        isAddon: true,
        isActive: true,
        sortOrder: 50,
    },
    {
        code: client_1.ProductCode.MENSAJERIA,
        name: 'Mensajeria',
        description: 'Transactional notifications, reminders, campaigns, and review requests.',
        category: 'ADDON',
        isCoreProduct: false,
        isAddon: true,
        isActive: true,
        sortOrder: 60,
    },
    {
        code: client_1.ProductCode.METRICAS,
        name: 'Metricas',
        description: 'Operational dashboards and analytics.',
        category: 'ADDON',
        isCoreProduct: false,
        isAddon: true,
        isActive: true,
        sortOrder: 70,
    },
    {
        code: client_1.ProductCode.MARKETPLACE,
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
exports.PRODUCT_TIER_SEED = [
    {
        productCode: client_1.ProductCode.RESERVAS,
        code: client_1.ProductTierCode.RESERVAS_BASE,
        name: 'Reservas Base',
        description: 'Public booking, services, staff selection, and core appointment management.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 10,
    },
    {
        productCode: client_1.ProductCode.RESERVAS,
        code: client_1.ProductTierCode.RESERVAS_PRO,
        name: 'Reservas Pro',
        description: 'Advanced booking controls, staff availability, reminders, and admin tooling.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 20,
    },
    {
        productCode: client_1.ProductCode.EVENTOS,
        code: client_1.ProductTierCode.EVENTOS_BASE,
        name: 'Eventos Base',
        description: 'Paid and free event registration, capacity, and attendee management.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 30,
    },
    {
        productCode: client_1.ProductCode.EVENTOS,
        code: client_1.ProductTierCode.EVENTOS_PRO,
        name: 'Eventos Pro',
        description: 'Advanced event operations, ticketing, and higher-touch attendee workflows.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 40,
    },
    {
        productCode: client_1.ProductCode.CLASES,
        code: client_1.ProductTierCode.CLASES_BASE,
        name: 'Clases Base',
        description: 'Recurring classes, enrollments, and session scheduling.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 50,
    },
    {
        productCode: client_1.ProductCode.CLASES,
        code: client_1.ProductTierCode.CLASES_PRO,
        name: 'Clases Pro',
        description: 'Advanced class lifecycle workflows, attendance, and course operations.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 60,
    },
    {
        productCode: client_1.ProductCode.STORES,
        code: client_1.ProductTierCode.STORES_BASE,
        name: 'Stores Base',
        description: 'Catalog, stock, guest checkout, pickup, delivery, and basic order management.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 65,
    },
    {
        productCode: client_1.ProductCode.STORES,
        code: client_1.ProductTierCode.STORES_PRO,
        name: 'Stores Pro',
        description: 'Scheduled orders, staff assignment, promotions, and advanced store operations.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 68,
    },
    {
        productCode: client_1.ProductCode.RESTAURANTE,
        code: client_1.ProductTierCode.RESTAURANTE_PRO,
        name: 'Restaurante Pro',
        description: 'Table reservations, dining areas, service periods, daily operations, and digital menus.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 69,
    },
    {
        productCode: client_1.ProductCode.PERSONALIZACION,
        code: client_1.ProductTierCode.PERSONALIZACION_BASE,
        name: 'Personalizacion Base',
        description: 'Baseline storefront customization preserved for legacy bundle compatibility.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 70,
    },
    {
        productCode: client_1.ProductCode.PERSONALIZACION,
        code: client_1.ProductTierCode.PERSONALIZACION_PLUS,
        name: 'Personalizacion Plus',
        description: 'Advanced storefront CTA, layout, footer, and banner customization.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 80,
    },
    {
        productCode: client_1.ProductCode.CRM,
        code: client_1.ProductTierCode.CRM_BASE,
        name: 'CRM Base',
        description: 'Baseline CRM access preserved for legacy bundle compatibility.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 90,
    },
    {
        productCode: client_1.ProductCode.CRM,
        code: client_1.ProductTierCode.CRM_PRO,
        name: 'CRM Pro',
        description: 'Advanced CRM segmentation, import/export, and reactivation tooling.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 100,
    },
    {
        productCode: client_1.ProductCode.MENSAJERIA,
        code: client_1.ProductTierCode.MENSAJERIA_BASE,
        name: 'Mensajeria Base',
        description: 'Baseline transactional messaging preserved for legacy bundle compatibility.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 110,
    },
    {
        productCode: client_1.ProductCode.MENSAJERIA,
        code: client_1.ProductTierCode.MENSAJERIA_PRO,
        name: 'Mensajeria Pro',
        description: 'Reminders, review requests, bulk WhatsApp, and campaigns.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 120,
    },
    {
        productCode: client_1.ProductCode.METRICAS,
        code: client_1.ProductTierCode.METRICAS_BASE,
        name: 'Metricas Base',
        description: 'Baseline analytics preserved for legacy bundle compatibility.',
        tierLevel: 1,
        isBase: true,
        isPro: false,
        isActive: true,
        sortOrder: 130,
    },
    {
        productCode: client_1.ProductCode.METRICAS,
        code: client_1.ProductTierCode.METRICAS_PRO,
        name: 'Metricas Pro',
        description: 'Operational, review, and group analytics.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 140,
    },
    {
        productCode: client_1.ProductCode.MARKETPLACE,
        code: client_1.ProductTierCode.MARKETPLACE_PLUS,
        name: 'Marketplace Plus',
        description: 'Premium marketplace visibility and related promotional benefits.',
        tierLevel: 2,
        isBase: false,
        isPro: true,
        isActive: true,
        sortOrder: 150,
    },
];
const PRODUCT_TIER_RUNTIME_DEFINITIONS = [
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.RESERVAS_BASE),
        includedCapabilities: [client_1.ProductCapabilityCode.RESERVAS_BASE],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.RESERVAS_PRO),
        includedCapabilities: [
            client_1.ProductCapabilityCode.RESERVAS_BASE,
            client_1.ProductCapabilityCode.RESERVAS_PRO,
            client_1.ProductCapabilityCode.RESERVAS_SERVICE_PROMOTIONS,
        ],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.EVENTOS_BASE),
        includedCapabilities: [client_1.ProductCapabilityCode.EVENTOS_BASE],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.EVENTOS_PRO),
        includedCapabilities: [
            client_1.ProductCapabilityCode.EVENTOS_BASE,
            client_1.ProductCapabilityCode.EVENTOS_PRO,
        ],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.CLASES_BASE),
        includedCapabilities: [client_1.ProductCapabilityCode.CLASES_BASE],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.CLASES_PRO),
        includedCapabilities: [
            client_1.ProductCapabilityCode.CLASES_BASE,
            client_1.ProductCapabilityCode.CLASES_PRO,
        ],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.STORES_BASE),
        includedCapabilities: [
            client_1.ProductCapabilityCode.COMMERCE_ACCESS,
            client_1.ProductCapabilityCode.COMMERCE_PRODUCTS,
            client_1.ProductCapabilityCode.COMMERCE_CATEGORIES,
            client_1.ProductCapabilityCode.COMMERCE_STOCK,
            client_1.ProductCapabilityCode.COMMERCE_ORDERS,
            client_1.ProductCapabilityCode.COMMERCE_PICKUP,
            client_1.ProductCapabilityCode.COMMERCE_DELIVERY,
            client_1.ProductCapabilityCode.COMMERCE_COMBOS,
        ],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.STORES_PRO),
        includedCapabilities: [
            client_1.ProductCapabilityCode.COMMERCE_ACCESS,
            client_1.ProductCapabilityCode.COMMERCE_PRODUCTS,
            client_1.ProductCapabilityCode.COMMERCE_CATEGORIES,
            client_1.ProductCapabilityCode.COMMERCE_STOCK,
            client_1.ProductCapabilityCode.COMMERCE_ORDERS,
            client_1.ProductCapabilityCode.COMMERCE_PICKUP,
            client_1.ProductCapabilityCode.COMMERCE_DELIVERY,
            client_1.ProductCapabilityCode.COMMERCE_COMBOS,
            client_1.ProductCapabilityCode.COMMERCE_SCHEDULED_ORDERS,
            client_1.ProductCapabilityCode.COMMERCE_PROMOTIONS,
            client_1.ProductCapabilityCode.COMMERCE_STAFF_ASSIGNMENT,
            client_1.ProductCapabilityCode.COMMERCE_METRICS,
        ],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.RESTAURANTE_PRO),
        includedCapabilities: [client_1.ProductCapabilityCode.RESTAURANT_MODULE],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.PERSONALIZACION_BASE),
        includedCapabilities: [client_1.ProductCapabilityCode.PERSONALIZACION_BASE],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.PERSONALIZACION_PLUS),
        includedCapabilities: [
            client_1.ProductCapabilityCode.PERSONALIZACION_BASE,
            client_1.ProductCapabilityCode.PERSONALIZACION_PLUS,
            client_1.ProductCapabilityCode.STOREFRONT_ADVANCED_CTA,
            client_1.ProductCapabilityCode.STOREFRONT_SECTION_ORDER,
            client_1.ProductCapabilityCode.STOREFRONT_FOOTER_CUSTOMIZATION,
            client_1.ProductCapabilityCode.STOREFRONT_ANNOUNCEMENT_BANNERS,
        ],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.CRM_BASE),
        includedCapabilities: [client_1.ProductCapabilityCode.CRM_BASE],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.CRM_PRO),
        includedCapabilities: [
            client_1.ProductCapabilityCode.CRM_BASE,
            client_1.ProductCapabilityCode.CRM_PRO,
            client_1.ProductCapabilityCode.CRM_IMPORT_EXPORT,
            client_1.ProductCapabilityCode.CRM_SEGMENTATION,
            client_1.ProductCapabilityCode.CRM_REACTIVATION,
        ],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.MENSAJERIA_BASE),
        includedCapabilities: [client_1.ProductCapabilityCode.MENSAJERIA_BASE],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.MENSAJERIA_PRO),
        includedCapabilities: [
            client_1.ProductCapabilityCode.MENSAJERIA_BASE,
            client_1.ProductCapabilityCode.MENSAJERIA_PRO,
            client_1.ProductCapabilityCode.MENSAJERIA_REMINDERS,
            client_1.ProductCapabilityCode.MENSAJERIA_BULK_WHATSAPP,
            client_1.ProductCapabilityCode.MENSAJERIA_REVIEW_REQUESTS,
            client_1.ProductCapabilityCode.MENSAJERIA_CAMPAIGNS,
        ],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.METRICAS_BASE),
        includedCapabilities: [client_1.ProductCapabilityCode.METRICAS_BASE],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.METRICAS_PRO),
        includedCapabilities: [
            client_1.ProductCapabilityCode.METRICAS_BASE,
            client_1.ProductCapabilityCode.METRICAS_PRO,
            client_1.ProductCapabilityCode.METRICAS_OPERATIONAL_DASHBOARD,
            client_1.ProductCapabilityCode.METRICAS_GROUP_ANALYTICS,
            client_1.ProductCapabilityCode.METRICAS_REVIEW_ANALYTICS,
        ],
    },
    {
        ...exports.PRODUCT_TIER_SEED.find((tier) => tier.code === client_1.ProductTierCode.MARKETPLACE_PLUS),
        includedCapabilities: [
            client_1.ProductCapabilityCode.MARKETPLACE_LISTING,
            client_1.ProductCapabilityCode.MARKETPLACE_PLUS,
        ],
    },
];
exports.PRODUCT_TIER_CAPABILITY_SEED = PRODUCT_TIER_RUNTIME_DEFINITIONS.flatMap((tier) => tier.includedCapabilities.map((capability) => ({
    productTierCode: tier.code,
    capability,
})));
const PRODUCT_CATALOG_BY_CODE = new Map(exports.PRODUCT_CATALOG_SEED.map((product) => [product.code, product]));
const PRODUCT_TIER_BY_CODE = new Map(PRODUCT_TIER_RUNTIME_DEFINITIONS.map((tier) => [tier.code, tier]));
// These base add-ons reflect bundled baseline access in the legacy plans.
const LEGACY_INCLUDED_BY_DEFAULT_TIER_CODES = new Set([
    client_1.ProductTierCode.CRM_BASE,
    client_1.ProductTierCode.PERSONALIZACION_BASE,
    client_1.ProductTierCode.MENSAJERIA_BASE,
]);
function isIncludedByDefaultTierCode(tierCode) {
    return LEGACY_INCLUDED_BY_DEFAULT_TIER_CODES.has(tierCode);
}
exports.CORE_PRODUCT_CODES = exports.PRODUCT_CATALOG_SEED.filter((product) => product.isCoreProduct).map((product) => product.code);
exports.LEGACY_PLAN_BASE_PRODUCT_TIERS = {
    STARTER: [
        client_1.ProductTierCode.RESERVAS_BASE,
        client_1.ProductTierCode.CRM_BASE,
        client_1.ProductTierCode.PERSONALIZACION_BASE,
        client_1.ProductTierCode.MENSAJERIA_BASE,
    ],
    BUSINESS: [
        client_1.ProductTierCode.RESERVAS_PRO,
        client_1.ProductTierCode.EVENTOS_BASE,
        client_1.ProductTierCode.CRM_BASE,
        client_1.ProductTierCode.MENSAJERIA_BASE,
        client_1.ProductTierCode.METRICAS_BASE,
        client_1.ProductTierCode.PERSONALIZACION_BASE,
    ],
    PRO: [
        client_1.ProductTierCode.RESERVAS_PRO,
        client_1.ProductTierCode.EVENTOS_PRO,
        client_1.ProductTierCode.CLASES_PRO,
        client_1.ProductTierCode.CRM_PRO,
        client_1.ProductTierCode.MENSAJERIA_PRO,
        client_1.ProductTierCode.PERSONALIZACION_PLUS,
        client_1.ProductTierCode.METRICAS_PRO,
    ],
};
exports.LEGACY_PLAN_EXTRA_CAPABILITIES = {
    STARTER: [],
    BUSINESS: [
        client_1.ProductCapabilityCode.METRICAS_OPERATIONAL_DASHBOARD,
        client_1.ProductCapabilityCode.METRICAS_REVIEW_ANALYTICS,
        client_1.ProductCapabilityCode.STOREFRONT_SECTION_ORDER,
        client_1.ProductCapabilityCode.STOREFRONT_FOOTER_CUSTOMIZATION,
    ],
    PRO: [],
};
exports.LEGACY_FEATURE_REQUIREMENTS = {
    RESTAURANT_MODULE: {
        allOf: [client_1.ProductCapabilityCode.RESTAURANT_MODULE],
    },
    ROLES_PERMISSIONS: {
        anyOf: [
            client_1.ProductCapabilityCode.RESERVAS_BASE,
            client_1.ProductCapabilityCode.EVENTOS_BASE,
            client_1.ProductCapabilityCode.CLASES_BASE,
            client_1.ProductCapabilityCode.COMMERCE_ACCESS,
        ],
    },
    STAFF_AVAILABILITY: {
        allOf: [client_1.ProductCapabilityCode.RESERVAS_PRO],
    },
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: {
        allOf: [client_1.ProductCapabilityCode.MENSAJERIA_BASE],
        anyOf: [
            client_1.ProductCapabilityCode.RESERVAS_BASE,
            client_1.ProductCapabilityCode.EVENTOS_BASE,
            client_1.ProductCapabilityCode.CLASES_BASE,
        ],
    },
    BOOKING_REMINDERS: {
        allOf: [
            client_1.ProductCapabilityCode.RESERVAS_PRO,
            client_1.ProductCapabilityCode.MENSAJERIA_REMINDERS,
        ],
    },
    CUSTOMER_IMPORT_EXPORT: {
        allOf: [client_1.ProductCapabilityCode.CRM_IMPORT_EXPORT],
    },
    OPERATIONAL_DASHBOARD: {
        allOf: [client_1.ProductCapabilityCode.METRICAS_OPERATIONAL_DASHBOARD],
    },
    REVIEW_MANAGEMENT: {
        anyOf: [
            client_1.ProductCapabilityCode.RESERVAS_BASE,
            client_1.ProductCapabilityCode.EVENTOS_BASE,
            client_1.ProductCapabilityCode.CLASES_BASE,
        ],
    },
    REVIEW_ANALYTICS: {
        allOf: [client_1.ProductCapabilityCode.METRICAS_REVIEW_ANALYTICS],
    },
    REVIEW_REQUEST_REMINDERS: {
        allOf: [client_1.ProductCapabilityCode.MENSAJERIA_REVIEW_REQUESTS],
    },
    REVIEW_REQUEST_EMAIL: {
        allOf: [client_1.ProductCapabilityCode.MENSAJERIA_REVIEW_REQUESTS],
    },
    REVIEW_REQUEST_WHATSAPP: {
        allOf: [client_1.ProductCapabilityCode.MENSAJERIA_REVIEW_REQUESTS],
    },
    BOOKING_FLOW_CUSTOMIZATION: {
        allOf: [client_1.ProductCapabilityCode.RESERVAS_PRO],
    },
    HOME_CTA_CUSTOMIZATION: {
        allOf: [client_1.ProductCapabilityCode.STOREFRONT_ADVANCED_CTA],
    },
    HOME_SECTION_ORDER: {
        allOf: [client_1.ProductCapabilityCode.STOREFRONT_SECTION_ORDER],
    },
    FOOTER_CUSTOMIZATION: {
        allOf: [client_1.ProductCapabilityCode.STOREFRONT_FOOTER_CUSTOMIZATION],
    },
    ANNOUNCEMENT_BANNERS: {
        allOf: [client_1.ProductCapabilityCode.STOREFRONT_ANNOUNCEMENT_BANNERS],
    },
    BULK_WHATSAPP_MESSAGING: {
        allOf: [client_1.ProductCapabilityCode.MENSAJERIA_BULK_WHATSAPP],
    },
    BULK_EMAIL_CAMPAIGNS: {
        allOf: [client_1.ProductCapabilityCode.MENSAJERIA_CAMPAIGNS],
    },
    OUTREACH_REACTIVATION_TOOLS: {
        allOf: [
            client_1.ProductCapabilityCode.CRM_REACTIVATION,
            client_1.ProductCapabilityCode.MENSAJERIA_PRO,
        ],
    },
    GROUP_EVENTS: {
        allOf: [client_1.ProductCapabilityCode.EVENTOS_BASE],
    },
    GROUP_CLASSES: {
        allOf: [client_1.ProductCapabilityCode.CLASES_BASE],
    },
    GROUP_ADVANCED: {
        anyOf: [
            client_1.ProductCapabilityCode.EVENTOS_PRO,
            client_1.ProductCapabilityCode.CLASES_PRO,
        ],
    },
};
function getDefaultProductCapabilities() {
    return exports.PRODUCT_CAPABILITY_CODES.reduce((acc, capability) => {
        acc[capability] = false;
        return acc;
    }, {});
}
function isCoreProductCode(productCode) {
    return exports.CORE_PRODUCT_CODES.includes(productCode);
}
function isCoreTierCode(tierCode) {
    const tier = getProductTierDefinition(tierCode);
    return getProductCatalogDefinition(tier.productCode).isCoreProduct;
}
function getProductCatalogDefinition(productCode) {
    const definition = PRODUCT_CATALOG_BY_CODE.get(productCode);
    if (!definition) {
        throw new Error(`Missing product catalog definition for ${productCode}`);
    }
    return definition;
}
function getProductTierDefinition(tierCode) {
    const definition = PRODUCT_TIER_BY_CODE.get(tierCode);
    if (!definition) {
        throw new Error(`Missing product tier definition for ${tierCode}`);
    }
    return definition;
}
function buildEffectiveProductsFromTiers(tierCodes, options) {
    const status = options?.status ?? client_1.CompanyProductSubscriptionStatus.ACTIVE;
    const includedByDefaultTierCodes = options?.includedByDefaultTierCodes ?? LEGACY_INCLUDED_BY_DEFAULT_TIER_CODES;
    const productMap = new Map();
    for (const tierCode of tierCodes) {
        const tier = getProductTierDefinition(tierCode);
        const product = getProductCatalogDefinition(tier.productCode);
        productMap.set(product.code, {
            productCode: product.code,
            tierCode: tier.code,
            status,
            isCore: product.isCoreProduct,
            includedByDefault: options?.includedByDefault ?? includedByDefaultTierCodes.has(tier.code),
        });
    }
    return Array.from(productMap.values()).sort((left, right) => {
        if (left.isCore !== right.isCore)
            return left.isCore ? -1 : 1;
        return left.productCode.localeCompare(right.productCode);
    });
}
function buildProductCapabilitiesFromTierCodes(tierCodes, extraCapabilities = []) {
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
function buildProductCapabilitiesFromCapabilityList(capabilityList) {
    const capabilities = getDefaultProductCapabilities();
    for (const capability of capabilityList) {
        capabilities[capability] = true;
    }
    return capabilities;
}
function getEnabledProductCapabilities(productCapabilities) {
    return new Set(exports.PRODUCT_CAPABILITY_CODES.filter((capability) => productCapabilities[capability] === true));
}
function satisfiesCapabilityRequirement(enabledCapabilities, requirement) {
    const allOfSatisfied = (requirement.allOf ?? []).every((capability) => enabledCapabilities.has(capability));
    const anyOf = requirement.anyOf ?? [];
    const anyOfSatisfied = anyOf.length === 0 || anyOf.some((capability) => enabledCapabilities.has(capability));
    return allOfSatisfied && anyOfSatisfied;
}
function resolveLegacyFeatureFromCapabilities(feature, productCapabilities) {
    return satisfiesCapabilityRequirement(getEnabledProductCapabilities(productCapabilities), exports.LEGACY_FEATURE_REQUIREMENTS[feature]);
}
