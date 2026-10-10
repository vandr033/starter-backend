"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BUSINESS_PRICING_SETTINGS = exports.DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS = exports.DEFAULT_BUSINESS_PRICING_PRODUCTS = exports.PUBLIC_CORE_TIER_KEYS = exports.PUBLIC_ADD_ON_KEYS = exports.SELECTABLE_CORE_PRODUCT_KEYS = exports.PUBLIC_CORE_PRODUCT_KEYS = exports.SELF_SERVICE_REDIRECT_PATH = exports.SELF_SERVICE_DEFAULT_BILLING_CYCLE = exports.SELF_SERVICE_DEFAULT_CURRENCY = void 0;
exports.isSelectableCoreProduct = isSelectableCoreProduct;
exports.isSupportedAddOn = isSupportedAddOn;
exports.isKnownPublicCoreProduct = isKnownPublicCoreProduct;
exports.isPublicCoreTierKey = isPublicCoreTierKey;
exports.getDefaultTierForCoreProduct = getDefaultTierForCoreProduct;
exports.isTierValidForCoreProduct = isTierValidForCoreProduct;
exports.mapCoreSelectionsToCommercialProducts = mapCoreSelectionsToCommercialProducts;
exports.mapCoreProductsToCommercialProducts = mapCoreProductsToCommercialProducts;
exports.mapAddOnsToCommercialProducts = mapAddOnsToCommercialProducts;
exports.mapBusinessPricingKeyToProductCode = mapBusinessPricingKeyToProductCode;
const client_1 = require("@prisma/client");
exports.SELF_SERVICE_DEFAULT_CURRENCY = 'Bs.';
exports.SELF_SERVICE_DEFAULT_BILLING_CYCLE = client_1.BillingCycle.MONTHLY;
exports.SELF_SERVICE_REDIRECT_PATH = '/admin/onboarding';
exports.PUBLIC_CORE_PRODUCT_KEYS = [
    client_1.BusinessPricingProductKey.RESERVAS,
    client_1.BusinessPricingProductKey.EVENTOS,
    client_1.BusinessPricingProductKey.CLASES,
    client_1.BusinessPricingProductKey.TIENDA,
    client_1.BusinessPricingProductKey.RESTAURANTE,
];
exports.SELECTABLE_CORE_PRODUCT_KEYS = [
    client_1.BusinessPricingProductKey.RESERVAS,
    client_1.BusinessPricingProductKey.EVENTOS,
    client_1.BusinessPricingProductKey.CLASES,
    client_1.BusinessPricingProductKey.TIENDA,
    client_1.BusinessPricingProductKey.RESTAURANTE,
];
exports.PUBLIC_ADD_ON_KEYS = [
    client_1.BusinessPricingProductKey.PERSONALIZACION_PRO,
    client_1.BusinessPricingProductKey.METRICAS,
    client_1.BusinessPricingProductKey.MENSAJERIA_PRO,
    client_1.BusinessPricingProductKey.CRM_PRO,
];
exports.PUBLIC_CORE_TIER_KEYS = [
    client_1.ProductTierCode.RESERVAS_BASE,
    client_1.ProductTierCode.RESERVAS_PRO,
    client_1.ProductTierCode.EVENTOS_BASE,
    client_1.ProductTierCode.EVENTOS_PRO,
    client_1.ProductTierCode.CLASES_BASE,
    client_1.ProductTierCode.CLASES_PRO,
    client_1.ProductTierCode.STORES_BASE,
    client_1.ProductTierCode.STORES_PRO,
    client_1.ProductTierCode.RESTAURANTE_PRO,
];
const RESERVAS_BASE_FEATURES = [
    'Reservas 1:1',
    'Servicios y categorías',
    'Personal / recursos',
    'Disponibilidad',
    'Página pública para reservar',
    'Confirmaciones básicas',
];
const RESERVAS_PRO_FEATURES = [
    'Todo lo de Reservas Base',
    'Servicios con múltiples sesiones',
    'Flujos avanzados por servicio',
    'Mejor manejo de recursos/personal',
    'Operación avanzada de agenda',
];
const EVENTOS_BASE_FEATURES = [
    'Eventos pagados',
    'Eventos gratuitos',
    'Registros',
    'Lista de interesados',
    'Formulario de inscripción',
];
const EVENTOS_PRO_FEATURES = [
    'Todo lo de Eventos Base',
    'Control de asistencia avanzado',
    'Tickets / códigos si están disponibles',
    'Flujos avanzados de participantes',
    'Herramientas operativas para eventos',
];
const CLASES_BASE_FEATURES = [
    'Clases recurrentes',
    'Sesiones',
    'Inscripciones',
    'Asistencia básica',
    'Gestión de alumnos',
];
const CLASES_PRO_FEATURES = [
    'Todo lo de Clases Base',
    'Asistencia avanzada',
    'Cuotas / pagos si están disponibles',
    'Seguimiento de alumnos',
    'Operación avanzada de clases',
];
exports.DEFAULT_BUSINESS_PRICING_PRODUCTS = [
    {
        productKey: client_1.BusinessPricingProductKey.RESERVAS,
        type: client_1.BusinessPricingProductType.CORE,
        displayName: 'Reservas',
        description: 'Para negocios que viven de citas, servicios y horarios.',
        monthlyPriceBs: 300,
        isActive: true,
        isComingSoon: false,
        sortOrder: 1,
        metadata: {
            tiers: [
                {
                    tierKey: client_1.ProductTierCode.RESERVAS_BASE,
                    label: 'Base',
                    monthlyPriceBs: 300,
                    featureList: RESERVAS_BASE_FEATURES,
                    proUnlocks: [
                        'Servicios con múltiples sesiones',
                        'Flujos avanzados por servicio',
                        'Operación avanzada de agenda',
                    ],
                    isDefault: true,
                },
                {
                    tierKey: client_1.ProductTierCode.RESERVAS_PRO,
                    label: 'Pro',
                    monthlyPriceBs: 500,
                    featureList: RESERVAS_PRO_FEATURES,
                },
            ],
        },
    },
    {
        productKey: client_1.BusinessPricingProductKey.EVENTOS,
        type: client_1.BusinessPricingProductType.CORE,
        displayName: 'Eventos',
        description: 'Para vender entradas, registrar asistentes y manejar eventos sin planillas eternas.',
        monthlyPriceBs: 300,
        isActive: true,
        isComingSoon: false,
        sortOrder: 2,
        metadata: {
            tiers: [
                {
                    tierKey: client_1.ProductTierCode.EVENTOS_BASE,
                    label: 'Base',
                    monthlyPriceBs: 300,
                    featureList: EVENTOS_BASE_FEATURES,
                    proUnlocks: [
                        'Control de asistencia avanzado',
                        'Tickets / códigos si están disponibles',
                        'Flujos avanzados de participantes',
                    ],
                    isDefault: true,
                },
                {
                    tierKey: client_1.ProductTierCode.EVENTOS_PRO,
                    label: 'Pro',
                    monthlyPriceBs: 500,
                    featureList: EVENTOS_PRO_FEATURES,
                },
            ],
        },
    },
    {
        productKey: client_1.BusinessPricingProductKey.CLASES,
        type: client_1.BusinessPricingProductType.CORE,
        displayName: 'Clases',
        description: 'Para operar clases recurrentes, sesiones, alumnos y asistencia.',
        monthlyPriceBs: 300,
        isActive: true,
        isComingSoon: false,
        sortOrder: 3,
        metadata: {
            tiers: [
                {
                    tierKey: client_1.ProductTierCode.CLASES_BASE,
                    label: 'Base',
                    monthlyPriceBs: 300,
                    featureList: CLASES_BASE_FEATURES,
                    proUnlocks: [
                        'Asistencia avanzada',
                        'Cuotas / pagos si están disponibles',
                        'Operación avanzada de clases',
                    ],
                    isDefault: true,
                },
                {
                    tierKey: client_1.ProductTierCode.CLASES_PRO,
                    label: 'Pro',
                    monthlyPriceBs: 500,
                    featureList: CLASES_PRO_FEATURES,
                },
            ],
        },
    },
    {
        productKey: client_1.BusinessPricingProductKey.TIENDA,
        type: client_1.BusinessPricingProductType.CORE,
        displayName: 'Tienda',
        description: 'Catálogo, pedidos, combos, stock y checkout QR para vender desde tu página.',
        monthlyPriceBs: 300,
        isActive: true,
        isComingSoon: false,
        sortOrder: 4,
        metadata: {
            tiers: [
                {
                    tierKey: client_1.ProductTierCode.STORES_BASE,
                    label: 'Base',
                    monthlyPriceBs: 300,
                    featureList: [
                        'Productos y categorías',
                        'Stock global',
                        'Combos estructurados',
                        'Pickup y delivery',
                        'Checkout invitado',
                        'QR manual',
                    ],
                    proUnlocks: [
                        'Pedidos programados',
                        'Promociones',
                        'Asignación interna',
                        'Métricas de tienda',
                    ],
                    isDefault: true,
                },
                {
                    tierKey: client_1.ProductTierCode.STORES_PRO,
                    label: 'Pro',
                    monthlyPriceBs: 500,
                    featureList: [
                        'Todo lo de Tienda Base',
                        'Pedidos programados',
                        'Promociones',
                        'Asignación de pedidos',
                        'Métricas de tienda',
                    ],
                },
            ],
        },
    },
    {
        productKey: client_1.BusinessPricingProductKey.RESTAURANTE,
        type: client_1.BusinessPricingProductType.CORE,
        displayName: 'Restaurante',
        description: 'Reservas de mesa, mesas, horarios de atención y menú digital para tu restaurante.',
        monthlyPriceBs: 500,
        isActive: true,
        isComingSoon: false,
        sortOrder: 5,
        metadata: {
            tiers: [
                {
                    tierKey: client_1.ProductTierCode.RESTAURANTE_PRO,
                    label: 'Pro',
                    monthlyPriceBs: 500,
                    featureList: [
                        'Reservas de mesa online',
                        'Mesas, áreas y turnos de servicio',
                        'Operación diaria de restaurante',
                        'Menú digital público',
                    ],
                    isDefault: true,
                },
            ],
        },
    },
    {
        productKey: client_1.BusinessPricingProductKey.PERSONALIZACION_PRO,
        type: client_1.BusinessPricingProductType.ADDON,
        displayName: 'Personalización Pro',
        description: 'Una página que no parece plantilla.',
        monthlyPriceBs: 400,
        isActive: true,
        isComingSoon: false,
        sortOrder: 10,
        metadata: {
            featureList: [
                'CTA avanzado',
                'Layouts',
                'Footer',
                'Anuncios',
                'Orden de secciones',
                'Branding visual',
            ],
            includedNote: 'Personalización Base incluida por defecto.',
        },
    },
    {
        productKey: client_1.BusinessPricingProductKey.METRICAS,
        type: client_1.BusinessPricingProductType.ADDON,
        displayName: 'Métricas',
        description: 'Tomá decisiones con números, no con intuición.',
        monthlyPriceBs: 250,
        isActive: true,
        isComingSoon: false,
        sortOrder: 11,
        metadata: {
            featureList: [
                'Reservas',
                'Ingresos',
                'Servicios top',
                'Personal top',
                'Clientes',
                'Reseñas',
                'Eventos y clases si están habilitados',
            ],
        },
    },
    {
        productKey: client_1.BusinessPricingProductKey.MENSAJERIA_PRO,
        type: client_1.BusinessPricingProductType.ADDON,
        displayName: 'Mensajería / Recordatorios Pro',
        description: 'Menos ausencias, más recompra y clientes mejor atendidos.',
        monthlyPriceBs: 300,
        isActive: true,
        isComingSoon: false,
        sortOrder: 12,
        metadata: {
            featureList: [
                'Recordatorios',
                'Campañas',
                'Solicitudes de reseña',
                'WhatsApp y email outreach',
                'Comunicación masiva',
            ],
            includedNote: 'Mensajería Base incluida por defecto.',
        },
    },
    {
        productKey: client_1.BusinessPricingProductKey.CRM_PRO,
        type: client_1.BusinessPricingProductType.ADDON,
        displayName: 'CRM / Clientes Pro',
        description: 'Tus clientes no deberían vivir perdidos en chats.',
        monthlyPriceBs: 250,
        isActive: true,
        isComingSoon: false,
        sortOrder: 13,
        metadata: {
            featureList: [
                'Historial',
                'Segmentación',
                'Importación y exportación',
                'Reactivación',
                'Clientes por producto, evento o clase',
            ],
            includedNote: 'CRM Base incluido por defecto.',
        },
    },
];
exports.DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS = [
    { minSelectedItems: 1, discountPercent: 0, label: '1 producto', isActive: true, sortOrder: 1 },
    { minSelectedItems: 2, discountPercent: 10, label: '2 productos', isActive: true, sortOrder: 2 },
    { minSelectedItems: 3, discountPercent: 15, label: '3 productos', isActive: true, sortOrder: 3 },
    { minSelectedItems: 4, discountPercent: 20, label: '4+ productos', isActive: true, sortOrder: 4 },
];
exports.DEFAULT_BUSINESS_PRICING_SETTINGS = {
    annualDiscountPercent: 15,
    trialLengthDays: 7,
    firstMonthFree: true,
};
function isSelectableCoreProduct(value) {
    return exports.SELECTABLE_CORE_PRODUCT_KEYS.includes(value);
}
function isSupportedAddOn(value) {
    return exports.PUBLIC_ADD_ON_KEYS.includes(value);
}
function isKnownPublicCoreProduct(value) {
    return exports.PUBLIC_CORE_PRODUCT_KEYS.includes(value);
}
function isPublicCoreTierKey(value) {
    return exports.PUBLIC_CORE_TIER_KEYS.includes(value);
}
function getDefaultTierForCoreProduct(productKey) {
    if (productKey === client_1.BusinessPricingProductKey.RESERVAS)
        return client_1.ProductTierCode.RESERVAS_BASE;
    if (productKey === client_1.BusinessPricingProductKey.EVENTOS)
        return client_1.ProductTierCode.EVENTOS_BASE;
    if (productKey === client_1.BusinessPricingProductKey.CLASES)
        return client_1.ProductTierCode.CLASES_BASE;
    if (productKey === client_1.BusinessPricingProductKey.RESTAURANTE)
        return client_1.ProductTierCode.RESTAURANTE_PRO;
    return client_1.ProductTierCode.STORES_BASE;
}
function isTierValidForCoreProduct(productKey, tierKey) {
    if (productKey === client_1.BusinessPricingProductKey.RESERVAS) {
        return (tierKey === client_1.ProductTierCode.RESERVAS_BASE ||
            tierKey === client_1.ProductTierCode.RESERVAS_PRO);
    }
    if (productKey === client_1.BusinessPricingProductKey.EVENTOS) {
        return (tierKey === client_1.ProductTierCode.EVENTOS_BASE ||
            tierKey === client_1.ProductTierCode.EVENTOS_PRO);
    }
    if (productKey === client_1.BusinessPricingProductKey.CLASES) {
        return (tierKey === client_1.ProductTierCode.CLASES_BASE ||
            tierKey === client_1.ProductTierCode.CLASES_PRO);
    }
    if (productKey === client_1.BusinessPricingProductKey.RESTAURANTE) {
        return tierKey === client_1.ProductTierCode.RESTAURANTE_PRO;
    }
    return (tierKey === client_1.ProductTierCode.STORES_BASE ||
        tierKey === client_1.ProductTierCode.STORES_PRO);
}
function mapCoreSelectionsToCommercialProducts(selections, availableUntil) {
    return selections.map((selection) => ({
        productCode: mapBusinessPricingKeyToProductCode(selection.productKey),
        tierCode: selection.tierKey,
        billingCycle: exports.SELF_SERVICE_DEFAULT_BILLING_CYCLE,
        pricePaid: null,
        currency: exports.SELF_SERVICE_DEFAULT_CURRENCY,
        availableUntil,
    }));
}
function mapCoreProductsToCommercialProducts(coreProducts, availableUntil) {
    return mapCoreSelectionsToCommercialProducts(coreProducts.map((productKey) => ({
        productKey,
        tierKey: getDefaultTierForCoreProduct(productKey),
    })), availableUntil);
}
function mapAddOnsToCommercialProducts(addOns, availableUntil) {
    return addOns.map((addOnCode) => ({
        productCode: mapAddOnToProductCode(addOnCode),
        tierCode: mapAddOnToTier(addOnCode),
        billingCycle: exports.SELF_SERVICE_DEFAULT_BILLING_CYCLE,
        pricePaid: null,
        currency: exports.SELF_SERVICE_DEFAULT_CURRENCY,
        availableUntil,
    }));
}
function mapBusinessPricingKeyToProductCode(key) {
    if (key === client_1.BusinessPricingProductKey.RESERVAS)
        return client_1.ProductCode.RESERVAS;
    if (key === client_1.BusinessPricingProductKey.EVENTOS)
        return client_1.ProductCode.EVENTOS;
    if (key === client_1.BusinessPricingProductKey.CLASES)
        return client_1.ProductCode.CLASES;
    if (key === client_1.BusinessPricingProductKey.TIENDA)
        return client_1.ProductCode.STORES;
    if (key === client_1.BusinessPricingProductKey.RESTAURANTE)
        return client_1.ProductCode.RESTAURANTE;
    if (key === client_1.BusinessPricingProductKey.PERSONALIZACION_PRO)
        return client_1.ProductCode.PERSONALIZACION;
    if (key === client_1.BusinessPricingProductKey.METRICAS)
        return client_1.ProductCode.METRICAS;
    if (key === client_1.BusinessPricingProductKey.MENSAJERIA_PRO)
        return client_1.ProductCode.MENSAJERIA;
    return client_1.ProductCode.CRM;
}
function mapAddOnToProductCode(addOnCode) {
    return mapBusinessPricingKeyToProductCode(addOnCode);
}
function mapAddOnToTier(addOnCode) {
    if (addOnCode === client_1.BusinessPricingProductKey.PERSONALIZACION_PRO) {
        return client_1.ProductTierCode.PERSONALIZACION_PLUS;
    }
    if (addOnCode === client_1.BusinessPricingProductKey.METRICAS)
        return client_1.ProductTierCode.METRICAS_PRO;
    if (addOnCode === client_1.BusinessPricingProductKey.MENSAJERIA_PRO)
        return client_1.ProductTierCode.MENSAJERIA_PRO;
    return client_1.ProductTierCode.CRM_PRO;
}
