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
    type CompanyEntitlementPayload,
    type EffectiveCompanyProduct,
    type ProductCapability,
    type ProductCode,
    type ProductTierCode,
} from '../config/product-entitlements';
import { prisma } from '../prisma/client';

type DbClient = typeof prisma | Prisma.TransactionClient;

type ActiveCompanyProductSubscription = {
    productCode: ProductCode;
    tierCode: ProductTierCode;
    isCoreProduct: boolean;
    capabilityCodes: ProductCapability[];
};

type CapabilityOverrideRecord = {
    capability: ProductCapability;
    value: boolean;
};

type CompanyEntitlementState = {
    plan: ShopPlan;
    activeSubscriptions: ActiveCompanyProductSubscription[];
    capabilityOverrides: CapabilityOverrideRecord[];
};

function buildActiveProductLists(products: EffectiveCompanyProduct[]): {
    activeCoreProducts: ProductTierCode[];
    activeAddOns: ProductTierCode[];
} {
    return {
        activeCoreProducts: products
            .filter((product) => product.isCore)
            .map((product) => product.tierCode),
        activeAddOns: products
            .filter((product) => !product.isCore)
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
            status: CompanyProductSubscriptionStatus.ACTIVE,
            isCore: subscription.isCoreProduct,
            includedByDefault: false,
        }))
        .sort((left, right) => {
            if (left.isCore !== right.isCore) return left.isCore ? -1 : 1;
            return left.productCode.localeCompare(right.productCode);
        });
}

function withImplicitCustomerBaseAccess(
    products: EffectiveCompanyProduct[],
): EffectiveCompanyProduct[] {
    if (products.some((product) => product.productCode === 'CRM')) {
        return products;
    }

    const implicitCrmBase: EffectiveCompanyProduct = {
        productCode: 'CRM',
        tierCode: 'CRM_BASE',
        status: CompanyProductSubscriptionStatus.ACTIVE,
        isCore: false,
        includedByDefault: true,
    };

    return [...products, implicitCrmBase].sort((left, right) => {
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
    if (state.activeSubscriptions.length === 0) {
        return getLegacyPlanFallbackEntitlements(state.plan, state.capabilityOverrides);
    }

    const products = withImplicitCustomerBaseAccess(
        getActiveModularProducts(state.activeSubscriptions),
    );
    assertAtLeastOneCoreProduct(products);

    const baseCapabilities = buildProductCapabilitiesFromTierCodes(
        products.map((product) => product.tierCode),
    );
    const productCapabilities = applyCapabilityOverrides(
        baseCapabilities,
        state.capabilityOverrides,
    );

    return buildEntitlementPayload({
        plan: state.plan,
        source: 'modular',
        products,
        productCapabilities,
    });
}

async function getCompanyEntitlementState(
    companyId: number,
    db: DbClient,
): Promise<CompanyEntitlementState> {
    const company = await db.company.findUnique({
        where: { id: companyId },
        select: {
            plan: true,
            product_subscriptions: {
                where: {
                    status: {
                        in: [
                            CompanyProductSubscriptionStatus.ACTIVE,
                            CompanyProductSubscriptionStatus.TRIALING,
                        ],
                    },
                    OR: [
                        { availableUntil: null },
                        { availableUntil: { gt: new Date() } },
                    ],
                },
                select: {
                    product: {
                        select: {
                            code: true,
                            isCoreProduct: true,
                        },
                    },
                    productTier: {
                        select: {
                            code: true,
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
                        { expiresAt: { gt: new Date() } },
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

    const overrideMap = new Map<ProductCapability, boolean>();

    for (const override of company.capability_overrides) {
        if (!overrideMap.has(override.capability)) {
            overrideMap.set(override.capability, override.value);
        }
    }

    return {
        plan: company.plan,
        activeSubscriptions: company.product_subscriptions.map((subscription) => ({
            productCode: subscription.product.code,
            tierCode: subscription.productTier.code,
            isCoreProduct: subscription.product.isCoreProduct,
            capabilityCodes: subscription.productTier.capabilities.map(
                (capability) => capability.capability,
            ),
        })),
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
        (product) => product.isCore && product.productCode === productCode,
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
