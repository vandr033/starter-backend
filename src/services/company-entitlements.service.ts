import {
    CompanyProductSubscriptionStatus,
    Prisma,
    ShopPlan,
} from '@prisma/client';
import {
    FEATURE_REQUIRED_PLAN,
    getPlanStaffLimit,
    type PlanFeatureKey,
} from '../config/plan-capabilities';
import {
    buildEffectiveProductsFromTiers,
    buildProductCapabilitiesFromTierCodes,
    getDefaultProductCapabilities,
    getEnabledProductCapabilities,
    isCoreProductCode,
    LEGACY_PLAN_BASE_PRODUCT_TIERS,
    LEGACY_PLAN_EXTRA_CAPABILITIES,
    PRODUCT_CAPABILITY_CODES,
    resolveLegacyFeatureFromCapabilities,
    isIncludedByDefaultTierCode,
    type CompanyEntitlementPayload,
    type EffectiveCompanyProduct,
    type ProductCapability,
    type ProductCode,
    type ProductTierCode,
} from '../config/product-entitlements';
import { prisma } from '../prisma/client';

type DbClient = typeof prisma | Prisma.TransactionClient;

export type ActiveCompanyProductSubscription = {
    id?: number;
    productCode: ProductCode;
    tierCode: ProductTierCode;
    status: CompanyProductSubscriptionStatus;
    isCoreProduct: boolean;
    capabilityCodes: ProductCapability[];
    startsAt?: Date;
    availableUntil?: Date | null;
    cancelledAt?: Date | null;
    productIsActive?: boolean;
    tierIsActive?: boolean;
};

export type CapabilityOverrideRecord = {
    capability: ProductCapability;
    value: boolean;
};

export type CompanyEntitlementState = {
    companyId?: number;
    plan: ShopPlan;
    availableUntil?: Date;
    isActive?: boolean;
    deletedAt?: Date | null;
    restaurantEnabled?: boolean;
    hasModularSubscriptions: boolean;
    activeSubscriptions: ActiveCompanyProductSubscription[];
    configuredSubscriptions?: ActiveCompanyProductSubscription[];
    capabilityOverrides: CapabilityOverrideRecord[];
};

function buildActiveProductLists(products: EffectiveCompanyProduct[]): {
    activeCoreProducts: ProductTierCode[];
    activeAddOns: ProductTierCode[];
} {
    return {
        activeCoreProducts: products
            .filter(
                (product) =>
                    product.isCore &&
                    (product.status === CompanyProductSubscriptionStatus.ACTIVE ||
                        product.status === CompanyProductSubscriptionStatus.TRIALING),
            )
            .map((product) => product.tierCode),
        activeAddOns: products
            .filter(
                (product) =>
                    !product.isCore &&
                    (product.status === CompanyProductSubscriptionStatus.ACTIVE ||
                        product.status === CompanyProductSubscriptionStatus.TRIALING),
            )
            .map((product) => product.tierCode),
    };
}

function buildFeatureRecord(
    productCapabilities: Record<ProductCapability, boolean>,
): Record<PlanFeatureKey, boolean> {
    return (Object.keys(FEATURE_REQUIRED_PLAN) as PlanFeatureKey[]).reduce(
        (acc, feature) => {
            acc[feature] = resolveLegacyFeatureFromCapabilities(feature, productCapabilities);
            return acc;
        },
        {} as Record<PlanFeatureKey, boolean>,
    );
}

function applyCapabilityOverrides(
    capabilities: Record<ProductCapability, boolean>,
    overrides: CapabilityOverrideRecord[],
): Record<ProductCapability, boolean> {
    if (overrides.length === 0) {
        return capabilities;
    }

    const next = { ...capabilities };

    for (const override of overrides) {
        next[override.capability] = override.value;
    }

    return next;
}

function buildEntitlementPayload(params: {
    plan: ShopPlan;
    source: CompanyEntitlementPayload['source'];
    products: EffectiveCompanyProduct[];
    productCapabilities: Record<ProductCapability, boolean>;
}): CompanyEntitlementPayload {
    const { activeCoreProducts, activeAddOns } = buildActiveProductLists(params.products);
    const features = buildFeatureRecord(params.productCapabilities);

    return {
        version: 1,
        currentPlan: params.plan,
        // `Company.plan` remains the compatibility field until the frontend and
        // remaining route guards migrate to the modular commercial records.
        maxStaffMembers: getPlanStaffLimit(params.plan),
        features,
        requiredPlans: { ...FEATURE_REQUIRED_PLAN },
        source: params.source,
        productCapabilities: { ...params.productCapabilities },
        products: params.products.map((product) => ({ ...product })),
        activeCoreProducts,
        activeAddOns,
    };
}

