import {
    BillingCycle,
    Prisma,
    ProductAccessRequestSource,
    ProductAccessRequestStatus,
} from '@prisma/client';
import { logger } from '../config/logger';
import {
    getDefaultCapabilityForTier,
    getProductAccessRecommendation,
    getProductAccessRecommendationForFeature,
    getProductAccessRecommendationForRequest,
    getTierCapabilities,
} from '../config/product-access';
import type {
    CompanyEntitlementPayload,
    ProductCapability,
    ProductCode,
    ProductTierCode,
} from '../config/product-entitlements';
import { getProductTierDefinition } from '../config/product-entitlements';
import type { PlanFeatureKey } from '../config/plan-capabilities';
import { prisma } from '../prisma/client';
import { getCompanySubscriptionHistoryPayload } from './company-subscription-history.service';
import {
    buildCompanyProductHistorySnapshot,
    recordCompanyProductHistory,
} from './company-product-history.service';
import { getCompanyEntitlements } from './company-entitlements.service';
import { syncCompanyProducts } from './super-admin-shops.service';

type DbClient = typeof prisma | Prisma.TransactionClient;

type CreateProductAccessRequestInput = {
    companyId: number;
    requestedByUserId: string;
    productCode: ProductCode;
    tierCode: ProductTierCode;
    capability?: ProductCapability | null;
    message?: string | null;
    source: ProductAccessRequestSource;
};

type ListAdminProductRequestsInput = {
    companyId: number;
    status?: ProductAccessRequestStatus;
    productCode?: ProductCode;
};

type ListSuperAdminProductRequestsInput = {
    companyId?: number;
    status?: ProductAccessRequestStatus;
    productCode?: ProductCode;
    search?: string;
    page?: number;
    limit?: number;
};

type ResolveProductAccessRequestInput = {
    requestId: number;
    resolvedByUserId: string;
    internalNote?: string | null;
};

type ProductRequestListRow = Prisma.ProductAccessRequestGetPayload<{
    include: {
        company: true;
        requestedByUser: true;
        resolvedByUser: true;
    };
}>;

export const productAccessRequestDependencies = {
    getCompanyEntitlements,
    getCompanySubscriptionHistoryPayload,
    syncCompanyProducts,
};

function normalizeOptionalText(value?: string | null, maxLength = 500): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return trimmed.slice(0, maxLength);
}

