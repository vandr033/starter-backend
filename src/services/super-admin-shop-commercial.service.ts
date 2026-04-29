import {
    BillingCycle,
    CompanyProductSubscriptionStatus,
    Prisma,
    ProductCode,
    ProductTierCode,
    ShopPlan,
} from '@prisma/client';
import {
    getProductCatalogDefinition,
    getProductTierDefinition,
    isCoreTierCode,
    LEGACY_PLAN_BASE_PRODUCT_TIERS,
} from '../config/product-entitlements';

type DecimalLike = Prisma.Decimal | number | null | undefined;

export type CommercialProductInput = {
    productCode: ProductCode;
    tierCode: ProductTierCode;
    billingCycle?: BillingCycle | null;
    pricePaid?: number | null;
    currency?: string | null;
    availableUntil?: Date | string | null;
};

export type RequestedProductInput = {
    productCode: ProductCode;
    tierCode: ProductTierCode;
};

export type NormalizedCommercialProduct = {
    productCode: ProductCode;
    tierCode: ProductTierCode;
    billingCycle: BillingCycle;
    pricePaid: number | null;
    currency: string;
    availableUntil: Date;
    isCoreProduct: boolean;
    includedByDefault: boolean;
};

export type RequestedProductSnapshot = {
    productCode: ProductCode;
    productName: string;
    tierCode: ProductTierCode;
    tierName: string;
    isCoreProduct: boolean;
};

export type ActiveProductSnapshot = {
    productCode: ProductCode;
    productName: string;
    tierCode: ProductTierCode;
    tierName: string;
    isCoreProduct: boolean;
    includedByDefault: boolean;
    billingCycle: BillingCycle;
    pricePaid: string | null;
    currency: string;
    availableUntil: string;
    status: CompanyProductSubscriptionStatus;
};

export type ExistingCompanyProductRecord = {
    id?: number;
    productCode: ProductCode;
    productTierCode: ProductTierCode;
    billingCycle: BillingCycle | null;
    pricePaid: DecimalLike;
    currency: string | null;
    availableUntil: Date | null;
    startsAt?: Date;
    cancelledAt?: Date | null;
    status?: CompanyProductSubscriptionStatus;
};

export type ProductChangeAction =
    | 'PRODUCT_ACTIVATED'
    | 'PRODUCT_CANCELLED'
    | 'PRODUCT_UPGRADED'
    | 'PRODUCT_DOWNGRADED'
    | 'PRODUCT_UPDATED';

export type ProductChange = {
    action: ProductChangeAction;
    previousValue: ActiveProductSnapshot | null;
    newValue: ActiveProductSnapshot | null;
};

type NormalizeCommercialConfigParams = {
    activeProducts?: CommercialProductInput[];
    requestedProducts?: RequestedProductInput[];
    legacyPlan?: ShopPlan;
    companyBillingCycle: BillingCycle;
    companyPricePaid: number | null;
    companyCurrency: string;
    companyAvailableUntil: Date;
};

const DEFAULT_INCLUDED_ADDON_TIERS: Record<ProductCode, ProductTierCode> = {
    [ProductCode.CRM]: ProductTierCode.CRM_BASE,
    [ProductCode.PERSONALIZACION]: ProductTierCode.PERSONALIZACION_BASE,
    [ProductCode.MENSAJERIA]: ProductTierCode.MENSAJERIA_BASE,
    [ProductCode.RESERVAS]: ProductTierCode.RESERVAS_BASE,
    [ProductCode.EVENTOS]: ProductTierCode.EVENTOS_BASE,
    [ProductCode.CLASES]: ProductTierCode.CLASES_BASE,
    [ProductCode.METRICAS]: ProductTierCode.METRICAS_BASE,
    [ProductCode.MARKETPLACE]: ProductTierCode.MARKETPLACE_PLUS,
};

const AUTO_INCLUDED_ADDON_PRODUCTS = new Map<ProductCode, ProductTierCode>([
    [ProductCode.CRM, ProductTierCode.CRM_BASE],
    [ProductCode.PERSONALIZACION, ProductTierCode.PERSONALIZACION_BASE],
    [ProductCode.MENSAJERIA, ProductTierCode.MENSAJERIA_BASE],
]);

function toDecimalString(value: DecimalLike): string | null {
    if (value === null || value === undefined) return null;
    return value.toString();
}

export function isAutoIncludedAddonTier(tierCode: ProductTierCode): boolean {
    return [...AUTO_INCLUDED_ADDON_PRODUCTS.values()].includes(tierCode);
}