export function getLegacyPlanFallbackEntitlements(
    plan: ShopPlan,
    overrides: CapabilityOverrideRecord[] = [],
): CompanyEntitlementPayload {
    const products = buildEffectiveProductsFromTiers(LEGACY_PLAN_BASE_PRODUCT_TIERS[plan]);
    const baseCapabilities = buildProductCapabilitiesFromTierCodes(
        LEGACY_PLAN_BASE_PRODUCT_TIERS[plan],
        LEGACY_PLAN_EXTRA_CAPABILITIES[plan],
    );
    const productCapabilities = applyCapabilityOverrides(baseCapabilities, overrides);

    return buildEntitlementPayload({
        plan,
        source: 'legacy_plan',
        products,
        productCapabilities,
    });
}

function getActiveModularProducts(
    activeSubscriptions: ActiveCompanyProductSubscription[],
): EffectiveCompanyProduct[] {
    return [...activeSubscriptions]
        .map((subscription) => ({
            productCode: subscription.productCode,
            tierCode: subscription.tierCode,
            status: subscription.status,
            isCore: subscription.isCoreProduct,
            includedByDefault: isIncludedByDefaultTierCode(subscription.tierCode),
        }))
        .sort((left, right) => {
            if (left.isCore !== right.isCore) return left.isCore ? -1 : 1;
            return left.productCode.localeCompare(right.productCode);
        });
}

function withImplicitBundledBaselineAccess(
    products: EffectiveCompanyProduct[],
    configuredProductCodes?: Set<ProductCode>,
): EffectiveCompanyProduct[] {
    const bundledProducts: EffectiveCompanyProduct[] = [
        {
            productCode: 'CRM',
            tierCode: 'CRM_BASE',
            status: CompanyProductSubscriptionStatus.ACTIVE,
            isCore: false,
            includedByDefault: true,
        },
        {
            productCode: 'PERSONALIZACION',
            tierCode: 'PERSONALIZACION_BASE',
            status: CompanyProductSubscriptionStatus.ACTIVE,
            isCore: false,
            includedByDefault: true,
        },
        {
            productCode: 'MENSAJERIA',
            tierCode: 'MENSAJERIA_BASE',
            status: CompanyProductSubscriptionStatus.ACTIVE,
            isCore: false,
            includedByDefault: true,
        },
    ];

    const nextProducts = [...products];
    for (const bundledProduct of bundledProducts) {
        const isConfigured = configuredProductCodes?.has(bundledProduct.productCode) ?? false;
        const isAlreadyEffective = nextProducts.some(
            (product) => product.productCode === bundledProduct.productCode,
        );
        if (!isConfigured && !isAlreadyEffective) {
            nextProducts.push(bundledProduct);
        }
    }

    return nextProducts.sort((left, right) => {
        if (left.isCore !== right.isCore) return left.isCore ? -1 : 1;
        return left.productCode.localeCompare(right.productCode);
    });
}

function assertAtLeastOneCoreProduct(products: EffectiveCompanyProduct[]): void {
    if (products.some((product) => product.isCore)) {
        return;
    }

    throw new Error(
        'Invalid modular entitlement state: every company must have at least one active core product.',
    );
}

export function resolveCompanyEntitlementsFromState(
    state: CompanyEntitlementState,
): CompanyEntitlementPayload {
    let entitlements: CompanyEntitlementPayload;

    if (state.activeSubscriptions.length === 0) {
        if (state.hasModularSubscriptions) {
            entitlements = buildEntitlementPayload({
                plan: state.plan,
                source: 'modular',
                products: [],
                productCapabilities: getDefaultProductCapabilities(),
            });
        } else {
            entitlements = getLegacyPlanFallbackEntitlements(state.plan, state.capabilityOverrides);
        }
    } else {
        const configuredProductCodes = new Set(
            (state.configuredSubscriptions ?? []).map((subscription) => subscription.productCode),
        );
        const products = withImplicitBundledBaselineAccess(
            getActiveModularProducts(state.activeSubscriptions),
            configuredProductCodes.size > 0 ? configuredProductCodes : undefined,
        );
        assertAtLeastOneCoreProduct(products);

        const baseCapabilities = buildProductCapabilitiesFromTierCodes(
            products.map((product) => product.tierCode),
        );
        const productCapabilities = applyCapabilityOverrides(
            baseCapabilities,
            state.capabilityOverrides,
        );

        entitlements = buildEntitlementPayload({
            plan: state.plan,
            source: 'modular',
            products,
            productCapabilities,
        });
    }

    // `restaurant_enabled` is a legacy product toggle that still exists in
    // production data. It is part of the same effective decision and cannot
    // silently re-enable the Restaurant product when the toggle is off.
    if (state.restaurantEnabled === false && entitlements.productCapabilities.RESTAURANT_MODULE) {
        entitlements = buildEntitlementPayload({
            plan: entitlements.currentPlan,
            source: entitlements.source,
            products: entitlements.products,
            productCapabilities: {
                ...entitlements.productCapabilities,
                RESTAURANT_MODULE: false,
            },
        });
    }

    return entitlements;
}

