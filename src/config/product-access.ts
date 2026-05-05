import { ProductCapabilityCode } from '@prisma/client';
import type { PlanFeatureKey } from './plan-capabilities';
import {
    getProductTierDefinition,
    type CompanyEntitlementPayload,
    type ProductCapability,
    type ProductCode,
    type ProductTierCode,
} from './product-entitlements';

type ProductAccessDefinition = {
    productCode: ProductCode;
    tierCode: ProductTierCode;
    capability: ProductCapability;
};

export type ProductAccessRecommendation = ProductAccessDefinition & {
    productName: string;
    tierName: string;
    requestLabel: string;
    ctaLabel: string;
    title: string;
    description: string;
    requiresLabel: string;
};

const PRODUCT_REQUEST_LABELS: Record<ProductTierCode, string> = {
    RESERVAS_BASE: 'Reservas',
    RESERVAS_PRO: 'Reservas Pro',
    EVENTOS_BASE: 'Eventos',
    EVENTOS_PRO: 'Eventos Pro',
    CLASES_BASE: 'Clases',
    CLASES_PRO: 'Clases Pro',
    STORES_BASE: 'Tienda',
    STORES_PRO: 'Tienda Pro',
    PERSONALIZACION_BASE: 'Personalización Base',
    PERSONALIZACION_PLUS: 'Personalización Pro',
    CRM_BASE: 'CRM',
    CRM_PRO: 'CRM Pro',
    MENSAJERIA_BASE: 'Mensajería Base',
    MENSAJERIA_PRO: 'Mensajería Pro',
    METRICAS_BASE: 'Métricas Base',
    METRICAS_PRO: 'Métricas',
    MARKETPLACE_PLUS: 'Marketplace Plus',
};

