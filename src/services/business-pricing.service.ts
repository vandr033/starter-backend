import {
    BusinessPricingProductKey,
    BusinessPricingProductType,
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
    type PublicAddOnKey,
    type PublicCoreProductKey,
    type PublicBusinessPricingProductKey,
    type SelectableCoreProductKey,
} from '../config/business-pricing';

type BusinessPricingDbClient = Prisma.TransactionClient | typeof prisma;

export type PublicBusinessPricingProduct = {
    key: PublicBusinessPricingProductKey;
    type: 'CORE' | 'ADDON';
    displayName: string;
    description: string;
    monthlyPriceBs: number;
    isActive: boolean;
    isComingSoon: boolean;
    sortOrder: number;
};

export type PublicBusinessPricingBundleTier = {
    minSelectedItems: number;
    discountPercent: number;
    label: string;
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
};

export type UpdateBusinessPricingDiscountsInput = {
    bundleTiers: Array<{
        minSelectedItems: number;
        discountPercent: number;
        label: string;
        isActive: boolean;
    }>;
    annualDiscountPercent: number;
    trialLengthDays: number;
    firstMonthFree: boolean;
};

type BusinessPricingSnapshot = {
    products: BusinessPricingProduct[];
    bundleTiers: BusinessPricingBundleDiscountTier[];
    settings: BusinessPricingSettings;
};

type PublicSelectablePricingState = {
    productsByKey: Map<PublicBusinessPricingProductKey, PublicBusinessPricingProduct>;
    selectableCoreProducts: Set<SelectableCoreProductKey>;
    selectableAddOns: Set<PublicAddOnKey>;
    trialLengthDays: number;
    firstMonthFree: boolean;
};

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
}

function toPublicProduct(product: BusinessPricingProduct): PublicBusinessPricingProduct {
    return {
        key: product.productKey as PublicBusinessPricingProductKey,
        type: product.type,
        displayName: product.displayName,
        description: product.description?.trim() || '',
        monthlyPriceBs: decimalToNumber(product.monthlyPriceBs),
        isActive: product.isActive,
        isComingSoon: product.isComingSoon,
        sortOrder: product.sortOrder,
    };
}

function toPublicBundleTier(tier: BusinessPricingBundleDiscountTier): PublicBusinessPricingBundleTier {
    return {
        minSelectedItems: tier.minSelectedItems,
        discountPercent: decimalToNumber(tier.discountPercent),
        label: tier.label,
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
            })),
        discounts: {
            bundleTiers: DEFAULT_BUSINESS_PRICING_BUNDLE_TIERS.map((tier) => ({
                minSelectedItems: tier.minSelectedItems,
                discountPercent: tier.discountPercent,
                label: tier.label,
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
            orderBy: [{ minSelectedItems: 'asc' }, { createdAt: 'asc' }],
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
                    .map(toPublicBundleTier),
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

export async function updateBusinessPricingProduct(
    productKey: PublicBusinessPricingProductKey,
    input: UpdateBusinessPricingProductInput,
): Promise<SuperAdminBusinessPricingResponse> {
    await prisma.$transaction(async (tx) => {
        await ensureBusinessPricingDefaults(tx);

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
            })),
        });

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

export async function getPublicSelectablePricingState(): Promise<PublicSelectablePricingState> {
    const pricing = await getPublicBusinessPricing();
    const productsByKey = new Map(
        pricing.products.map((product) => [product.key, product]),
    );

    const selectableCoreProducts = new Set<SelectableCoreProductKey>(
        SELECTABLE_CORE_PRODUCT_KEYS.filter((key) => {
            const product = productsByKey.get(key);
            return Boolean(product?.isActive && !product.isComingSoon);
        }),
    );

    const selectableAddOns = new Set<PublicAddOnKey>(
        PUBLIC_ADD_ON_KEYS.filter((key) => {
            const product = productsByKey.get(key);
            return Boolean(product?.isActive && !product.isComingSoon);
        }),
    );

    return {
        productsByKey,
        selectableCoreProducts,
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

export function calculateTrialEndsAtFromDays(
    trialLengthDays: number,
    now: Date = new Date(),
): Date {
    return new Date(now.getTime() + trialLengthDays * 24 * 60 * 60 * 1000);
}
