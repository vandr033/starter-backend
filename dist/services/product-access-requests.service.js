"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productAccessRequestDependencies = void 0;
exports.createAdminProductAccessRequest = createAdminProductAccessRequest;
exports.listAdminProductAccessRequests = listAdminProductAccessRequests;
exports.listSuperAdminProductAccessRequests = listSuperAdminProductAccessRequests;
exports.rejectProductAccessRequest = rejectProductAccessRequest;
exports.cancelProductAccessRequest = cancelProductAccessRequest;
exports.approveProductAccessRequest = approveProductAccessRequest;
exports.getPendingRequestForRecommendation = getPendingRequestForRecommendation;
exports.buildProductAccessForbiddenData = buildProductAccessForbiddenData;
exports.getFeatureProductAccessRecommendation = getFeatureProductAccessRecommendation;
const client_1 = require("@prisma/client");
const logger_1 = require("../config/logger");
const product_access_1 = require("../config/product-access");
const product_entitlements_1 = require("../config/product-entitlements");
const client_2 = require("../prisma/client");
const company_subscription_history_service_1 = require("./company-subscription-history.service");
const company_product_history_service_1 = require("./company-product-history.service");
const company_entitlements_service_1 = require("./company-entitlements.service");
const super_admin_shops_service_1 = require("./super-admin-shops.service");
exports.productAccessRequestDependencies = {
    getCompanyEntitlements: company_entitlements_service_1.getCompanyEntitlements,
    getCompanySubscriptionHistoryPayload: company_subscription_history_service_1.getCompanySubscriptionHistoryPayload,
    syncCompanyProducts: super_admin_shops_service_1.syncCompanyProducts,
};
function normalizeOptionalText(value, maxLength = 500) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return null;
    return trimmed.slice(0, maxLength);
}
function toFiniteNumber(value) {
    if (value === null)
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function buildListRowPayload(row) {
    const recommendation = (0, product_access_1.getProductAccessRecommendationForRequest)(row.productCode, row.tierCode, row.capability);
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
function buildRequestQueryWhere(input) {
    const where = {};
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
function assertRequestMatchesTier(params) {
    const tierDefinition = (0, product_entitlements_1.getProductTierDefinition)(params.tierCode);
    if (tierDefinition.productCode !== params.productCode) {
        throw new Error('Tier does not belong to the requested product.');
    }
    const tierCapabilities = (0, product_access_1.getTierCapabilities)(params.tierCode);
    if (!tierCapabilities.includes(params.capability)) {
        throw new Error('Capability does not belong to the requested tier.');
    }
}
function getProductTierLevel(tierCode) {
    return Number(tierCode.endsWith('_PRO') || tierCode.endsWith('_PLUS') ? 2 : 1);
}
function companyHasRequestedTierOrHigher(entitlements, productCode, tierCode) {
    const requestedLevel = getProductTierLevel(tierCode);
    return entitlements.products.some((product) => (product.productCode === productCode &&
        getProductTierLevel(product.tierCode) >= requestedLevel));
}
async function findPendingDuplicateRequest(companyId, productCode, tierCode, db) {
    return db.productAccessRequest.findFirst({
        where: {
            companyId,
            productCode,
            tierCode,
            status: client_1.ProductAccessRequestStatus.PENDING,
        },
        include: {
            company: true,
            requestedByUser: true,
            resolvedByUser: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
}
async function createAdminProductAccessRequest(input, db = client_2.prisma) {
    const capability = input.capability ?? (0, product_access_1.getDefaultCapabilityForTier)(input.tierCode);
    assertRequestMatchesTier({
        productCode: input.productCode,
        tierCode: input.tierCode,
        capability,
    });
    const entitlements = await exports.productAccessRequestDependencies.getCompanyEntitlements(input.companyId, db);
    if (companyHasRequestedTierOrHigher(entitlements, input.productCode, input.tierCode)) {
        return {
            code: 409,
            error: true,
            message: 'The requested product is already active for this company.',
        };
    }
    const duplicate = await findPendingDuplicateRequest(input.companyId, input.productCode, input.tierCode, db);
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
    logger_1.logger.info({
        event: 'product_access_request_created',
        requestId: created.id,
        companyId: created.companyId,
        productCode: created.productCode,
        tierCode: created.tierCode,
        capability: created.capability,
        requestedByUserId: created.requestedByUserId,
        source: created.source,
    }, 'Product access request created');
    return {
        code: 201,
        error: false,
        message: 'Product access request created successfully',
        data: {
            request: buildListRowPayload(created),
        },
    };
}
async function listAdminProductAccessRequests(input, db = client_2.prisma) {
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
async function listSuperAdminProductAccessRequests(input, db = client_2.prisma) {
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
async function updateRequestStatus(params) {
    const db = params.db ?? client_2.prisma;
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
    if (request.status !== client_1.ProductAccessRequestStatus.PENDING) {
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
    if (params.status === client_1.ProductAccessRequestStatus.REJECTED) {
        await (0, company_product_history_service_1.recordCompanyProductHistory)({
            db,
            companyId: request.companyId,
            action: 'REQUEST_REJECTED',
            previousValue: (0, company_product_history_service_1.buildCompanyProductHistorySnapshot)({
                productCode: request.productCode,
                tierCode: request.tierCode,
                status: request.status,
                capability: request.capability,
                source: request.source,
                requestId: request.id,
                requestedByUserId: request.requestedByUserId,
                requestStatus: request.status,
            }),
            newValue: (0, company_product_history_service_1.buildCompanyProductHistorySnapshot)({
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
            note: normalizeOptionalText(params.internalNote) ??
                `Rejected product access request #${updated.id}`,
        });
    }
    logger_1.logger.info({
        event: 'product_access_request_status_updated',
        requestId: updated.id,
        companyId: updated.companyId,
        status: updated.status,
        resolvedByUserId: updated.resolvedByUserId,
    }, 'Product access request status updated');
    return {
        code: 200,
        error: false,
        message: 'Product access request updated successfully',
        data: {
            request: buildListRowPayload(updated),
        },
    };
}
async function rejectProductAccessRequest(input, db = client_2.prisma) {
    return updateRequestStatus({
        requestId: input.requestId,
        status: client_1.ProductAccessRequestStatus.REJECTED,
        resolvedByUserId: input.resolvedByUserId,
        internalNote: input.internalNote,
        db,
    });
}
async function cancelProductAccessRequest(input, db = client_2.prisma) {
    return updateRequestStatus({
        requestId: input.requestId,
        status: client_1.ProductAccessRequestStatus.CANCELLED,
        resolvedByUserId: input.resolvedByUserId,
        internalNote: input.internalNote,
        db,
    });
}
async function approveProductAccessRequest(input, db = client_2.prisma) {
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
        if (request.status !== client_1.ProductAccessRequestStatus.PENDING) {
            return {
                code: 409,
                error: true,
                message: 'Only pending requests can be approved.',
            };
        }
        const subscriptionSnapshot = await exports.productAccessRequestDependencies.getCompanySubscriptionHistoryPayload(request.companyId, tx);
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
            billingCycle: company.billingCycle,
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
        const syncedCommercialConfiguration = await exports.productAccessRequestDependencies.syncCompanyProducts({
            tx,
            companyId: request.companyId,
            activeProducts,
            requestedProducts,
            companyBillingCycle: company.billingCycle,
            companyPricePaid: company.pricePaid === null || company.pricePaid === undefined
                ? null
                : Number(company.pricePaid.toString()),
            companyCurrency: company.currency,
            companyAvailableUntil: company.availableUntil,
            legacyPlan: company.plan,
            actorUserId: input.resolvedByUserId,
            source: request.source,
            note: normalizeOptionalText(input.internalNote) ??
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
                    note: normalizeOptionalText(input.internalNote) ??
                        `Approved product access request #${request.id}`,
                },
            });
        }
        const updatedRequest = await tx.productAccessRequest.update({
            where: { id: request.id },
            data: {
                status: client_1.ProductAccessRequestStatus.APPROVED,
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
        await (0, company_product_history_service_1.recordCompanyProductHistory)({
            db: tx,
            companyId: request.companyId,
            action: 'REQUEST_APPROVED',
            previousValue: (0, company_product_history_service_1.buildCompanyProductHistorySnapshot)({
                productCode: request.productCode,
                tierCode: request.tierCode,
                tierName: (0, product_entitlements_1.getProductTierDefinition)(request.tierCode).name,
                status: request.status,
                capability: request.capability,
                source: request.source,
                requestId: request.id,
                requestedByUserId: request.requestedByUserId,
                requestStatus: request.status,
            }),
            newValue: (0, company_product_history_service_1.buildCompanyProductHistorySnapshot)({
                productCode: updatedRequest.productCode,
                tierCode: updatedRequest.tierCode,
                tierName: (0, product_entitlements_1.getProductTierDefinition)(updatedRequest.tierCode).name,
                status: updatedRequest.status,
                capability: updatedRequest.capability,
                source: updatedRequest.source,
                requestId: updatedRequest.id,
                requestedByUserId: updatedRequest.requestedByUserId,
                requestStatus: updatedRequest.status,
            }),
            actorUserId: input.resolvedByUserId,
            source: updatedRequest.source,
            note: normalizeOptionalText(input.internalNote) ??
                `Approved product access request #${updatedRequest.id}`,
        });
        const entitlements = await exports.productAccessRequestDependencies.getCompanyEntitlements(company.id, tx);
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
        logger_1.logger.info({
            event: 'product_access_request_approved',
            requestId: input.requestId,
            resolvedByUserId: input.resolvedByUserId,
        }, 'Product access request approved');
    }
    return result;
}
async function getPendingRequestForRecommendation(companyId, recommendation, db = client_2.prisma) {
    const request = await findPendingDuplicateRequest(companyId, recommendation.productCode, recommendation.tierCode, db);
    return request ? buildListRowPayload(request) : null;
}
async function buildProductAccessForbiddenData(params) {
    const db = params.db ?? client_2.prisma;
    const entitlements = await exports.productAccessRequestDependencies.getCompanyEntitlements(params.companyId, db);
    const recommendation = (0, product_access_1.getProductAccessRecommendation)({
        feature: params.feature,
        capability: params.capability,
        entitlements,
    });
    if (!recommendation) {
        return null;
    }
    const pendingRequest = await getPendingRequestForRecommendation(params.companyId, recommendation, db);
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
async function getFeatureProductAccessRecommendation(params) {
    const db = params.db ?? client_2.prisma;
    const entitlements = await exports.productAccessRequestDependencies.getCompanyEntitlements(params.companyId, db);
    return (0, product_access_1.getProductAccessRecommendationForFeature)(params.feature, entitlements);
}
