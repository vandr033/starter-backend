import {
    BusinessPricingProductKey,
    Prisma,
    type BusinessPricingBundleDiscountTier,
    type BusinessPricingProduct,
    type BusinessPricingSettings,
} from '@prisma/client';
import { prisma } from '../prisma/client';
import {
    DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS,
    DEFAULT_BUSINESS_PRICING_PRODUCTS,
    DEFAULT_BUSINESS_PRICING_SETTINGS,
    PUBLIC_ADD_ON_KEYS,
    PUBLIC_CORE_PRODUCT_KEYS,
    SELECTABLE_CORE_PRODUCT_KEYS,
    getDefaultTierForCoreProduct,
    isKnownPublicCoreProduct,
    isPublicCoreTierKey,
    isTierValidForCoreProduct,
    type BusinessPricingProductMetadata,
    type CoreProductTierDefault,
    type CoreProductTierSelection,
    type PublicAddOnKey,
    type PublicBusinessPricingProductKey,
    type PublicCoreProductKey,
    type PublicCoreTierKey,
    type SelectableCoreProductKey,
} from '../config/business-pricing';
import {
    PRODUCT_FEATURE_MATRIX,
    type ProductFeatureMatrixSection,
} from '../config/product-feature-matrix';

type BusinessPricingDbClient = Prisma.TransactionClient | typeof prisma;

export type PublicBusinessPricingTier = {
    tierKey: PublicCoreTierKey;
    label: 'Base' | 'Pro';
    monthlyPriceBs: number;
    featureList: string[];
    proUnlocks: string[];
    isDefault: boolean;
};

export type PublicBusinessPricingProduct = {
    key: PublicBusinessPricingProductKey;
    type: 'CORE' | 'ADDON';
    displayName: string;
    description: string;
    monthlyPriceBs: number;
    isActive: boolean;
    isComingSoon: boolean;
    sortOrder: number;
    featureList: string[];
    includedNote?: string;
    tiers?: PublicBusinessPricingTier[];
};

export type PublicBusinessPricingBundleTier = {
    id?: number;
    minSelectedItems: number;
    discountPercent: number;
    label: string;
    sortOrder?: number;
};

export type PublicBusinessPricingResponse = {
    products: PublicBusinessPricingProduct[];
    discounts: {
        bundleTiers: PublicBusinessPricingBundleTier[];
        annualDiscountPercent: number;
        trialLengthDays: number;
        firstMonthFree: boolean;
    };
};

export type SuperAdminBusinessPricingResponse = {
    products: Array<
        PublicBusinessPricingProduct & {
            metadata: Prisma.JsonValue | null;
        }
    >;
    discounts: {
        bundleTiers: Array<PublicBusinessPricingBundleTier & { id: number; isActive: boolean }>;
        annualDiscountPercent: number;
        trialLengthDays: number;
        firstMonthFree: boolean;
    };
};

export type UpdateBusinessPricingProductInput = {
    displayName?: string;
    monthlyPriceBs?: number;
    isActive?: boolean;
    isComingSoon?: boolean;
    sortOrder?: number;
    tiers?: Array<{
        tierKey: PublicCoreTierKey;
        monthlyPriceBs: number;
    }>;
};

export type UpdateBusinessPricingDiscountsInput = {
    bundleTiers: Array<{
        minSelectedItems: number;
        discountPercent: number;
        label: string;
        isActive: boolean;
        sortOrder: number;
    }>;
};

export type UpdateBusinessPricingSettingsInput = {
    annualDiscountPercent: number;
    trialLengthDays: number;
    firstMonthFree: boolean;
};

type BusinessPricingSnapshot = {
    products: BusinessPricingProduct[];
    bundleTiers: BusinessPricingBundleDiscountTier[];
    settings: BusinessPricingSettings;
};