const CAPABILITY_PRODUCT_ACCESS: Record<ProductCapability, ProductAccessDefinition> = {
    RESERVAS_BASE: {
        productCode: 'RESERVAS',
        tierCode: 'RESERVAS_BASE',
        capability: 'RESERVAS_BASE',
    },
    RESERVAS_PRO: {
        productCode: 'RESERVAS',
        tierCode: 'RESERVAS_PRO',
        capability: 'RESERVAS_PRO',
    },
    RESERVAS_SERVICE_PROMOTIONS: {
        productCode: 'RESERVAS',
        tierCode: 'RESERVAS_PRO',
        capability: 'RESERVAS_SERVICE_PROMOTIONS',
    },
    EVENTOS_BASE: {
        productCode: 'EVENTOS',
        tierCode: 'EVENTOS_BASE',
        capability: 'EVENTOS_BASE',
    },
    EVENTOS_PRO: {
        productCode: 'EVENTOS',
        tierCode: 'EVENTOS_PRO',
        capability: 'EVENTOS_PRO',
    },
    CLASES_BASE: {
        productCode: 'CLASES',
        tierCode: 'CLASES_BASE',
        capability: 'CLASES_BASE',
    },
    CLASES_PRO: {
        productCode: 'CLASES',
        tierCode: 'CLASES_PRO',
        capability: 'CLASES_PRO',
    },
    COMMERCE_ACCESS: {
        productCode: 'STORES',
        tierCode: 'STORES_BASE',
        capability: 'COMMERCE_ACCESS',
    },
    COMMERCE_PRODUCTS: {
        productCode: 'STORES',
        tierCode: 'STORES_BASE',
        capability: 'COMMERCE_PRODUCTS',
    },
    COMMERCE_CATEGORIES: {
        productCode: 'STORES',
        tierCode: 'STORES_BASE',
        capability: 'COMMERCE_CATEGORIES',
    },
    COMMERCE_STOCK: {
        productCode: 'STORES',
        tierCode: 'STORES_BASE',
        capability: 'COMMERCE_STOCK',
    },
    COMMERCE_ORDERS: {
        productCode: 'STORES',
        tierCode: 'STORES_BASE',
        capability: 'COMMERCE_ORDERS',
    },
    COMMERCE_PICKUP: {
        productCode: 'STORES',
        tierCode: 'STORES_BASE',
        capability: 'COMMERCE_PICKUP',
    },
    COMMERCE_DELIVERY: {
        productCode: 'STORES',
        tierCode: 'STORES_BASE',
        capability: 'COMMERCE_DELIVERY',
    },
    COMMERCE_COMBOS: {
        productCode: 'STORES',
        tierCode: 'STORES_BASE',
        capability: 'COMMERCE_COMBOS',
    },
    COMMERCE_SCHEDULED_ORDERS: {
        productCode: 'STORES',
        tierCode: 'STORES_PRO',
        capability: 'COMMERCE_SCHEDULED_ORDERS',
    },
    COMMERCE_PROMOTIONS: {
        productCode: 'STORES',
        tierCode: 'STORES_PRO',
        capability: 'COMMERCE_PROMOTIONS',
    },
    COMMERCE_STAFF_ASSIGNMENT: {
        productCode: 'STORES',
        tierCode: 'STORES_PRO',
        capability: 'COMMERCE_STAFF_ASSIGNMENT',
    },
    COMMERCE_METRICS: {
        productCode: 'STORES',
        tierCode: 'STORES_PRO',
        capability: 'COMMERCE_METRICS',
    },
    CRM_BASE: {
        productCode: 'CRM',
        tierCode: 'CRM_BASE',
        capability: 'CRM_BASE',
    },
    CRM_PRO: {
        productCode: 'CRM',
        tierCode: 'CRM_PRO',
        capability: 'CRM_PRO',
    },
    CRM_IMPORT_EXPORT: {
        productCode: 'CRM',
        tierCode: 'CRM_PRO',
        capability: 'CRM_IMPORT_EXPORT',
    },
    CRM_SEGMENTATION: {
        productCode: 'CRM',
        tierCode: 'CRM_PRO',
        capability: 'CRM_SEGMENTATION',
    },
    CRM_REACTIVATION: {
        productCode: 'CRM',
        tierCode: 'CRM_PRO',
        capability: 'CRM_REACTIVATION',
    },
    MENSAJERIA_BASE: {
        productCode: 'MENSAJERIA',
        tierCode: 'MENSAJERIA_BASE',
        capability: 'MENSAJERIA_BASE',
    },
    MENSAJERIA_PRO: {
        productCode: 'MENSAJERIA',
        tierCode: 'MENSAJERIA_PRO',
        capability: 'MENSAJERIA_PRO',
    },
    MENSAJERIA_REMINDERS: {
        productCode: 'MENSAJERIA',
        tierCode: 'MENSAJERIA_PRO',
        capability: 'MENSAJERIA_REMINDERS',
    },
    MENSAJERIA_BULK_WHATSAPP: {
        productCode: 'MENSAJERIA',
        tierCode: 'MENSAJERIA_PRO',
        capability: 'MENSAJERIA_BULK_WHATSAPP',
    },
    MENSAJERIA_REVIEW_REQUESTS: {
        productCode: 'MENSAJERIA',
        tierCode: 'MENSAJERIA_PRO',
        capability: 'MENSAJERIA_REVIEW_REQUESTS',
    },
    MENSAJERIA_CAMPAIGNS: {
        productCode: 'MENSAJERIA',
        tierCode: 'MENSAJERIA_PRO',
        capability: 'MENSAJERIA_CAMPAIGNS',
    },
    PERSONALIZACION_BASE: {
        productCode: 'PERSONALIZACION',
        tierCode: 'PERSONALIZACION_BASE',
        capability: 'PERSONALIZACION_BASE',
    },
    PERSONALIZACION_PLUS: {
        productCode: 'PERSONALIZACION',
        tierCode: 'PERSONALIZACION_PLUS',
        capability: 'PERSONALIZACION_PLUS',
    },
    STOREFRONT_ADVANCED_CTA: {
        productCode: 'PERSONALIZACION',
        tierCode: 'PERSONALIZACION_PLUS',
        capability: 'STOREFRONT_ADVANCED_CTA',
    },
    STOREFRONT_SECTION_ORDER: {
        productCode: 'PERSONALIZACION',
        tierCode: 'PERSONALIZACION_PLUS',
        capability: 'STOREFRONT_SECTION_ORDER',
    },
    STOREFRONT_FOOTER_CUSTOMIZATION: {
        productCode: 'PERSONALIZACION',
        tierCode: 'PERSONALIZACION_PLUS',
        capability: 'STOREFRONT_FOOTER_CUSTOMIZATION',
    },
    STOREFRONT_ANNOUNCEMENT_BANNERS: {
        productCode: 'PERSONALIZACION',
        tierCode: 'PERSONALIZACION_PLUS',
        capability: 'STOREFRONT_ANNOUNCEMENT_BANNERS',
    },
    METRICAS_BASE: {
        productCode: 'METRICAS',
        tierCode: 'METRICAS_BASE',
        capability: 'METRICAS_BASE',
    },
    METRICAS_PRO: {
        productCode: 'METRICAS',
        tierCode: 'METRICAS_PRO',
        capability: 'METRICAS_PRO',
    },
    METRICAS_OPERATIONAL_DASHBOARD: {
        productCode: 'METRICAS',
        tierCode: 'METRICAS_PRO',
        capability: 'METRICAS_OPERATIONAL_DASHBOARD',
    },
    METRICAS_GROUP_ANALYTICS: {
        productCode: 'METRICAS',
        tierCode: 'METRICAS_PRO',
        capability: 'METRICAS_GROUP_ANALYTICS',
    },
    METRICAS_REVIEW_ANALYTICS: {
        productCode: 'METRICAS',
        tierCode: 'METRICAS_PRO',
        capability: 'METRICAS_REVIEW_ANALYTICS',
    },
    MARKETPLACE_LISTING: {
        productCode: 'MARKETPLACE',
        tierCode: 'MARKETPLACE_PLUS',
        capability: 'MARKETPLACE_LISTING',
    },
    MARKETPLACE_PLUS: {
        productCode: 'MARKETPLACE',
        tierCode: 'MARKETPLACE_PLUS',
        capability: 'MARKETPLACE_PLUS',
    },
};

