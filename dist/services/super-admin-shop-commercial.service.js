"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAutoIncludedAddonTier = isAutoIncludedAddonTier;
exports.buildLegacyFallbackActiveProducts = buildLegacyFallbackActiveProducts;
exports.mapLegacyPlanCompatibility = mapLegacyPlanCompatibility;
exports.normalizeCommercialConfiguration = normalizeCommercialConfiguration;
exports.serializeRequestedProductsSnapshot = serializeRequestedProductsSnapshot;
exports.parseRequestedProductsSnapshot = parseRequestedProductsSnapshot;
exports.buildActiveProductSnapshot = buildActiveProductSnapshot;
exports.diffActiveProducts = diffActiveProducts;
const client_1 = require("@prisma/client");
const product_entitlements_1 = require("../config/product-entitlements");
const DEFAULT_INCLUDED_ADDON_TIERS = {
    [client_1.ProductCode.CRM]: client_1.ProductTierCode.CRM_BASE,
    [client_1.ProductCode.PERSONALIZACION]: client_1.ProductTierCode.PERSONALIZACION_BASE,
    [client_1.ProductCode.MENSAJERIA]: client_1.ProductTierCode.MENSAJERIA_BASE,
    [client_1.ProductCode.RESERVAS]: client_1.ProductTierCode.RESERVAS_BASE,
    [client_1.ProductCode.EVENTOS]: client_1.ProductTierCode.EVENTOS_BASE,
    [client_1.ProductCode.CLASES]: client_1.ProductTierCode.CLASES_BASE,
    [client_1.ProductCode.STORES]: client_1.ProductTierCode.STORES_BASE,
    [client_1.ProductCode.RESTAURANTE]: client_1.ProductTierCode.RESTAURANTE_PRO,
    [client_1.ProductCode.METRICAS]: client_1.ProductTierCode.METRICAS_BASE,
    [client_1.ProductCode.MARKETPLACE]: client_1.ProductTierCode.MARKETPLACE_PLUS,
};
const AUTO_INCLUDED_ADDON_PRODUCTS = new Map([
    [client_1.ProductCode.CRM, client_1.ProductTierCode.CRM_BASE],
    [client_1.ProductCode.PERSONALIZACION, client_1.ProductTierCode.PERSONALIZACION_BASE],
    [client_1.ProductCode.MENSAJERIA, client_1.ProductTierCode.MENSAJERIA_BASE],
]);
function toDecimalString(value) {
    if (value === null || value === undefined)
        return null;
    return value.toString();
}
function isAutoIncludedAddonTier(tierCode) {
    return [...AUTO_INCLUDED_ADDON_PRODUCTS.values()].includes(tierCode);
}
function parseAvailableUntil(value) {
    if (!value)
        return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed;
}
function normalizeRequestedProducts(requestedProducts, activeProducts) {
    if (!requestedProducts || requestedProducts.length === 0)
        return [];
    const requestedByProduct = new Map();
    for (const product of requestedProducts) {
        const tierDefinition = (0, product_entitlements_1.getProductTierDefinition)(product.tierCode);
        if (tierDefinition.productCode !== product.productCode) {
            throw new Error(`Requested tier ${product.tierCode} does not belong to product ${product.productCode}.`);
        }
        if (activeProducts.has(product.productCode)) {
            throw new Error(`Product ${product.productCode} cannot be both active and requested at the same time.`);
        }
        if (requestedByProduct.has(product.productCode)) {
            throw new Error(`Requested product ${product.productCode} cannot be duplicated.`);
        }
        const productDefinition = (0, product_entitlements_1.getProductCatalogDefinition)(product.productCode);
        requestedByProduct.set(product.productCode, {
            productCode: product.productCode,
            productName: productDefinition.name,
            tierCode: product.tierCode,
            tierName: tierDefinition.name,
            isCoreProduct: productDefinition.isCoreProduct,
        });
    }
    return [...requestedByProduct.values()].sort((left, right) => left.productCode.localeCompare(right.productCode));
}
function buildNormalizedProduct(product, defaults, includedByDefault) {
    const tierDefinition = (0, product_entitlements_1.getProductTierDefinition)(product.tierCode);
    if (tierDefinition.productCode !== product.productCode) {
        throw new Error(`Tier ${product.tierCode} does not belong to product ${product.productCode}.`);
    }
    const availableUntil = parseAvailableUntil(product.availableUntil) ?? defaults.companyAvailableUntil;
    return {
        productCode: product.productCode,
        tierCode: product.tierCode,
        billingCycle: product.billingCycle ?? defaults.companyBillingCycle,
        pricePaid: product.pricePaid ?? defaults.companyPricePaid,
        currency: (product.currency ?? defaults.companyCurrency).trim(),
        availableUntil,
        isCoreProduct: (0, product_entitlements_1.isCoreTierCode)(product.tierCode),
        includedByDefault,
    };
}
function buildLegacyFallbackActiveProducts(params) {
    return product_entitlements_1.LEGACY_PLAN_BASE_PRODUCT_TIERS[params.legacyPlan].map((tierCode, index) => {
        const tierDefinition = (0, product_entitlements_1.getProductTierDefinition)(tierCode);
        return {
            productCode: tierDefinition.productCode,
            tierCode,
            billingCycle: params.companyBillingCycle,
            pricePaid: index === 0 ? params.companyPricePaid : null,
            currency: params.companyCurrency,
            availableUntil: params.companyAvailableUntil,
            isCoreProduct: (0, product_entitlements_1.isCoreTierCode)(tierCode),
            includedByDefault: isAutoIncludedAddonTier(tierCode),
        };
    });
}
function mapLegacyPlanCompatibility(activeProducts) {
    const tierCodes = activeProducts
        .map((product) => product.tierCode)
        .filter((tierCode) => !isAutoIncludedAddonTier(tierCode));
    const selectedTiers = new Set(tierCodes);
    const proAddonCount = [
        client_1.ProductTierCode.PERSONALIZACION_PLUS,
        client_1.ProductTierCode.CRM_PRO,
        client_1.ProductTierCode.MENSAJERIA_PRO,
        client_1.ProductTierCode.METRICAS_PRO,
        client_1.ProductTierCode.MARKETPLACE_PLUS,
    ].filter((tierCode) => selectedTiers.has(tierCode)).length;
    if (selectedTiers.has(client_1.ProductTierCode.CLASES_BASE) ||
        selectedTiers.has(client_1.ProductTierCode.CLASES_PRO) ||
        selectedTiers.has(client_1.ProductTierCode.EVENTOS_PRO) ||
        proAddonCount >= 2) {
        return client_1.ShopPlan.PRO;
    }
    if (selectedTiers.size === 1 &&
        selectedTiers.has(client_1.ProductTierCode.RESERVAS_BASE)) {
        return client_1.ShopPlan.STARTER;
    }
    if (selectedTiers.has(client_1.ProductTierCode.RESERVAS_PRO) ||
        selectedTiers.has(client_1.ProductTierCode.RESTAURANTE_PRO) ||
        selectedTiers.has(client_1.ProductTierCode.EVENTOS_BASE) ||
        proAddonCount >= 1) {
        return client_1.ShopPlan.BUSINESS;
    }
    if (selectedTiers.has(client_1.ProductTierCode.RESERVAS_BASE)) {
        return client_1.ShopPlan.STARTER;
    }
    return client_1.ShopPlan.BUSINESS;
}
function normalizeCommercialConfiguration(params) {
    if (params.activeProducts === undefined) {
        const legacyPlan = params.legacyPlan ?? client_1.ShopPlan.BUSINESS;
        const activeProducts = buildLegacyFallbackActiveProducts({
            legacyPlan,
            companyBillingCycle: params.companyBillingCycle,
            companyPricePaid: params.companyPricePaid,
            companyCurrency: params.companyCurrency,
            companyAvailableUntil: params.companyAvailableUntil,
        });
        return {
            source: 'legacy_plan',
            legacyPlan,
            activeProducts,
            requestedProducts: [],
        };
    }
    const normalizedActiveProducts = new Map();
    for (const product of params.activeProducts) {
        if (normalizedActiveProducts.has(product.productCode)) {
            throw new Error(`Active product ${product.productCode} cannot be duplicated.`);
        }
        normalizedActiveProducts.set(product.productCode, buildNormalizedProduct(product, params, false));
    }
    for (const [productCode, baseTierCode] of AUTO_INCLUDED_ADDON_PRODUCTS.entries()) {
        if (normalizedActiveProducts.has(productCode))
            continue;
        normalizedActiveProducts.set(productCode, buildNormalizedProduct({
            productCode,
            tierCode: baseTierCode,
            billingCycle: params.companyBillingCycle,
            pricePaid: null,
            currency: params.companyCurrency,
            availableUntil: params.companyAvailableUntil,
        }, params, true));
    }
    const activeProducts = [...normalizedActiveProducts.values()].sort((left, right) => {
        if (left.isCoreProduct !== right.isCoreProduct)
            return left.isCoreProduct ? -1 : 1;
        return left.productCode.localeCompare(right.productCode);
    });
    if (!activeProducts.some((product) => product.isCoreProduct)) {
        throw new Error('At least one core product must be active.');
    }
    const requestedProducts = normalizeRequestedProducts(params.requestedProducts, normalizedActiveProducts);
    return {
        source: 'modular',
        legacyPlan: mapLegacyPlanCompatibility(activeProducts),
        activeProducts,
        requestedProducts,
    };
}
function serializeRequestedProductsSnapshot(requestedProducts) {
    return {
        requestedProducts: requestedProducts.map((product) => ({ ...product })),
    };
}
function parseRequestedProductsSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
    }
    const requestedProducts = value.requestedProducts;
    if (!Array.isArray(requestedProducts))
        return [];
    return requestedProducts
        .filter((product) => !!product &&
        typeof product === 'object' &&
        typeof product.productCode === 'string' &&
        typeof product.tierCode === 'string')
        .map((product) => ({ ...product }));
}
function buildActiveProductSnapshot(product) {
    const productDefinition = (0, product_entitlements_1.getProductCatalogDefinition)(product.productCode);
    const tierDefinition = (0, product_entitlements_1.getProductTierDefinition)(product.tierCode);
    return {
        productCode: product.productCode,
        productName: productDefinition.name,
        tierCode: product.tierCode,
        tierName: tierDefinition.name,
        isCoreProduct: productDefinition.isCoreProduct,
        includedByDefault: product.includedByDefault,
        billingCycle: product.billingCycle,
        pricePaid: toDecimalString(product.pricePaid),
        currency: product.currency,
        availableUntil: product.availableUntil.toISOString(),
        status: client_1.CompanyProductSubscriptionStatus.ACTIVE,
    };
}
function diffActiveProducts(currentProducts, nextProducts) {
    const currentByProduct = new Map(currentProducts.map((product) => [product.productCode, product]));
    const nextByProduct = new Map(nextProducts.map((product) => [product.productCode, product]));
    const changes = [];
    for (const nextProduct of nextProducts) {
        const currentProduct = currentByProduct.get(nextProduct.productCode);
        const nextSnapshot = buildActiveProductSnapshot(nextProduct);
        if (!currentProduct) {
            changes.push({
                action: 'PRODUCT_ACTIVATED',
                previousValue: null,
                newValue: nextSnapshot,
            });
            continue;
        }
        const currentSnapshot = buildActiveProductSnapshot({
            productCode: currentProduct.productCode,
            tierCode: currentProduct.productTierCode,
            billingCycle: currentProduct.billingCycle ?? nextProduct.billingCycle,
            pricePaid: currentProduct.pricePaid,
            currency: currentProduct.currency ?? nextProduct.currency,
            availableUntil: currentProduct.availableUntil ?? nextProduct.availableUntil,
            includedByDefault: isAutoIncludedAddonTier(currentProduct.productTierCode),
        });
        if (currentProduct.productTierCode !== nextProduct.tierCode) {
            const previousTier = (0, product_entitlements_1.getProductTierDefinition)(currentProduct.productTierCode);
            const nextTier = (0, product_entitlements_1.getProductTierDefinition)(nextProduct.tierCode);
            changes.push({
                action: nextTier.tierLevel > previousTier.tierLevel
                    ? 'PRODUCT_UPGRADED'
                    : 'PRODUCT_DOWNGRADED',
                previousValue: currentSnapshot,
                newValue: nextSnapshot,
            });
            continue;
        }
        const billingChanged = (currentProduct.billingCycle ?? nextProduct.billingCycle) !== nextProduct.billingCycle;
        const priceChanged = toDecimalString(currentProduct.pricePaid) !== toDecimalString(nextProduct.pricePaid);
        const currencyChanged = (currentProduct.currency ?? nextProduct.currency) !== nextProduct.currency;
        const availabilityChanged = (currentProduct.availableUntil ?? nextProduct.availableUntil).getTime() !==
            nextProduct.availableUntil.getTime();
        if (billingChanged || priceChanged || currencyChanged || availabilityChanged) {
            changes.push({
                action: 'PRODUCT_UPDATED',
                previousValue: currentSnapshot,
                newValue: nextSnapshot,
            });
        }
    }
    for (const currentProduct of currentProducts) {
        if (nextByProduct.has(currentProduct.productCode))
            continue;
        changes.push({
            action: 'PRODUCT_CANCELLED',
            previousValue: buildActiveProductSnapshot({
                productCode: currentProduct.productCode,
                tierCode: currentProduct.productTierCode,
                billingCycle: currentProduct.billingCycle ?? client_1.BillingCycle.MONTHLY,
                pricePaid: currentProduct.pricePaid,
                currency: currentProduct.currency ?? '',
                availableUntil: currentProduct.availableUntil ?? new Date(),
                includedByDefault: isAutoIncludedAddonTier(currentProduct.productTierCode),
            }),
            newValue: null,
        });
    }
    return changes;
}
