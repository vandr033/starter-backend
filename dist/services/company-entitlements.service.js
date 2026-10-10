"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLegacyPlanFallbackEntitlements = getLegacyPlanFallbackEntitlements;
exports.resolveCompanyEntitlementsFromState = resolveCompanyEntitlementsFromState;
exports.getCompanyEntitlementState = getCompanyEntitlementState;
exports.getCompanyEntitlements = getCompanyEntitlements;
exports.companyHasCapability = companyHasCapability;
exports.companyHasCoreProduct = companyHasCoreProduct;
exports.getCompanyProducts = getCompanyProducts;
exports.getEnabledCapabilitiesFromEntitlements = getEnabledCapabilitiesFromEntitlements;
exports.getEmptyProductCapabilities = getEmptyProductCapabilities;
exports.getAllProductCapabilities = getAllProductCapabilities;
const client_1 = require("@prisma/client");
const plan_capabilities_1 = require("../config/plan-capabilities");
const product_entitlements_1 = require("../config/product-entitlements");
const client_2 = require("../prisma/client");
function buildActiveProductLists(products) {
    return {
        activeCoreProducts: products
            .filter((product) => product.isCore &&
            (product.status === client_1.CompanyProductSubscriptionStatus.ACTIVE ||
                product.status === client_1.CompanyProductSubscriptionStatus.TRIALING))
            .map((product) => product.tierCode),
        activeAddOns: products
            .filter((product) => !product.isCore &&
            (product.status === client_1.CompanyProductSubscriptionStatus.ACTIVE ||
                product.status === client_1.CompanyProductSubscriptionStatus.TRIALING))
            .map((product) => product.tierCode),
    };
}
function buildFeatureRecord(productCapabilities) {
    return Object.keys(plan_capabilities_1.FEATURE_REQUIRED_PLAN).reduce((acc, feature) => {
        acc[feature] = (0, product_entitlements_1.resolveLegacyFeatureFromCapabilities)(feature, productCapabilities);
        return acc;
    }, {});
}
function applyCapabilityOverrides(capabilities, overrides) {
    if (overrides.length === 0) {
        return capabilities;
    }
    const next = { ...capabilities };
    for (const override of overrides) {
        next[override.capability] = override.value;
    }
    return next;
}
function buildEntitlementPayload(params) {
    const { activeCoreProducts, activeAddOns } = buildActiveProductLists(params.products);
    const features = buildFeatureRecord(params.productCapabilities);
    return {
        version: 1,
        currentPlan: params.plan,
        // `Company.plan` remains the compatibility field until the frontend and
        // remaining route guards migrate to the modular commercial records.
        maxStaffMembers: (0, plan_capabilities_1.getPlanStaffLimit)(params.plan),
        features,
        requiredPlans: { ...plan_capabilities_1.FEATURE_REQUIRED_PLAN },
        source: params.source,
        productCapabilities: { ...params.productCapabilities },
        products: params.products.map((product) => ({ ...product })),
        activeCoreProducts,
        activeAddOns,
    };
}
function getLegacyPlanFallbackEntitlements(plan, overrides = []) {
    const products = (0, product_entitlements_1.buildEffectiveProductsFromTiers)(product_entitlements_1.LEGACY_PLAN_BASE_PRODUCT_TIERS[plan]);
    const baseCapabilities = (0, product_entitlements_1.buildProductCapabilitiesFromTierCodes)(product_entitlements_1.LEGACY_PLAN_BASE_PRODUCT_TIERS[plan], product_entitlements_1.LEGACY_PLAN_EXTRA_CAPABILITIES[plan]);
    const productCapabilities = applyCapabilityOverrides(baseCapabilities, overrides);
    return buildEntitlementPayload({
        plan,
        source: 'legacy_plan',
        products,
        productCapabilities,
    });
}
function getActiveModularProducts(activeSubscriptions) {
    return [...activeSubscriptions]
        .map((subscription) => ({
        productCode: subscription.productCode,
        tierCode: subscription.tierCode,
        status: subscription.status,
        isCore: subscription.isCoreProduct,
        includedByDefault: (0, product_entitlements_1.isIncludedByDefaultTierCode)(subscription.tierCode),
    }))
        .sort((left, right) => {
        if (left.isCore !== right.isCore)
            return left.isCore ? -1 : 1;
        return left.productCode.localeCompare(right.productCode);
    });
}
function withImplicitBundledBaselineAccess(products, configuredProductCodes) {
    const bundledProducts = [
        {
            productCode: 'CRM',
            tierCode: 'CRM_BASE',
            status: client_1.CompanyProductSubscriptionStatus.ACTIVE,
            isCore: false,
            includedByDefault: true,
        },
        {
            productCode: 'PERSONALIZACION',
            tierCode: 'PERSONALIZACION_BASE',
            status: client_1.CompanyProductSubscriptionStatus.ACTIVE,
            isCore: false,
            includedByDefault: true,
        },
        {
            productCode: 'MENSAJERIA',
            tierCode: 'MENSAJERIA_BASE',
            status: client_1.CompanyProductSubscriptionStatus.ACTIVE,
            isCore: false,
            includedByDefault: true,
        },
    ];
    const nextProducts = [...products];
    for (const bundledProduct of bundledProducts) {
        const isConfigured = configuredProductCodes?.has(bundledProduct.productCode) ?? false;
        const isAlreadyEffective = nextProducts.some((product) => product.productCode === bundledProduct.productCode);
        if (!isConfigured && !isAlreadyEffective) {
            nextProducts.push(bundledProduct);
        }
    }
    return nextProducts.sort((left, right) => {
        if (left.isCore !== right.isCore)
            return left.isCore ? -1 : 1;
        return left.productCode.localeCompare(right.productCode);
    });
}
function assertAtLeastOneCoreProduct(products) {
    if (products.some((product) => product.isCore)) {
        return;
    }
    throw new Error('Invalid modular entitlement state: every company must have at least one active core product.');
}
function resolveCompanyEntitlementsFromState(state) {
    let entitlements;
    if (state.activeSubscriptions.length === 0) {
        if (state.hasModularSubscriptions) {
            entitlements = buildEntitlementPayload({
                plan: state.plan,
                source: 'modular',
                products: [],
                productCapabilities: (0, product_entitlements_1.getDefaultProductCapabilities)(),
            });
        }
        else {
            entitlements = getLegacyPlanFallbackEntitlements(state.plan, state.capabilityOverrides);
        }
    }
    else {
        const configuredProductCodes = new Set((state.configuredSubscriptions ?? []).map((subscription) => subscription.productCode));
        const products = withImplicitBundledBaselineAccess(getActiveModularProducts(state.activeSubscriptions), configuredProductCodes.size > 0 ? configuredProductCodes : undefined);
        assertAtLeastOneCoreProduct(products);
        const baseCapabilities = (0, product_entitlements_1.buildProductCapabilitiesFromTierCodes)(products.map((product) => product.tierCode));
        const productCapabilities = applyCapabilityOverrides(baseCapabilities, state.capabilityOverrides);
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
async function getCompanyEntitlementState(companyId, db, now = new Date()) {
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
    const configuredSubscriptions = company.product_subscriptions.map((subscription) => ({
        id: subscription.id,
        productCode: subscription.product.code,
        tierCode: subscription.productTier.code,
        status: subscription.status,
        isCoreProduct: subscription.product.isCoreProduct ?? (0, product_entitlements_1.isCoreProductCode)(subscription.product.code),
        capabilityCodes: (subscription.productTier.capabilities ?? []).map((capability) => capability.capability),
        startsAt: subscription.startsAt,
        availableUntil: subscription.availableUntil,
        cancelledAt: subscription.cancelledAt,
        productIsActive: subscription.product.isActive ?? true,
        tierIsActive: subscription.productTier.isActive ?? true,
    }));
    const isEffectiveSubscription = (subscription) => (subscription.status === client_1.CompanyProductSubscriptionStatus.ACTIVE ||
        subscription.status === client_1.CompanyProductSubscriptionStatus.TRIALING) &&
        !subscription.cancelledAt &&
        (!subscription.startsAt || subscription.startsAt.getTime() <= now.getTime()) &&
        (!subscription.availableUntil || subscription.availableUntil.getTime() >= now.getTime()) &&
        subscription.productIsActive !== false &&
        subscription.tierIsActive !== false;
    const overrideMap = new Map();
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
async function getCompanyEntitlements(companyId, db = client_2.prisma) {
    const state = await getCompanyEntitlementState(companyId, db);
    return resolveCompanyEntitlementsFromState(state);
}
async function companyHasCapability(companyId, capability, db = client_2.prisma) {
    const entitlements = await getCompanyEntitlements(companyId, db);
    return entitlements.productCapabilities[capability] === true;
}
async function companyHasCoreProduct(companyId, productCode, db = client_2.prisma) {
    if (!(0, product_entitlements_1.isCoreProductCode)(productCode)) {
        return false;
    }
    const entitlements = await getCompanyEntitlements(companyId, db);
    return entitlements.products.some((product) => product.isCore &&
        product.productCode === productCode &&
        (product.status === client_1.CompanyProductSubscriptionStatus.ACTIVE ||
            product.status === client_1.CompanyProductSubscriptionStatus.TRIALING));
}
async function getCompanyProducts(companyId, db = client_2.prisma) {
    const entitlements = await getCompanyEntitlements(companyId, db);
    return entitlements.products;
}
function getEnabledCapabilitiesFromEntitlements(entitlements) {
    return (0, product_entitlements_1.getEnabledProductCapabilities)(entitlements.productCapabilities);
}
function getEmptyProductCapabilities() {
    return (0, product_entitlements_1.getDefaultProductCapabilities)();
}
function getAllProductCapabilities() {
    return product_entitlements_1.PRODUCT_CAPABILITY_CODES;
}