export type PublicSelectablePricingState = {
    productsByKey: Map<PublicBusinessPricingProductKey, PublicBusinessPricingProduct>;
    selectableCoreProducts: Set<SelectableCoreProductKey>;
    selectableCoreTiers: Map<SelectableCoreProductKey, Set<PublicCoreTierKey>>;
    selectableAddOns: Set<PublicAddOnKey>;
    trialLengthDays: number;
    firstMonthFree: boolean;
};

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
}

function normalizeMetadata(
    metadata: Prisma.JsonValue | null | undefined,
): BusinessPricingProductMetadata {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return {};
    }

    const record = metadata as Record<string, unknown>;
    const tiers = Array.isArray(record.tiers)
        ? record.tiers.reduce<CoreProductTierDefault[]>((acc, rawEntry) => {
              if (!rawEntry || typeof rawEntry !== 'object') return acc;
              const entry = rawEntry as Record<string, unknown>;
              const tierKey = typeof entry.tierKey === 'string' ? entry.tierKey : '';
              if (!isPublicCoreTierKey(tierKey)) return acc;

              acc.push({
                  tierKey,
                  label: entry.label === 'Pro' ? 'Pro' : 'Base',
                  monthlyPriceBs: decimalToNumber(
                      entry.monthlyPriceBs as string | number | Prisma.Decimal | null | undefined,
                  ),
                  featureList: Array.isArray(entry.featureList)
                      ? entry.featureList.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
                      : [],
                  proUnlocks: Array.isArray(entry.proUnlocks)
                      ? entry.proUnlocks.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
                      : [],
                  isDefault: entry.isDefault === true,
              });

              return acc;
          }, [])
        : undefined;

    return {
        tiers,
        featureList: Array.isArray(record.featureList)
            ? record.featureList.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            : undefined,
        includedNote:
            typeof record.includedNote === 'string' && record.includedNote.trim().length > 0
                ? record.includedNote.trim()
                : undefined,
    };
}

function getDefaultProduct(productKey: PublicBusinessPricingProductKey) {
    return DEFAULT_BUSINESS_PRICING_PRODUCTS.find((product) => product.productKey === productKey) ?? null;
}

function resolveCoreTiers(product: BusinessPricingProduct, metadata: BusinessPricingProductMetadata): PublicBusinessPricingTier[] {
    const defaultProduct = getDefaultProduct(product.productKey as PublicBusinessPricingProductKey);
    const fallbackMetadata = defaultProduct?.metadata;
    const tierSource = metadata.tiers?.length
        ? metadata.tiers
        : fallbackMetadata?.tiers ?? [];

    return tierSource
        .filter((tier) =>
            isKnownPublicCoreProduct(product.productKey) &&
            product.productKey !== BusinessPricingProductKey.TIENDA &&
            isTierValidForCoreProduct(product.productKey as SelectableCoreProductKey, tier.tierKey),
        )
        .map((tier, index) => ({
            tierKey: tier.tierKey,
            label: tier.label,
            monthlyPriceBs: tier.monthlyPriceBs > 0 ? tier.monthlyPriceBs : decimalToNumber(product.monthlyPriceBs),
            featureList: tier.featureList,
            proUnlocks: tier.proUnlocks ?? [],
            isDefault: tier.isDefault === true || index === 0,
        }));
}