const FEATURE_PRODUCT_ACCESS: Record<PlanFeatureKey, ProductAccessDefinition> = {
    ROLES_PERMISSIONS: CAPABILITY_PRODUCT_ACCESS.RESERVAS_PRO,
    STAFF_AVAILABILITY: CAPABILITY_PRODUCT_ACCESS.RESERVAS_PRO,
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: CAPABILITY_PRODUCT_ACCESS.MENSAJERIA_BASE,
    BOOKING_REMINDERS: CAPABILITY_PRODUCT_ACCESS.MENSAJERIA_REMINDERS,
    CUSTOMER_IMPORT_EXPORT: CAPABILITY_PRODUCT_ACCESS.CRM_IMPORT_EXPORT,
    OPERATIONAL_DASHBOARD: CAPABILITY_PRODUCT_ACCESS.METRICAS_OPERATIONAL_DASHBOARD,
    REVIEW_MANAGEMENT: CAPABILITY_PRODUCT_ACCESS.RESERVAS_BASE,
    REVIEW_ANALYTICS: CAPABILITY_PRODUCT_ACCESS.METRICAS_REVIEW_ANALYTICS,
    REVIEW_REQUEST_REMINDERS: CAPABILITY_PRODUCT_ACCESS.MENSAJERIA_REVIEW_REQUESTS,
    REVIEW_REQUEST_EMAIL: CAPABILITY_PRODUCT_ACCESS.MENSAJERIA_REVIEW_REQUESTS,
    REVIEW_REQUEST_WHATSAPP: CAPABILITY_PRODUCT_ACCESS.MENSAJERIA_REVIEW_REQUESTS,
    BOOKING_FLOW_CUSTOMIZATION: CAPABILITY_PRODUCT_ACCESS.RESERVAS_PRO,
    HOME_CTA_CUSTOMIZATION: CAPABILITY_PRODUCT_ACCESS.STOREFRONT_ADVANCED_CTA,
    HOME_SECTION_ORDER: CAPABILITY_PRODUCT_ACCESS.STOREFRONT_SECTION_ORDER,
    FOOTER_CUSTOMIZATION: CAPABILITY_PRODUCT_ACCESS.STOREFRONT_FOOTER_CUSTOMIZATION,
    ANNOUNCEMENT_BANNERS: CAPABILITY_PRODUCT_ACCESS.STOREFRONT_ANNOUNCEMENT_BANNERS,
    BULK_WHATSAPP_MESSAGING: CAPABILITY_PRODUCT_ACCESS.MENSAJERIA_BULK_WHATSAPP,
    BULK_EMAIL_CAMPAIGNS: CAPABILITY_PRODUCT_ACCESS.MENSAJERIA_CAMPAIGNS,
    OUTREACH_REACTIVATION_TOOLS: CAPABILITY_PRODUCT_ACCESS.CRM_REACTIVATION,
    GROUP_EVENTS: CAPABILITY_PRODUCT_ACCESS.EVENTOS_BASE,
    GROUP_CLASSES: CAPABILITY_PRODUCT_ACCESS.CLASES_BASE,
    GROUP_ADVANCED: CAPABILITY_PRODUCT_ACCESS.EVENTOS_PRO,
};