function parseAvailableUntil(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function normalizeRequestedProducts(
    requestedProducts: RequestedProductInput[] | undefined,
    activeProducts: Map<ProductCode, NormalizedCommercialProduct>,
): RequestedProductSnapshot[] {
    if (!requestedProducts || requestedProducts.length === 0) return [];

    const requestedByProduct = new Map<ProductCode, RequestedProductSnapshot>();

    for (const product of requestedProducts) {
        const tierDefinition = getProductTierDefinition(product.tierCode);
        if (tierDefinition.productCode !== product.productCode) {
            throw new Error(
                `Requested tier ${product.tierCode} does not belong to product ${product.productCode}.`,
            );
        }

        if (activeProducts.has(product.productCode)) {
            throw new Error(
                `Product ${product.productCode} cannot be both active and requested at the same time.`,
            );
        }

        if (requestedByProduct.has(product.productCode)) {
            throw new Error(`Requested product ${product.productCode} cannot be duplicated.`);
        }

        const productDefinition = getProductCatalogDefinition(product.productCode);
        requestedByProduct.set(product.productCode, {
            productCode: product.productCode,
            productName: productDefinition.name,
            tierCode: product.tierCode,
            tierName: tierDefinition.name,
            isCoreProduct: productDefinition.isCoreProduct,
        });
    }

    return [...requestedByProduct.values()].sort((left, right) =>
        left.productCode.localeCompare(right.productCode),
    );
}

function buildNormalizedProduct(
    product: CommercialProductInput,
    defaults: Pick<
        NormalizeCommercialConfigParams,
        'companyBillingCycle' | 'companyPricePaid' | 'companyCurrency' | 'companyAvailableUntil'
    >,
    includedByDefault: boolean,
): NormalizedCommercialProduct {
    const tierDefinition = getProductTierDefinition(product.tierCode);
    if (tierDefinition.productCode !== product.productCode) {
        throw new Error(`Tier ${product.tierCode} does not belong to product ${product.productCode}.`);
    }

    const availableUntil =
        parseAvailableUntil(product.availableUntil) ?? defaults.companyAvailableUntil;

    return {
        productCode: product.productCode,
        tierCode: product.tierCode,
        billingCycle: product.billingCycle ?? defaults.companyBillingCycle,
        pricePaid: product.pricePaid ?? defaults.companyPricePaid,
        currency: (product.currency ?? defaults.companyCurrency).trim(),
        availableUntil,
        isCoreProduct: isCoreTierCode(product.tierCode),
        includedByDefault,
    };
}

export function buildLegacyFallbackActiveProducts(params: {
    legacyPlan: ShopPlan;
    companyBillingCycle: BillingCycle;
    companyPricePaid: number | null;
    companyCurrency: string;
    companyAvailableUntil: Date;
}): NormalizedCommercialProduct[] {
    return LEGACY_PLAN_BASE_PRODUCT_TIERS[params.legacyPlan].map((tierCode, index) => {
        const tierDefinition = getProductTierDefinition(tierCode);
        return {
            productCode: tierDefinition.productCode,
            tierCode,
            billingCycle: params.companyBillingCycle,
            pricePaid: index === 0 ? params.companyPricePaid : null,
            currency: params.companyCurrency,
            availableUntil: params.companyAvailableUntil,
            isCoreProduct: isCoreTierCode(tierCode),
            includedByDefault: isAutoIncludedAddonTier(tierCode),
        };
    });
}

export function mapLegacyPlanCompatibility(
    activeProducts: Pick<NormalizedCommercialProduct, 'tierCode'>[],
): ShopPlan {
    const tierCodes = activeProducts
        .map((product) => product.tierCode)
        .filter((tierCode) => !isAutoIncludedAddonTier(tierCode));
    const selectedTiers = new Set(tierCodes);

    const proAddonCount = [
        ProductTierCode.PERSONALIZACION_PLUS,
        ProductTierCode.CRM_PRO,
        ProductTierCode.MENSAJERIA_PRO,
        ProductTierCode.METRICAS_PRO,
        ProductTierCode.MARKETPLACE_PLUS,
    ].filter((tierCode) => selectedTiers.has(tierCode)).length;

    if (
        selectedTiers.has(ProductTierCode.CLASES_BASE) ||
        selectedTiers.has(ProductTierCode.CLASES_PRO) ||
        selectedTiers.has(ProductTierCode.EVENTOS_PRO) ||
        proAddonCount >= 2
    ) {
        return ShopPlan.PRO;
    }

    if (
        selectedTiers.size === 1 &&
        selectedTiers.has(ProductTierCode.RESERVAS_BASE)
    ) {
        return ShopPlan.STARTER;
    }

    if (
        selectedTiers.has(ProductTierCode.RESERVAS_PRO) ||
        selectedTiers.has(ProductTierCode.EVENTOS_BASE) ||
        proAddonCount >= 1
    ) {
        return ShopPlan.BUSINESS;
    }

    if (selectedTiers.has(ProductTierCode.RESERVAS_BASE)) {
        return ShopPlan.STARTER;
    }

    return ShopPlan.BUSINESS;
}

export function normalizeCommercialConfiguration(
    params: NormalizeCommercialConfigParams,
): {
    source: 'legacy_plan' | 'modular';
    legacyPlan: ShopPlan;
    activeProducts: NormalizedCommercialProduct[];
    requestedProducts: RequestedProductSnapshot[];
} {
    if (params.activeProducts === undefined) {
        const legacyPlan = params.legacyPlan ?? ShopPlan.BUSINESS;
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

    const normalizedActiveProducts = new Map<ProductCode, NormalizedCommercialProduct>();

    for (const product of params.activeProducts) {
        if (normalizedActiveProducts.has(product.productCode)) {
            throw new Error(`Active product ${product.productCode} cannot be duplicated.`);
        }

        normalizedActiveProducts.set(
            product.productCode,
            buildNormalizedProduct(product, params, false),
        );
    }

    for (const [productCode, baseTierCode] of AUTO_INCLUDED_ADDON_PRODUCTS.entries()) {
        if (normalizedActiveProducts.has(productCode)) continue;

        normalizedActiveProducts.set(
            productCode,
            buildNormalizedProduct(
                {
                    productCode,
                    tierCode: baseTierCode,
                    billingCycle: params.companyBillingCycle,
                    pricePaid: null,
                    currency: params.companyCurrency,
                    availableUntil: params.companyAvailableUntil,
                },
                params,
                true,
            ),
        );
    }

    const activeProducts = [...normalizedActiveProducts.values()].sort((left, right) => {
        if (left.isCoreProduct !== right.isCoreProduct) return left.isCoreProduct ? -1 : 1;
        return left.productCode.localeCompare(right.productCode);
    });

    if (!activeProducts.some((product) => product.isCoreProduct)) {
        throw new Error('At least one core product must be active.');
    }

    const requestedProducts = normalizeRequestedProducts(
        params.requestedProducts,
        normalizedActiveProducts,
    );

    return {
        source: 'modular',
        legacyPlan: mapLegacyPlanCompatibility(activeProducts),
        activeProducts,
        requestedProducts,
    };
}

export function serializeRequestedProductsSnapshot(
    requestedProducts: RequestedProductSnapshot[],
): { requestedProducts: RequestedProductSnapshot[] } {
    return {
        requestedProducts: requestedProducts.map((product) => ({ ...product })),
    };
}

export function parseRequestedProductsSnapshot(
    value: Prisma.JsonValue | null | undefined,
): RequestedProductSnapshot[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
    }

    const requestedProducts = (value as { requestedProducts?: unknown }).requestedProducts;
    if (!Array.isArray(requestedProducts)) return [];

    return requestedProducts
        .filter(
            (product): product is RequestedProductSnapshot =>
                !!product &&
                typeof product === 'object' &&
                typeof (product as RequestedProductSnapshot).productCode === 'string' &&
                typeof (product as RequestedProductSnapshot).tierCode === 'string',
        )
        .map((product) => ({ ...product }));
}

export function buildActiveProductSnapshot(
    product: Pick<
        NormalizedCommercialProduct,
        | 'productCode'
        | 'tierCode'
        | 'billingCycle'
        | 'currency'
        | 'availableUntil'
        | 'includedByDefault'
    > & {
        pricePaid: DecimalLike;
    },
): ActiveProductSnapshot {
    const productDefinition = getProductCatalogDefinition(product.productCode);
    const tierDefinition = getProductTierDefinition(product.tierCode);

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
        status: CompanyProductSubscriptionStatus.ACTIVE,
    };
}