export async function getCompanyEntitlementState(
    companyId: number,
    db: DbClient,
    now: Date = new Date(),
): Promise<CompanyEntitlementState> {
    const company = await db.company.findUnique({
        where: { id: companyId },
        select: {
            id: true,
            plan: true,
            availableUntil: true,
            is_active: true,
            deleted_at: true,
            restaurant_enabled: true,
            product_subscriptions: {
                select: {
                    id: true,
                    status: true,
                    startsAt: true,
                    availableUntil: true,
                    cancelledAt: true,
                    product: {
                        select: {
                            code: true,
                            isCoreProduct: true,
                            isActive: true,
                        },
                    },
                    productTier: {
                        select: {
                            code: true,
                            isActive: true,
                            capabilities: {
                                select: {
                                    capability: true,
                                },
                            },
                        },
                    },
                },
            },
            capability_overrides: {
                where: {
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: now } },
                    ],
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                select: {
                    capability: true,
                    value: true,
                },
            },
        },
    });

    if (!company) {
        throw new Error(`Company ${companyId} not found`);
    }

    const configuredSubscriptions: ActiveCompanyProductSubscription[] = company.product_subscriptions.map(
        (subscription) => ({
            id: subscription.id,
            productCode: subscription.product.code,
            tierCode: subscription.productTier.code,
            status: subscription.status,
            isCoreProduct: subscription.product.isCoreProduct ?? isCoreProductCode(subscription.product.code),
            capabilityCodes: (subscription.productTier.capabilities ?? []).map(
                (capability) => capability.capability,
            ),
            startsAt: subscription.startsAt,
            availableUntil: subscription.availableUntil,
            cancelledAt: subscription.cancelledAt,
            productIsActive: subscription.product.isActive ?? true,
            tierIsActive: subscription.productTier.isActive ?? true,
        }),
    );

    const isEffectiveSubscription = (subscription: ActiveCompanyProductSubscription) =>
        (subscription.status === CompanyProductSubscriptionStatus.ACTIVE ||
            subscription.status === CompanyProductSubscriptionStatus.TRIALING) &&
        !subscription.cancelledAt &&
        (!subscription.startsAt || subscription.startsAt.getTime() <= now.getTime()) &&
        (!subscription.availableUntil || subscription.availableUntil.getTime() >= now.getTime()) &&
        subscription.productIsActive !== false &&
        subscription.tierIsActive !== false;

    const overrideMap = new Map<ProductCapability, boolean>();

    for (const override of company.capability_overrides ?? []) {
        if (!overrideMap.has(override.capability)) {
            overrideMap.set(override.capability, override.value);
        }
    }

    return {
        companyId: company.id,
        plan: company.plan,
        availableUntil: company.availableUntil,
        isActive: company.is_active,
        deletedAt: company.deleted_at,
        restaurantEnabled: company.restaurant_enabled,
        hasModularSubscriptions: company.product_subscriptions.length > 0,
        configuredSubscriptions,
        activeSubscriptions: configuredSubscriptions.filter(isEffectiveSubscription),
        capabilityOverrides: [...overrideMap.entries()].map(([capability, value]) => ({
            capability,
            value,
        })),
    };
}

export async function getCompanyEntitlements(
    companyId: number,
    db: DbClient = prisma,
): Promise<CompanyEntitlementPayload> {
    const state = await getCompanyEntitlementState(companyId, db);
    return resolveCompanyEntitlementsFromState(state);
}

export async function companyHasCapability(
    companyId: number,
    capability: ProductCapability,
    db: DbClient = prisma,
): Promise<boolean> {
    const entitlements = await getCompanyEntitlements(companyId, db);
    return entitlements.productCapabilities[capability] === true;
}

export async function companyHasCoreProduct(
    companyId: number,
    productCode: ProductCode,
    db: DbClient = prisma,
): Promise<boolean> {
    if (!isCoreProductCode(productCode)) {
        return false;
    }

    const entitlements = await getCompanyEntitlements(companyId, db);
    return entitlements.products.some(
        (product) =>
            product.isCore &&
            product.productCode === productCode &&
            (product.status === CompanyProductSubscriptionStatus.ACTIVE ||
                product.status === CompanyProductSubscriptionStatus.TRIALING),
    );
}

export async function getCompanyProducts(
    companyId: number,
    db: DbClient = prisma,
): Promise<EffectiveCompanyProduct[]> {
    const entitlements = await getCompanyEntitlements(companyId, db);
    return entitlements.products;
}

export function getEnabledCapabilitiesFromEntitlements(
    entitlements: CompanyEntitlementPayload,
): Set<ProductCapability> {
    return getEnabledProductCapabilities(entitlements.productCapabilities);
}

export function getEmptyProductCapabilities(): Record<ProductCapability, boolean> {
    return getDefaultProductCapabilities();
}

export function getAllProductCapabilities(): readonly ProductCapability[] {
    return PRODUCT_CAPABILITY_CODES;
}