function toPublicProduct(product: BusinessPricingProduct): PublicBusinessPricingProduct {
    const metadata = normalizeMetadata(product.metadata);
    const tiers = product.type === 'CORE' ? resolveCoreTiers(product, metadata) : undefined;

    return {
        key: product.productKey as PublicBusinessPricingProductKey,
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

function toPublicBundleTier(tier: BusinessPricingBundleDiscountTier): PublicBusinessPricingBundleTier {
    return {
        id: tier.id,
        minSelectedItems: tier.minSelectedItems,
        discountPercent: decimalToNumber(tier.discountPercent),
        label: tier.label,
        sortOrder: tier.sortOrder,
    };
}

function buildFallbackPublicPricingResponse(): PublicBusinessPricingResponse {
    return {
        products: DEFAULT_BUSINESS_PRICING_PRODUCTS
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
            bundleTiers: DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS.map((tier) => ({
                minSelectedItems: tier.minSelectedItems,
                discountPercent: tier.discountPercent,
                label: tier.label,
                sortOrder: tier.sortOrder,
            })),
            annualDiscountPercent: DEFAULT_BUSINESS_PRICING_SETTINGS.annualDiscountPercent,
            trialLengthDays: DEFAULT_BUSINESS_PRICING_SETTINGS.trialLengthDays,
            firstMonthFree: DEFAULT_BUSINESS_PRICING_SETTINGS.firstMonthFree,
        },
    };
}

export async function ensureBusinessPricingDefaults(
    db: BusinessPricingDbClient = prisma,
): Promise<void> {
    const existingProducts = await db.businessPricingProduct.findMany({
        select: {
            productKey: true,
        },
    });

    const existingProductKeys = new Set(existingProducts.map((product) => product.productKey));
    const missingProducts = DEFAULT_BUSINESS_PRICING_PRODUCTS.filter(
        (product) => !existingProductKeys.has(product.productKey),
    );

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
                metadata: product.metadata as Prisma.InputJsonValue | undefined,
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
    const missingBundleTiers = DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS.filter(
        (tier) => !existingTierMinimums.has(tier.minSelectedItems),
    );

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
                annualDiscountPercent: DEFAULT_BUSINESS_PRICING_SETTINGS.annualDiscountPercent,
                trialLengthDays: DEFAULT_BUSINESS_PRICING_SETTINGS.trialLengthDays,
                firstMonthFree: DEFAULT_BUSINESS_PRICING_SETTINGS.firstMonthFree,
            },
        });
    }
}

async function readBusinessPricingSnapshot(
    db: BusinessPricingDbClient = prisma,
): Promise<BusinessPricingSnapshot> {
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
            annualDiscountPercent: new Prisma.Decimal(
                DEFAULT_BUSINESS_PRICING_SETTINGS.annualDiscountPercent,
            ),
            trialLengthDays: DEFAULT_BUSINESS_PRICING_SETTINGS.trialLengthDays,
            firstMonthFree: DEFAULT_BUSINESS_PRICING_SETTINGS.firstMonthFree,
            createdAt: new Date(0),
            updatedAt: new Date(0),
        },
    };
}

export async function getPublicBusinessPricing(): Promise<PublicBusinessPricingResponse> {
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
                annualDiscountPercent: decimalToNumber(
                    snapshot.settings.annualDiscountPercent,
                ),
                trialLengthDays: snapshot.settings.trialLengthDays,
                firstMonthFree: snapshot.settings.firstMonthFree,
            },
        };
    } catch (error) {
        console.error('Error loading public business pricing:', error);
        return buildFallbackPublicPricingResponse();
    }
}