export function diffActiveProducts(
    currentProducts: ExistingCompanyProductRecord[],
    nextProducts: NormalizedCommercialProduct[],
): ProductChange[] {
    const currentByProduct = new Map<ProductCode, ExistingCompanyProductRecord>(
        currentProducts.map((product) => [product.productCode, product]),
    );
    const nextByProduct = new Map<ProductCode, NormalizedCommercialProduct>(
        nextProducts.map((product) => [product.productCode, product]),
    );
    const changes: ProductChange[] = [];

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
            const previousTier = getProductTierDefinition(currentProduct.productTierCode);
            const nextTier = getProductTierDefinition(nextProduct.tierCode);
            changes.push({
                action:
                    nextTier.tierLevel > previousTier.tierLevel
                        ? 'PRODUCT_UPGRADED'
                        : 'PRODUCT_DOWNGRADED',
                previousValue: currentSnapshot,
                newValue: nextSnapshot,
            });
            continue;
        }

        const billingChanged =
            (currentProduct.billingCycle ?? nextProduct.billingCycle) !== nextProduct.billingCycle;
        const priceChanged = toDecimalString(currentProduct.pricePaid) !== toDecimalString(nextProduct.pricePaid);
        const currencyChanged = (currentProduct.currency ?? nextProduct.currency) !== nextProduct.currency;
        const availabilityChanged =
            (currentProduct.availableUntil ?? nextProduct.availableUntil).getTime() !==
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
        if (nextByProduct.has(currentProduct.productCode)) continue;

        changes.push({
            action: 'PRODUCT_CANCELLED',
            previousValue: buildActiveProductSnapshot({
                productCode: currentProduct.productCode,
                tierCode: currentProduct.productTierCode,
                billingCycle: currentProduct.billingCycle ?? BillingCycle.MONTHLY,
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