function toFiniteNumber(value: string | null): number | null {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildListRowPayload(row: ProductRequestListRow) {
    const recommendation = getProductAccessRecommendationForRequest(
        row.productCode,
        row.tierCode,
        row.capability,
    );

    return {
        id: row.id,
        companyId: row.companyId,
        productCode: row.productCode,
        tierCode: row.tierCode,
        capability: row.capability,
        status: row.status,
        message: row.message,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        internalNote: row.internalNote,
        company: row.company
            ? {
                id: row.company.id,
                name: row.company.name,
                slug: row.company.slug,
            }
            : null,
        requestedByUser: row.requestedByUser
            ? {
                id: row.requestedByUser.id,
                email: row.requestedByUser.email,
                name: row.requestedByUser.name,
                firstName: row.requestedByUser.first_name,
                lastName: row.requestedByUser.last_name,
            }
            : null,
        resolvedByUser: row.resolvedByUser
            ? {
                id: row.resolvedByUser.id,
                email: row.resolvedByUser.email,
                name: row.resolvedByUser.name,
                firstName: row.resolvedByUser.first_name,
                lastName: row.resolvedByUser.last_name,
            }
            : null,
        recommendation,
    };
}

function buildRequestQueryWhere(input: {
    companyId?: number;
    status?: ProductAccessRequestStatus;
    productCode?: ProductCode;
    search?: string;
}): Prisma.ProductAccessRequestWhereInput {
    const where: Prisma.ProductAccessRequestWhereInput = {};

    if (input.companyId) {
        where.companyId = input.companyId;
    }

    if (input.status) {
        where.status = input.status;
    }

    if (input.productCode) {
        where.productCode = input.productCode;
    }

    const search = normalizeOptionalText(input.search, 120);
    if (search) {
        where.OR = [
            { company: { name: { contains: search } } },
            { company: { slug: { contains: search } } },
            { requestedByUser: { email: { contains: search } } },
            { requestedByUser: { name: { contains: search } } },
            { message: { contains: search } },
        ];
    }

    return where;
}

function assertRequestMatchesTier(params: {
    productCode: ProductCode;
    tierCode: ProductTierCode;
    capability: ProductCapability;
}) {
    const tierDefinition = getProductTierDefinition(params.tierCode);
    if (tierDefinition.productCode !== params.productCode) {
        throw new Error('Tier does not belong to the requested product.');
    }

    const tierCapabilities = getTierCapabilities(params.tierCode);
    if (!tierCapabilities.includes(params.capability)) {
        throw new Error('Capability does not belong to the requested tier.');
    }
}

function getProductTierLevel(tierCode: ProductTierCode): number {
    return Number(tierCode.endsWith('_PRO') || tierCode.endsWith('_PLUS') ? 2 : 1);
}

function companyHasRequestedTierOrHigher(
    entitlements: CompanyEntitlementPayload,
    productCode: ProductCode,
    tierCode: ProductTierCode,
): boolean {
    const requestedLevel = getProductTierLevel(tierCode);
    return entitlements.products.some((product) => (
        product.productCode === productCode &&
        getProductTierLevel(product.tierCode) >= requestedLevel
    ));
}

async function findPendingDuplicateRequest(
    companyId: number,
    productCode: ProductCode,
    tierCode: ProductTierCode,
    db: DbClient,
) {
    return db.productAccessRequest.findFirst({
        where: {
            companyId,
            productCode,
            tierCode,
            status: ProductAccessRequestStatus.PENDING,
        },
        include: {
            company: true,
            requestedByUser: true,
            resolvedByUser: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
}

export async function createAdminProductAccessRequest(
    input: CreateProductAccessRequestInput,
    db: DbClient = prisma,
) {
    const capability = input.capability ?? getDefaultCapabilityForTier(input.tierCode);
    assertRequestMatchesTier({
        productCode: input.productCode,
        tierCode: input.tierCode,
        capability,
    });

    const entitlements = await productAccessRequestDependencies.getCompanyEntitlements(
        input.companyId,
        db,
    );
    if (companyHasRequestedTierOrHigher(entitlements, input.productCode, input.tierCode)) {
        return {
            code: 409,
            error: true,
            message: 'The requested product is already active for this company.',
        };
    }

    const duplicate = await findPendingDuplicateRequest(
        input.companyId,
        input.productCode,
        input.tierCode,
        db,
    );

    if (duplicate) {
        return {
            code: 409,
            error: true,
            message: 'A pending request already exists for this product.',
            data: {
                alreadyPending: true,
                request: buildListRowPayload(duplicate),
            },
        };
    }

    const created = await db.productAccessRequest.create({
        data: {
            companyId: input.companyId,
            requestedByUserId: input.requestedByUserId,
            productCode: input.productCode,
            tierCode: input.tierCode,
            capability,
            message: normalizeOptionalText(input.message),
            source: input.source,
        },
        include: {
            company: true,
            requestedByUser: true,
            resolvedByUser: true,
        },
    });

    logger.info(
        {
            event: 'product_access_request_created',
            requestId: created.id,
            companyId: created.companyId,
            productCode: created.productCode,
            tierCode: created.tierCode,
            capability: created.capability,
            requestedByUserId: created.requestedByUserId,
            source: created.source,
        },
        'Product access request created',
    );

    return {
        code: 201,
        error: false,
        message: 'Product access request created successfully',
        data: {
            request: buildListRowPayload(created),
        },
    };
}

export async function listAdminProductAccessRequests(
    input: ListAdminProductRequestsInput,
    db: DbClient = prisma,
) {
    const rows = await db.productAccessRequest.findMany({
        where: buildRequestQueryWhere(input),
        include: {
            company: true,
            requestedByUser: true,
            resolvedByUser: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return {
        code: 200,
        error: false,
        message: 'Product access requests retrieved successfully',
        data: {
            rows: rows.map(buildListRowPayload),
        },
    };
}

export async function listSuperAdminProductAccessRequests(
    input: ListSuperAdminProductRequestsInput,
    db: DbClient = prisma,
) {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const skip = (page - 1) * limit;
    const where = buildRequestQueryWhere(input);

    const [rows, total] = await Promise.all([
        db.productAccessRequest.findMany({
            where,
            include: {
                company: true,
                requestedByUser: true,
                resolvedByUser: true,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take: limit,
        }),
        db.productAccessRequest.count({ where }),
    ]);

    return {
        code: 200,
        error: false,
        message: 'Product access requests retrieved successfully',
        data: {
            rows: rows.map(buildListRowPayload),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        },
    };
}

async function updateRequestStatus(params: {
    requestId: number;
    status: ProductAccessRequestStatus;
    resolvedByUserId: string;
    internalNote?: string | null;
    db?: DbClient;
}) {
    const db = params.db ?? prisma;
    const request = await db.productAccessRequest.findUnique({
        where: { id: params.requestId },
        include: {
            company: true,
            requestedByUser: true,
            resolvedByUser: true,
        },
    });

    if (!request) {
        return {
            code: 404,
            error: true,
            message: 'Product access request not found',
        };
    }

    if (request.status !== ProductAccessRequestStatus.PENDING) {
        return {
            code: 409,
            error: true,
            message: 'Only pending requests can be updated.',
        };
    }

    const updated = await db.productAccessRequest.update({
        where: { id: request.id },
        data: {
            status: params.status,
            resolvedAt: new Date(),
            resolvedByUserId: params.resolvedByUserId,
            internalNote: normalizeOptionalText(params.internalNote),
        },
        include: {
            company: true,
            requestedByUser: true,
            resolvedByUser: true,
        },
    });

    if (params.status === ProductAccessRequestStatus.REJECTED) {
        await recordCompanyProductHistory({
            db,
            companyId: request.companyId,
            action: 'REQUEST_REJECTED',
            previousValue: buildCompanyProductHistorySnapshot({
                productCode: request.productCode,
                tierCode: request.tierCode,
                status: request.status,
                capability: request.capability,
                source: request.source,
                requestId: request.id,
                requestedByUserId: request.requestedByUserId,
                requestStatus: request.status,
            }),
            newValue: buildCompanyProductHistorySnapshot({
                productCode: request.productCode,
                tierCode: request.tierCode,
                status: updated.status,
                capability: updated.capability,
                source: updated.source,
                requestId: updated.id,
                requestedByUserId: updated.requestedByUserId,
                requestStatus: updated.status,
            }),
            actorUserId: params.resolvedByUserId,
            source: updated.source,
            note:
                normalizeOptionalText(params.internalNote) ??
                `Rejected product access request #${updated.id}`,
        });
    }

    logger.info(
        {
            event: 'product_access_request_status_updated',
            requestId: updated.id,
            companyId: updated.companyId,
            status: updated.status,
            resolvedByUserId: updated.resolvedByUserId,
        },
        'Product access request status updated',
    );

    return {
        code: 200,
        error: false,
        message: 'Product access request updated successfully',
        data: {
            request: buildListRowPayload(updated),
        },
    };
}

export async function rejectProductAccessRequest(
    input: ResolveProductAccessRequestInput,
    db: DbClient = prisma,
) {
    return updateRequestStatus({
        requestId: input.requestId,
        status: ProductAccessRequestStatus.REJECTED,
        resolvedByUserId: input.resolvedByUserId,
        internalNote: input.internalNote,
        db,
    });
}

export async function cancelProductAccessRequest(
    input: ResolveProductAccessRequestInput,
    db: DbClient = prisma,
) {
    return updateRequestStatus({
        requestId: input.requestId,
        status: ProductAccessRequestStatus.CANCELLED,
        resolvedByUserId: input.resolvedByUserId,
        internalNote: input.internalNote,
        db,
    });
}

export async function approveProductAccessRequest(
    input: ResolveProductAccessRequestInput,
    db: typeof prisma = prisma,
) {
    const result = await db.$transaction(async (tx) => {
        const request = await tx.productAccessRequest.findUnique({
            where: { id: input.requestId },
            include: {
                company: true,
                requestedByUser: true,
                resolvedByUser: true,
            },
        });

        if (!request) {
            return {
                code: 404,
                error: true,
                message: 'Product access request not found',
            };
        }

        if (request.status !== ProductAccessRequestStatus.PENDING) {
            return {
                code: 409,
                error: true,
                message: 'Only pending requests can be approved.',
            };
        }

        const subscriptionSnapshot =
            await productAccessRequestDependencies.getCompanySubscriptionHistoryPayload(
                request.companyId,
                tx,
            );
        const company = await tx.company.findUnique({
            where: { id: request.companyId },
            select: {
                id: true,
                plan: true,
                billingCycle: true,
                pricePaid: true,
                currency: true,
                availableUntil: true,
                isMarketplaceVisible: true,
            },
        });

        if (!subscriptionSnapshot || !company) {
            return {
                code: 404,
                error: true,
                message: 'Company not found',
            };
        }

        const activeProducts = subscriptionSnapshot.company.activeProducts
            .filter((product) => product.productCode !== request.productCode)
            .map((product) => ({
                productCode: product.productCode,
                tierCode: product.tierCode,
                billingCycle: product.billingCycle,
                pricePaid: toFiniteNumber(product.pricePaid),
                currency: product.currency,
                availableUntil: product.availableUntil,
            }));

        activeProducts.push({
            productCode: request.productCode,
            tierCode: request.tierCode,
            billingCycle: company.billingCycle as BillingCycle,
            pricePaid: toFiniteNumber(company.pricePaid?.toString() ?? null),
            currency: company.currency,
            availableUntil: company.availableUntil.toISOString(),
        });

        const requestedProducts = subscriptionSnapshot.company.requestedProducts
            .filter((product) => product.productCode !== request.productCode)
            .map((product) => ({
                productCode: product.productCode,
                tierCode: product.tierCode,
            }));

        const syncedCommercialConfiguration = await productAccessRequestDependencies.syncCompanyProducts({
            tx,
            companyId: request.companyId,
            activeProducts,
            requestedProducts,
            companyBillingCycle: company.billingCycle,
            companyPricePaid:
                company.pricePaid === null || company.pricePaid === undefined
                    ? null
                    : Number(company.pricePaid.toString()),
            companyCurrency: company.currency,
            companyAvailableUntil: company.availableUntil,
            legacyPlan: company.plan,
            actorUserId: input.resolvedByUserId,
            source: request.source,
            note:
                normalizeOptionalText(input.internalNote) ??
                `Approved product access request #${request.id}`,
        });

        if (syncedCommercialConfiguration.legacyPlan !== company.plan) {
            await tx.company.update({
                where: { id: company.id },
                data: {
                    plan: syncedCommercialConfiguration.legacyPlan,
                },
            });

            await tx.companySubscriptionHistory.create({
                data: {
                    companyId: company.id,
                    previousPlan: company.plan,
                    newPlan: syncedCommercialConfiguration.legacyPlan,
                    previousBillingCycle: company.billingCycle,
                    newBillingCycle: company.billingCycle,
                    previousPricePaid: company.pricePaid,
                    newPricePaid: company.pricePaid,
                    previousAvailableUntil: company.availableUntil,
                    newAvailableUntil: company.availableUntil,
                    previousMarketplaceVisible: company.isMarketplaceVisible,
                    newMarketplaceVisible: company.isMarketplaceVisible,
                    changedByUserId: input.resolvedByUserId,
                    note:
                        normalizeOptionalText(input.internalNote) ??
                        `Approved product access request #${request.id}`,
                },
            });
        }

        const updatedRequest = await tx.productAccessRequest.update({
            where: { id: request.id },
            data: {
                status: ProductAccessRequestStatus.APPROVED,
                resolvedAt: new Date(),
                resolvedByUserId: input.resolvedByUserId,
                internalNote: normalizeOptionalText(input.internalNote),
            },
            include: {
                company: true,
                requestedByUser: true,
                resolvedByUser: true,
            },
        });

        await recordCompanyProductHistory({
            db: tx,
            companyId: request.companyId,
            action: 'REQUEST_APPROVED',
            previousValue: buildCompanyProductHistorySnapshot({
                productCode: request.productCode,
                tierCode: request.tierCode,
                tierName: getProductTierDefinition(request.tierCode).name,
                status: request.status,
                capability: request.capability,
                source: request.source,
                requestId: request.id,
                requestedByUserId: request.requestedByUserId,
                requestStatus: request.status,
            }),
            newValue: buildCompanyProductHistorySnapshot({
                productCode: updatedRequest.productCode,
                tierCode: updatedRequest.tierCode,
                tierName: getProductTierDefinition(updatedRequest.tierCode).name,
                status: updatedRequest.status,
                capability: updatedRequest.capability,
                source: updatedRequest.source,
                requestId: updatedRequest.id,
                requestedByUserId: updatedRequest.requestedByUserId,
                requestStatus: updatedRequest.status,
            }),
            actorUserId: input.resolvedByUserId,
            source: updatedRequest.source,
            note:
                normalizeOptionalText(input.internalNote) ??
                `Approved product access request #${updatedRequest.id}`,
        });

        const entitlements = await productAccessRequestDependencies.getCompanyEntitlements(
            company.id,
            tx,
        );

        return {
            code: 200,
            error: false,
            message: 'Product access request approved successfully',
            data: {
                request: buildListRowPayload(updatedRequest),
                entitlements,
            },
        };
    });

    if (!result.error) {
        logger.info(
            {
                event: 'product_access_request_approved',
                requestId: input.requestId,
                resolvedByUserId: input.resolvedByUserId,
            },
            'Product access request approved',
        );
    }

    return result;
}

export async function getPendingRequestForRecommendation(
    companyId: number,
    recommendation: { productCode: ProductCode; tierCode: ProductTierCode },
    db: DbClient = prisma,
) {
    const request = await findPendingDuplicateRequest(
        companyId,
        recommendation.productCode,
        recommendation.tierCode,
        db,
    );

    return request ? buildListRowPayload(request) : null;
}

export async function buildProductAccessForbiddenData(params: {
    companyId: number;
    feature?: PlanFeatureKey;
    capability?: ProductCapability | null;
    db?: DbClient;
}) {
    const db = params.db ?? prisma;
    const entitlements = await productAccessRequestDependencies.getCompanyEntitlements(
        params.companyId,
        db,
    );
    const recommendation = getProductAccessRecommendation({
        feature: params.feature,
        capability: params.capability,
        entitlements,
    });

    if (!recommendation) {
        return null;
    }

    const pendingRequest = await getPendingRequestForRecommendation(
        params.companyId,
        recommendation,
        db,
    );

    return {
        missingCapability: recommendation.capability,
        recommendedProductCode: recommendation.productCode,
        recommendedTierCode: recommendation.tierCode,
        recommendedProductName: recommendation.productName,
        recommendedTierName: recommendation.tierName,
        ctaLabel: recommendation.ctaLabel,
        requestLabel: recommendation.requestLabel,
        title: recommendation.title,
        description: recommendation.description,
        requiresLabel: recommendation.requiresLabel,
        pendingRequest,
        hasPendingRequest: Boolean(pendingRequest),
    };
}

export async function getFeatureProductAccessRecommendation(params: {
    companyId: number;
    feature: PlanFeatureKey;
    db?: DbClient;
}) {
    const db = params.db ?? prisma;
    const entitlements = await productAccessRequestDependencies.getCompanyEntitlements(
        params.companyId,
        db,
    );
    return getProductAccessRecommendationForFeature(params.feature, entitlements);
}