export async function getSuperAdminBusinessPricing(): Promise<SuperAdminBusinessPricingResponse> {
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

function mergeTierPricing(
    productKey: PublicBusinessPricingProductKey,
    currentMetadata: Prisma.JsonValue | null,
    nextTiers: UpdateBusinessPricingProductInput['tiers'],
): Prisma.InputJsonValue | undefined {
    const metadata = normalizeMetadata(currentMetadata);
    const currentTiers = metadata.tiers ?? getDefaultProduct(productKey)?.metadata?.tiers ?? [];

    if (!nextTiers || nextTiers.length === 0) {
        return {
            ...metadata,
            tiers: currentTiers,
        } as Prisma.InputJsonValue;
    }

    const priceByTier = new Map(nextTiers.map((tier) => [tier.tierKey, tier.monthlyPriceBs]));
    const mergedTiers = currentTiers.map((tier) => ({
        ...tier,
        monthlyPriceBs: priceByTier.get(tier.tierKey) ?? tier.monthlyPriceBs,
    }));

    return {
        ...metadata,
        tiers: mergedTiers,
    } as Prisma.InputJsonValue;
}

export async function updateBusinessPricingProduct(
    productKey: PublicBusinessPricingProductKey,
    input: UpdateBusinessPricingProductInput,
): Promise<SuperAdminBusinessPricingResponse> {
    await prisma.$transaction(async (tx) => {
        await ensureBusinessPricingDefaults(tx);

        const existing = await tx.businessPricingProduct.findUnique({
            where: {
                productKey: productKey as BusinessPricingProductKey,
            },
            select: {
                metadata: true,
                type: true,
            },
        });

        const nextMetadata =
            existing?.type === 'CORE'
                ? mergeTierPricing(productKey, existing.metadata, input.tiers)
                : existing?.metadata
                    ? (existing.metadata as Prisma.InputJsonValue)
                    : undefined;

        await tx.businessPricingProduct.update({
            where: {
                productKey: productKey as BusinessPricingProductKey,
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

export async function updateBusinessPricingDiscounts(
    input: UpdateBusinessPricingDiscountsInput,
): Promise<SuperAdminBusinessPricingResponse> {
    await prisma.$transaction(async (tx) => {
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

export async function updateBusinessPricingSettings(
    input: UpdateBusinessPricingSettingsInput,
): Promise<SuperAdminBusinessPricingResponse> {
    await prisma.$transaction(async (tx) => {
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

export async function getSuperAdminProductFeatures(): Promise<{
    sections: ProductFeatureMatrixSection[];
}> {
    return {
        sections: PRODUCT_FEATURE_MATRIX,
    };
}

export async function getPublicSelectablePricingState(): Promise<PublicSelectablePricingState> {
    const pricing = await getPublicBusinessPricing();
    const productsByKey = new Map(
        pricing.products.map((product) => [product.key, product]),
    );

    const selectableCoreProducts = new Set<SelectableCoreProductKey>();
    const selectableCoreTiers = new Map<SelectableCoreProductKey, Set<PublicCoreTierKey>>();

    for (const key of SELECTABLE_CORE_PRODUCT_KEYS) {
        const product = productsByKey.get(key);
        if (!product?.isActive || product.isComingSoon) continue;
        selectableCoreProducts.add(key);

        const tiers = product.tiers?.length
            ? product.tiers
            : [{
                tierKey: getDefaultTierForCoreProduct(key),
            }];

        selectableCoreTiers.set(
            key,
            new Set(
                tiers
                    .map((tier) => tier.tierKey)
                    .filter((tierKey): tierKey is PublicCoreTierKey => isTierValidForCoreProduct(key, tierKey)),
            ),
        );
    }

    const selectableAddOns = new Set<PublicAddOnKey>(
        PUBLIC_ADD_ON_KEYS.filter((key) => {
            const product = productsByKey.get(key);
            return Boolean(product?.isActive && !product.isComingSoon);
        }),
    );

    return {
        productsByKey,
        selectableCoreProducts,
        selectableCoreTiers,
        selectableAddOns,
        trialLengthDays: pricing.discounts.trialLengthDays,
        firstMonthFree: pricing.discounts.firstMonthFree,
    };
}

export function isKnownPublicBusinessPricingProductKey(
    value: string,
): value is PublicBusinessPricingProductKey {
    return [...PUBLIC_CORE_PRODUCT_KEYS, ...PUBLIC_ADD_ON_KEYS].includes(
        value as PublicBusinessPricingProductKey,
    );
}

export function sanitizeCoreTierSelections(
    selections: readonly CoreProductTierSelection[],
): CoreProductTierSelection[] {
    const seen = new Set<string>();
    const next: CoreProductTierSelection[] = [];

    for (const selection of selections) {
        if (!isTierValidForCoreProduct(selection.productKey, selection.tierKey)) {
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

export function calculateTrialEndsAtFromDays(
    trialLengthDays: number,
    now: Date = new Date(),
): Date {
    return new Date(now.getTime() + trialLengthDays * 24 * 60 * 60 * 1000);
}
