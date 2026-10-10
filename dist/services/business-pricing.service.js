"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureBusinessPricingDefaults = ensureBusinessPricingDefaults;
exports.getPublicBusinessPricing = getPublicBusinessPricing;
exports.getSuperAdminBusinessPricing = getSuperAdminBusinessPricing;
exports.updateBusinessPricingProduct = updateBusinessPricingProduct;
exports.updateBusinessPricingDiscounts = updateBusinessPricingDiscounts;
exports.updateBusinessPricingSettings = updateBusinessPricingSettings;
exports.getSuperAdminProductFeatures = getSuperAdminProductFeatures;
exports.getPublicSelectablePricingState = getPublicSelectablePricingState;
exports.isKnownPublicBusinessPricingProductKey = isKnownPublicBusinessPricingProductKey;
exports.sanitizeCoreTierSelections = sanitizeCoreTierSelections;
exports.calculateTrialEndsAtFromDays = calculateTrialEndsAtFromDays;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const business_pricing_1 = require("../config/business-pricing");
const product_feature_matrix_1 = require("../config/product-feature-matrix");
function decimalToNumber(value) {
    if (value === null || value === undefined)
        return 0;
    return Number(value);
}
function normalizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return {};
    }
    const record = metadata;
    const tiers = Array.isArray(record.tiers)
        ? record.tiers.reduce((acc, rawEntry) => {
            if (!rawEntry || typeof rawEntry !== 'object')
                return acc;
            const entry = rawEntry;
            const tierKey = typeof entry.tierKey === 'string' ? entry.tierKey : '';
            if (!(0, business_pricing_1.isPublicCoreTierKey)(tierKey))
                return acc;
            acc.push({
                tierKey,
                label: entry.label === 'Pro' ? 'Pro' : 'Base',
                monthlyPriceBs: decimalToNumber(entry.monthlyPriceBs),
                featureList: Array.isArray(entry.featureList)
                    ? entry.featureList.filter((item) => typeof item === 'string' && item.trim().length > 0)
                    : [],
                proUnlocks: Array.isArray(entry.proUnlocks)
                    ? entry.proUnlocks.filter((item) => typeof item === 'string' && item.trim().length > 0)
                    : [],
                isDefault: entry.isDefault === true,
            });
            return acc;
        }, [])
        : undefined;
    return {
        tiers,
        featureList: Array.isArray(record.featureList)
            ? record.featureList.filter((item) => typeof item === 'string' && item.trim().length > 0)
            : undefined,
        includedNote: typeof record.includedNote === 'string' && record.includedNote.trim().length > 0
            ? record.includedNote.trim()
            : undefined,
    };
}
function getDefaultProduct(productKey) {
    return business_pricing_1.DEFAULT_BUSINESS_PRICING_PRODUCTS.find((product) => product.productKey === productKey) ?? null;
}
function resolveCoreTiers(product, metadata) {
    const defaultProduct = getDefaultProduct(product.productKey);
    const fallbackMetadata = defaultProduct?.metadata;
    const tierSource = metadata.tiers?.length
        ? metadata.tiers
        : fallbackMetadata?.tiers ?? [];
    return tierSource
        .filter((tier) => (0, business_pricing_1.isKnownPublicCoreProduct)(product.productKey) &&
        (0, business_pricing_1.isTierValidForCoreProduct)(product.productKey, tier.tierKey))
        .map((tier, index) => ({
        tierKey: tier.tierKey,
        label: tier.label,
        monthlyPriceBs: tier.monthlyPriceBs > 0 ? tier.monthlyPriceBs : decimalToNumber(product.monthlyPriceBs),
        featureList: tier.featureList,
        proUnlocks: tier.proUnlocks ?? [],
        isDefault: tier.isDefault === true || index === 0,
    }));
}
function toPublicProduct(product) {
    const metadata = normalizeMetadata(product.metadata);
    const tiers = product.type === 'CORE' ? resolveCoreTiers(product, metadata) : undefined;
    return {
        key: product.productKey,
        type: product.type,
        displayName: product.displayName,
        description: product.description?.trim() || '',
        monthlyPriceBs: tiers?.find((tier) => tier.isDefault)?.monthlyPriceBs ?? decimalToNumber(product.monthlyPriceBs),
        isActive: product.isActive,
        isComingSoon: product.isComingSoon,
        sortOrder: product.sortOrder,
        featureList: metadata.featureList ?? [],
        includedNote: metadata.includedNote,
        tiers,
    };
}
function toPublicBundleTier(tier) {
    return {
        id: tier.id,
        minSelectedItems: tier.minSelectedItems,
        discountPercent: decimalToNumber(tier.discountPercent),
        label: tier.label,
        sortOrder: tier.sortOrder,
    };
}
function buildFallbackPublicPricingResponse() {
    return {
        products: business_pricing_1.DEFAULT_BUSINESS_PRICING_PRODUCTS
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((product) => ({
            key: product.productKey,
            type: product.type,
            displayName: product.displayName,
            description: product.description,
            monthlyPriceBs: product.monthlyPriceBs,
            isActive: product.isActive,
            isComingSoon: product.isComingSoon,
            sortOrder: product.sortOrder,
            featureList: product.metadata?.featureList ?? [],
            includedNote: product.metadata?.includedNote,
            tiers: product.metadata?.tiers?.map((tier, index) => ({
                tierKey: tier.tierKey,
                label: tier.label,
                monthlyPriceBs: tier.monthlyPriceBs,
                featureList: tier.featureList,
                proUnlocks: tier.proUnlocks ?? [],
                isDefault: tier.isDefault === true || index === 0,
            })),
        })),
        discounts: {
            bundleTiers: business_pricing_1.DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS.map((tier) => ({
                minSelectedItems: tier.minSelectedItems,
                discountPercent: tier.discountPercent,
                label: tier.label,
                sortOrder: tier.sortOrder,
            })),
            annualDiscountPercent: business_pricing_1.DEFAULT_BUSINESS_PRICING_SETTINGS.annualDiscountPercent,
            trialLengthDays: business_pricing_1.DEFAULT_BUSINESS_PRICING_SETTINGS.trialLengthDays,
            firstMonthFree: business_pricing_1.DEFAULT_BUSINESS_PRICING_SETTINGS.firstMonthFree,
        },
    };
}
/**
 * Older long-running servers could seed the new Restaurant record before their
 * Prisma client had the RESTAURANTE enum value. MySQL then stored an empty enum
 * value, which Prisma rightfully refuses to deserialize. Repair it before any
 * typed read so pricing can recover even before the data migration is applied.
 */
