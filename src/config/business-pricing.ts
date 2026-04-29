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

export const PUBLIC_CORE_TIER_KEYS = [
    ProductTierCode.RESERVAS_BASE,
    ProductTierCode.RESERVAS_PRO,
    ProductTierCode.EVENTOS_BASE,
    ProductTierCode.EVENTOS_PRO,
    ProductTierCode.CLASES_BASE,
    ProductTierCode.CLASES_PRO,
] as const;

export type PublicCoreProductKey = (typeof PUBLIC_CORE_PRODUCT_KEYS)[number];
export type SelectableCoreProductKey = (typeof SELECTABLE_CORE_PRODUCT_KEYS)[number];
export type PublicAddOnKey = (typeof PUBLIC_ADD_ON_KEYS)[number];
export type PublicCoreTierKey = (typeof PUBLIC_CORE_TIER_KEYS)[number];
export type PublicBusinessPricingProductKey = PublicCoreProductKey | PublicAddOnKey;

export type CoreProductTierDefault = {
    tierKey: PublicCoreTierKey;
    label: 'Base' | 'Pro';
    monthlyPriceBs: number;
    featureList: string[];
    proUnlocks?: string[];
    isDefault?: boolean;
};

export type BusinessPricingProductMetadata = {
    tiers?: CoreProductTierDefault[];
    featureList?: string[];
    includedNote?: string;
};

export type BusinessPricingProductDefault = {
    productKey: PublicBusinessPricingProductKey;
    type: BusinessPricingProductType;
    displayName: string;
    description: string;
    monthlyPriceBs: number;
    isActive: boolean;
    isComingSoon: boolean;
    sortOrder: number;
    metadata?: BusinessPricingProductMetadata;
};

export type CoreProductTierSelection = {
    productKey: SelectableCoreProductKey;
    tierKey: PublicCoreTierKey;
};

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
        metadata: {
            tiers: [
                {
                    tierKey: ProductTierCode.RESERVAS_BASE,
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
                    tierKey: ProductTierCode.RESERVAS_PRO,
                    label: 'Pro',
                    monthlyPriceBs: 500,
                    featureList: RESERVAS_PRO_FEATURES,
                },
            ],
        },
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
        metadata: {
            tiers: [
                {
                    tierKey: ProductTierCode.EVENTOS_BASE,
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
                    tierKey: ProductTierCode.EVENTOS_PRO,
                    label: 'Pro',
                    monthlyPriceBs: 500,
                    featureList: EVENTOS_PRO_FEATURES,
                },
            ],
        },
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
        metadata: {
            tiers: [
                {
                    tierKey: ProductTierCode.CLASES_BASE,
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
                    tierKey: ProductTierCode.CLASES_PRO,
                    label: 'Pro',
                    monthlyPriceBs: 500,
                    featureList: CLASES_PRO_FEATURES,
                },
            ],
        },
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
        metadata: {
            featureList: [
                'Productos y categorías',
                'Pickup y delivery',
                'Pedidos programados',
                'Checkout por WhatsApp',
                'Próximamente',
            ],
        },
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
        productKey: BusinessPricingProductKey.METRICAS,
        type: BusinessPricingProductType.ADDON,
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
        productKey: BusinessPricingProductKey.MENSAJERIA_PRO,
        type: BusinessPricingProductType.ADDON,
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
        productKey: BusinessPricingProductKey.CRM_PRO,
        type: BusinessPricingProductType.ADDON,
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

export const DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS = [
    { minSelectedItems: 1, discountPercent: 0, label: '1 producto', isActive: true, sortOrder: 1 },
    { minSelectedItems: 2, discountPercent: 10, label: '2 productos', isActive: true, sortOrder: 2 },
    { minSelectedItems: 3, discountPercent: 15, label: '3 productos', isActive: true, sortOrder: 3 },
    { minSelectedItems: 4, discountPercent: 20, label: '4+ productos', isActive: true, sortOrder: 4 },
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

export function isPublicCoreTierKey(value: string): value is PublicCoreTierKey {
    return PUBLIC_CORE_TIER_KEYS.includes(value as PublicCoreTierKey);
}

export function getDefaultTierForCoreProduct(productKey: SelectableCoreProductKey): PublicCoreTierKey {
    if (productKey === BusinessPricingProductKey.RESERVAS) return ProductTierCode.RESERVAS_BASE;
    if (productKey === BusinessPricingProductKey.EVENTOS) return ProductTierCode.EVENTOS_BASE;
    return ProductTierCode.CLASES_BASE;
}

export function isTierValidForCoreProduct(
    productKey: SelectableCoreProductKey,
    tierKey: PublicCoreTierKey,
): boolean {
    if (productKey === BusinessPricingProductKey.RESERVAS) {
        return (
            tierKey === ProductTierCode.RESERVAS_BASE ||
            tierKey === ProductTierCode.RESERVAS_PRO
        );
    }
    if (productKey === BusinessPricingProductKey.EVENTOS) {
        return (
            tierKey === ProductTierCode.EVENTOS_BASE ||
            tierKey === ProductTierCode.EVENTOS_PRO
        );
    }
    return (
        tierKey === ProductTierCode.CLASES_BASE ||
        tierKey === ProductTierCode.CLASES_PRO
    );
}

export function mapCoreSelectionsToCommercialProducts(
    selections: readonly CoreProductTierSelection[],
    availableUntil: Date,
): Array<{
    productCode: ProductCode;
    tierCode: ProductTierCode;
    billingCycle: BillingCycle;
    pricePaid: null;
    currency: string;
    availableUntil: Date;
}> {
    return selections.map((selection) => ({
        productCode: mapBusinessPricingKeyToProductCode(selection.productKey),
        tierCode: selection.tierKey,
        billingCycle: SELF_SERVICE_DEFAULT_BILLING_CYCLE,
        pricePaid: null,
        currency: SELF_SERVICE_DEFAULT_CURRENCY,
        availableUntil,
    }));
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
    return mapCoreSelectionsToCommercialProducts(
        coreProducts.map((productKey) => ({
            productKey,
            tierKey: getDefaultTierForCoreProduct(productKey),
        })),
        availableUntil,
    );
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