function hasTier(
    entitlements: CompanyEntitlementPayload | null | undefined,
    tierCode: ProductTierCode,
): boolean {
    return entitlements?.products.some((product) => product.tierCode === tierCode) ?? false;
}

function buildRecommendation(definition: ProductAccessDefinition): ProductAccessRecommendation {
    const requestLabel = PRODUCT_REQUEST_LABELS[definition.tierCode];

    return {
        ...definition,
        productName: requestLabel,
        tierName: requestLabel,
        requestLabel,
        ctaLabel: `Solicitar ${requestLabel}`,
        title: 'Este módulo no está activo para tu empresa.',
        description: `Solicitá activar ${requestLabel} y nuestro equipo va a revisar tu pedido.`,
        requiresLabel: `Requiere ${requestLabel}`,
    };
}

function resolveFeatureDefinition(
    feature: PlanFeatureKey,
    entitlements?: CompanyEntitlementPayload | null,
): ProductAccessDefinition {
    if (feature !== 'GROUP_ADVANCED') {
        return FEATURE_PRODUCT_ACCESS[feature];
    }

    if (hasTier(entitlements, 'EVENTOS_BASE') && !hasTier(entitlements, 'EVENTOS_PRO')) {
        return CAPABILITY_PRODUCT_ACCESS.EVENTOS_PRO;
    }

    if (hasTier(entitlements, 'CLASES_BASE') && !hasTier(entitlements, 'CLASES_PRO')) {
        return CAPABILITY_PRODUCT_ACCESS.CLASES_PRO;
    }

    return FEATURE_PRODUCT_ACCESS.GROUP_ADVANCED;
}

export function getProductAccessRecommendationForCapability(
    capability: ProductCapability,
): ProductAccessRecommendation {
    return buildRecommendation(CAPABILITY_PRODUCT_ACCESS[capability]);
}

export function getProductAccessRecommendationForFeature(
    feature: PlanFeatureKey,
    entitlements?: CompanyEntitlementPayload | null,
): ProductAccessRecommendation {
    return buildRecommendation(resolveFeatureDefinition(feature, entitlements));
}

export function getProductAccessRecommendation(params: {
    feature?: PlanFeatureKey;
    capability?: ProductCapability | null;
    entitlements?: CompanyEntitlementPayload | null;
}): ProductAccessRecommendation | null {
    if (params.capability) {
        return getProductAccessRecommendationForCapability(params.capability);
    }

    if (params.feature) {
        return getProductAccessRecommendationForFeature(params.feature, params.entitlements);
    }

    return null;
}

export function getTierCapabilities(tierCode: ProductTierCode): ProductCapability[] {
    return [...getProductTierDefinition(tierCode).includedCapabilities];
}

export function getProductAccessRecommendationForRequest(
    productCode: ProductCode,
    tierCode: ProductTierCode,
    capability: ProductCapability,
): ProductAccessRecommendation {
    const directMatch = CAPABILITY_PRODUCT_ACCESS[capability];
    if (directMatch.productCode === productCode && directMatch.tierCode === tierCode) {
        return buildRecommendation(directMatch);
    }

    return buildRecommendation({
        productCode,
        tierCode,
        capability,
    });
}

export function getDefaultCapabilityForTier(tierCode: ProductTierCode): ProductCapability {
    const tierDefinition = getProductTierDefinition(tierCode);
    return (tierDefinition.includedCapabilities[0] ??
        ProductCapabilityCode.RESERVAS_BASE) as ProductCapability;
}