async function repairInvalidRestaurantPricingProduct(db) {
    await db.$executeRaw `
        DELETE invalid_product
        FROM business_pricing_product AS invalid_product
        INNER JOIN business_pricing_product AS restaurant_product
          ON restaurant_product.product_key = 'RESTAURANTE'
        WHERE invalid_product.product_key = ''
    `;
    await db.$executeRaw `
        UPDATE business_pricing_product
        SET product_key = 'RESTAURANTE'
        WHERE product_key = ''
    `;
}
async function ensureBusinessPricingDefaults(db = client_2.prisma) {
    await repairInvalidRestaurantPricingProduct(db);
    const existingProducts = await db.businessPricingProduct.findMany({
        select: {
            productKey: true,
        },
    });
    const existingProductKeys = new Set(existingProducts.map((product) => product.productKey));
    const missingProducts = business_pricing_1.DEFAULT_BUSINESS_PRICING_PRODUCTS.filter((product) => !existingProductKeys.has(product.productKey));
    if (missingProducts.length > 0) {
        await db.businessPricingProduct.createMany({
            data: missingProducts.map((product) => ({
                productKey: product.productKey,
                type: product.type,
                displayName: product.displayName,
                description: product.description,
                monthlyPriceBs: product.monthlyPriceBs,
                isActive: product.isActive,
                isComingSoon: product.isComingSoon,
                sortOrder: product.sortOrder,
                metadata: product.metadata,
            })),
            skipDuplicates: true,
        });
    }
    const existingBundleTiers = await db.businessPricingBundleDiscountTier.findMany({
        select: {
            minSelectedItems: true,
        },
    });
    const existingTierMinimums = new Set(existingBundleTiers.map((tier) => tier.minSelectedItems));
    const missingBundleTiers = business_pricing_1.DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS.filter((tier) => !existingTierMinimums.has(tier.minSelectedItems));
    if (missingBundleTiers.length > 0) {
        await db.businessPricingBundleDiscountTier.createMany({
            data: missingBundleTiers.map((tier) => ({
                minSelectedItems: tier.minSelectedItems,
                discountPercent: tier.discountPercent,
                label: tier.label,
                isActive: tier.isActive,
                sortOrder: tier.sortOrder,
            })),
        });
    }
    const existingSettings = await db.businessPricingSettings.findUnique({
        where: { id: 1 },
        select: { id: true },
    });
    if (!existingSettings) {
        await db.businessPricingSettings.create({
            data: {
                id: 1,
                annualDiscountPercent: business_pricing_1.DEFAULT_BUSINESS_PRICING_SETTINGS.annualDiscountPercent,
                trialLengthDays: business_pricing_1.DEFAULT_BUSINESS_PRICING_SETTINGS.trialLengthDays,
                firstMonthFree: business_pricing_1.DEFAULT_BUSINESS_PRICING_SETTINGS.firstMonthFree,
            },
        });
    }
}
async function readBusinessPricingSnapshot(db = client_2.prisma) {
    await ensureBusinessPricingDefaults(db);
    const [products, bundleTiers, settings] = await Promise.all([
        db.businessPricingProduct.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        db.businessPricingBundleDiscountTier.findMany({
            orderBy: [{ sortOrder: 'asc' }, { minSelectedItems: 'asc' }, { createdAt: 'asc' }],
        }),
        db.businessPricingSettings.findUnique({
            where: { id: 1 },
        }),
    ]);
    return {
        products,
        bundleTiers,
        settings: settings ?? {
            id: 1,
            annualDiscountPercent: new client_1.Prisma.Decimal(business_pricing_1.DEFAULT_BUSINESS_PRICING_SETTINGS.annualDiscountPercent),
            trialLengthDays: business_pricing_1.DEFAULT_BUSINESS_PRICING_SETTINGS.trialLengthDays,
            firstMonthFree: business_pricing_1.DEFAULT_BUSINESS_PRICING_SETTINGS.firstMonthFree,
            createdAt: new Date(0),
            updatedAt: new Date(0),
        },
    };
}
async function getPublicBusinessPricing() {
    try {
        const snapshot = await readBusinessPricingSnapshot();
        return {
            products: snapshot.products.map(toPublicProduct),
            discounts: {
                bundleTiers: snapshot.bundleTiers
                    .filter((tier) => tier.isActive)
                    .map((tier) => ({
                    minSelectedItems: tier.minSelectedItems,
                    discountPercent: decimalToNumber(tier.discountPercent),
                    label: tier.label,
                    sortOrder: tier.sortOrder,
                })),
                annualDiscountPercent: decimalToNumber(snapshot.settings.annualDiscountPercent),
                trialLengthDays: snapshot.settings.trialLengthDays,
                firstMonthFree: snapshot.settings.firstMonthFree,
            },
        };
    }
    catch (error) {
        console.error('Error loading public business pricing:', error);
        return buildFallbackPublicPricingResponse();
    }
}
async function getSuperAdminBusinessPricing() {
    const snapshot = await readBusinessPricingSnapshot();
    return {
        products: snapshot.products.map((product) => ({
            ...toPublicProduct(product),
            metadata: product.metadata,
        })),
        discounts: {
            bundleTiers: snapshot.bundleTiers.map((tier) => ({
                id: tier.id,
                isActive: tier.isActive,
                ...toPublicBundleTier(tier),
            })),
            annualDiscountPercent: decimalToNumber(snapshot.settings.annualDiscountPercent),
            trialLengthDays: snapshot.settings.trialLengthDays,
            firstMonthFree: snapshot.settings.firstMonthFree,
        },
    };
}
function mergeTierPricing(productKey, currentMetadata, nextTiers) {
    const metadata = normalizeMetadata(currentMetadata);
    const currentTiers = metadata.tiers ?? getDefaultProduct(productKey)?.metadata?.tiers ?? [];
    if (!nextTiers || nextTiers.length === 0) {
        return {
            ...metadata,
            tiers: currentTiers,
        };
    }
    const priceByTier = new Map(nextTiers.map((tier) => [tier.tierKey, tier.monthlyPriceBs]));
    const mergedTiers = currentTiers.map((tier) => ({
        ...tier,
        monthlyPriceBs: priceByTier.get(tier.tierKey) ?? tier.monthlyPriceBs,
    }));
    return {
        ...metadata,
        tiers: mergedTiers,
    };
}
async function updateBusinessPricingProduct(productKey, input) {
    await client_2.prisma.$transaction(async (tx) => {
        await ensureBusinessPricingDefaults(tx);
        const existing = await tx.businessPricingProduct.findUnique({
            where: {
                productKey: productKey,
            },
            select: {
                metadata: true,
                type: true,
            },
        });
        const nextMetadata = existing?.type === 'CORE'
            ? mergeTierPricing(productKey, existing.metadata, input.tiers)
            : existing?.metadata
                ? existing.metadata
                : undefined;
        await tx.businessPricingProduct.update({
            where: {
                productKey: productKey,
            },
            data: {
                displayName: input.displayName?.trim(),
                monthlyPriceBs: input.monthlyPriceBs,
                isActive: input.isActive,
                isComingSoon: input.isComingSoon,
                sortOrder: input.sortOrder,
                metadata: nextMetadata,
            },
        });
    });
    return getSuperAdminBusinessPricing();
}
async function updateBusinessPricingDiscounts(input) {
    await client_2.prisma.$transaction(async (tx) => {
        await ensureBusinessPricingDefaults(tx);
        await tx.businessPricingBundleDiscountTier.deleteMany({});
        await tx.businessPricingBundleDiscountTier.createMany({
            data: input.bundleTiers.map((tier) => ({
                minSelectedItems: tier.minSelectedItems,
                discountPercent: tier.discountPercent,
                label: tier.label.trim(),
                isActive: tier.isActive,
                sortOrder: tier.sortOrder,
            })),
        });
    });
    return getSuperAdminBusinessPricing();
}
async function updateBusinessPricingSettings(input) {
    await client_2.prisma.$transaction(async (tx) => {
        await ensureBusinessPricingDefaults(tx);
        await tx.businessPricingSettings.upsert({
            where: { id: 1 },
            update: {
                annualDiscountPercent: input.annualDiscountPercent,
                trialLengthDays: input.trialLengthDays,
                firstMonthFree: input.firstMonthFree,
            },
            create: {
                id: 1,
                annualDiscountPercent: input.annualDiscountPercent,
                trialLengthDays: input.trialLengthDays,
                firstMonthFree: input.firstMonthFree,
            },
        });
    });
    return getSuperAdminBusinessPricing();
}
async function getSuperAdminProductFeatures() {
    return {
        sections: product_feature_matrix_1.PRODUCT_FEATURE_MATRIX,
    };
}
async function getPublicSelectablePricingState() {
    const pricing = await getPublicBusinessPricing();
    const productsByKey = new Map(pricing.products.map((product) => [product.key, product]));
    const selectableCoreProducts = new Set();
    const selectableCoreTiers = new Map();
    for (const key of business_pricing_1.SELECTABLE_CORE_PRODUCT_KEYS) {
        const product = productsByKey.get(key);
        if (!product?.isActive || product.isComingSoon)
            continue;
        selectableCoreProducts.add(key);
        const tiers = product.tiers?.length
            ? product.tiers
            : [{
                    tierKey: (0, business_pricing_1.getDefaultTierForCoreProduct)(key),
                }];
        selectableCoreTiers.set(key, new Set(tiers
            .map((tier) => tier.tierKey)
            .filter((tierKey) => (0, business_pricing_1.isTierValidForCoreProduct)(key, tierKey))));
    }
    const selectableAddOns = new Set(business_pricing_1.PUBLIC_ADD_ON_KEYS.filter((key) => {
        const product = productsByKey.get(key);
        return Boolean(product?.isActive && !product.isComingSoon);
    }));
    return {
        productsByKey,
        selectableCoreProducts,
        selectableCoreTiers,
        selectableAddOns,
        trialLengthDays: pricing.discounts.trialLengthDays,
        firstMonthFree: pricing.discounts.firstMonthFree,
    };
}
function isKnownPublicBusinessPricingProductKey(value) {
    return [...business_pricing_1.PUBLIC_CORE_PRODUCT_KEYS, ...business_pricing_1.PUBLIC_ADD_ON_KEYS].includes(value);
}
function sanitizeCoreTierSelections(selections) {
    const seen = new Set();
    const next = [];
    for (const selection of selections) {
        if (!(0, business_pricing_1.isTierValidForCoreProduct)(selection.productKey, selection.tierKey)) {
            continue;
        }
        if (seen.has(selection.productKey)) {
            continue;
        }
        seen.add(selection.productKey);
        next.push(selection);
    }
    return next;
}
function calculateTrialEndsAtFromDays(trialLengthDays, now = new Date()) {
    return new Date(now.getTime() + trialLengthDays * 24 * 60 * 60 * 1000);
}
