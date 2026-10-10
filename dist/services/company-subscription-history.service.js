"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompanySubscriptionHistoryPayload = getCompanySubscriptionHistoryPayload;
const client_1 = require("@prisma/client");
const product_entitlements_1 = require("../config/product-entitlements");
const client_2 = require("../prisma/client");
const company_product_history_service_1 = require("./company-product-history.service");
const super_admin_shop_commercial_service_1 = require("./super-admin-shop-commercial.service");
const company_access_service_1 = require("./company-access.service");
function toDecimalString(value) {
    if (value === null || value === undefined)
        return null;
    return value.toString();
}
function toIsoString(value) {
    if (!value)
        return null;
    return value.toISOString();
}
function resolveActorDisplayName(actor) {
    const combined = `${actor.first_name ?? ''} ${actor.last_name ?? ''}`.trim();
    if (combined.length > 0)
        return combined;
    if (actor.name && actor.name.trim().length > 0)
        return actor.name.trim();
    return actor.email;
}
async function getCompanySubscriptionHistoryPayload(companyId, db = client_2.prisma) {
    const company = await db.company.findUnique({
        where: {
            id: companyId,
            deleted_at: null,
        },
        select: {
            id: true,
            name: true,
            plan: true,
            billingCycle: true,
            pricePaid: true,
            availableUntil: true,
            currency: true,
            isMarketplaceVisible: true,
            product_subscriptions: {
                include: {
                    product: {
                        select: {
                            code: true,
                            name: true,
                        },
                    },
                    productTier: {
                        select: {
                            code: true,
                            name: true,
                        },
                    },
                },
                orderBy: [
                    { product: { sortOrder: 'asc' } },
                    { productTier: { sortOrder: 'asc' } },
                ],
            },
        },
    });
    if (!company)
        return null;
    // The same resolver used by admin APIs and sessions is the source of truth
    // for the Super Admin product view. The history endpoint may still include
    // every configured row below, but never invents a different effective set.
    const effectiveAccess = await (0, company_access_service_1.resolveEffectiveCompanyAccess)({
        companyId: company.id,
        db,
    });
    const historyRows = await db.companySubscriptionHistory.findMany({
        where: {
            companyId: company.id,
        },
        include: {
            changedBy: {
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    name: true,
                },
            },
        },
        orderBy: [
            { changedAt: 'desc' },
            { id: 'desc' },
        ],
    });
    const history = historyRows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        previousPlan: row.previousPlan,
        newPlan: row.newPlan,
        previousBillingCycle: row.previousBillingCycle,
        newBillingCycle: row.newBillingCycle,
        previousPricePaid: toDecimalString(row.previousPricePaid),
        newPricePaid: toDecimalString(row.newPricePaid),
        previousAvailableUntil: toIsoString(row.previousAvailableUntil),
        newAvailableUntil: row.newAvailableUntil.toISOString(),
        previousMarketplaceVisible: row.previousMarketplaceVisible,
        newMarketplaceVisible: row.newMarketplaceVisible,
        changedByUserId: row.changedByUserId,
        changedBy: row.changedBy
            ? {
                id: row.changedBy.id,
                email: row.changedBy.email,
                firstName: row.changedBy.first_name,
                lastName: row.changedBy.last_name,
                displayName: resolveActorDisplayName(row.changedBy),
            }
            : null,
        changedAt: row.changedAt.toISOString(),
        note: row.note,
    }));
    const productHistoryRows = await db.companyProductHistory.findMany({
        where: {
            companyId: company.id,
        },
        include: {
            actorUser: {
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    name: true,
                },
            },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const productHistory = productHistoryRows.map((row) => ({
        ...(function buildFields() {
            const previous = (0, company_product_history_service_1.parseCompanyProductHistoryValue)(row.previousValue);
            const next = (0, company_product_history_service_1.parseCompanyProductHistoryValue)(row.newValue);
            return {
                source: (0, company_product_history_service_1.resolveCompanyProductHistorySource)({
                    previousValue: row.previousValue,
                    newValue: row.newValue,
                }),
                productCode: next?.productCode ?? previous?.productCode ?? null,
                previousTier: previous?.tierCode ?? null,
                newTier: next?.tierCode ?? null,
                previousStatus: previous?.requestStatus ?? previous?.status ?? null,
                newStatus: next?.requestStatus ?? next?.status ?? null,
                previousAvailableUntil: previous?.availableUntil ?? null,
                newAvailableUntil: next?.availableUntil ?? null,
                pricePaid: next?.pricePaid ?? previous?.pricePaid ?? null,
                billingCycle: typeof next?.billingCycle === 'string'
                    ? next.billingCycle
                    : typeof previous?.billingCycle === 'string'
                        ? previous.billingCycle
                        : null,
            };
        })(),
        id: row.id,
        companyId: row.companyId,
        action: row.action,
        previousValue: row.previousValue,
        newValue: row.newValue,
        actorUserId: row.actorUserId,
        actor: row.actorUser
            ? {
                id: row.actorUser.id,
                email: row.actorUser.email,
                firstName: row.actorUser.first_name,
                lastName: row.actorUser.last_name,
                displayName: resolveActorDisplayName(row.actorUser),
            }
            : null,
        createdAt: row.createdAt.toISOString(),
        timestamp: row.createdAt.toISOString(),
        note: row.note,
    }));
    const pendingRequestRows = await db.productAccessRequest.findMany({
        where: {
            companyId: company.id,
            status: client_1.ProductAccessRequestStatus.PENDING,
        },
        include: {
            requestedByUser: {
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    name: true,
                },
            },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const pendingRequests = pendingRequestRows.map((row) => ({
        id: row.id,
        productCode: row.productCode,
        productName: (0, product_entitlements_1.getProductCatalogDefinition)(row.productCode).name,
        tierCode: row.tierCode,
        tierName: (0, product_entitlements_1.getProductTierDefinition)(row.tierCode).name,
        capability: row.capability,
        status: row.status,
        source: row.source,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
        requestedByUserId: row.requestedByUserId,
        requestedBy: row.requestedByUser
            ? {
                id: row.requestedByUser.id,
                email: row.requestedByUser.email,
                firstName: row.requestedByUser.first_name,
                lastName: row.requestedByUser.last_name,
                displayName: resolveActorDisplayName(row.requestedByUser),
            }
            : null,
    }));
    const latestRequestedProducts = productHistoryRows.find((row) => row.action === 'REQUESTED_PRODUCTS_SET');
    const activeProducts = effectiveAccess.entitlements.products.map((product) => {
        const subscription = company.product_subscriptions.find((candidate) => candidate.product.code === product.productCode);
        return (0, super_admin_shop_commercial_service_1.buildActiveProductSnapshot)({
            productCode: product.productCode,
            tierCode: product.tierCode,
            billingCycle: subscription?.billingCycle ?? company.billingCycle,
            pricePaid: subscription?.pricePaid ?? (product.isCore ? company.pricePaid : null),
            currency: subscription?.currency ?? company.currency,
            availableUntil: subscription?.availableUntil ?? company.availableUntil,
            includedByDefault: product.includedByDefault,
        });
    });
    return {
        company: {
            id: company.id,
            name: company.name,
            plan: company.plan,
            legacyPlanCompatibility: company.plan,
            billingCycle: company.billingCycle,
            pricePaid: toDecimalString(company.pricePaid),
            availableUntil: company.availableUntil.toISOString(),
            isMarketplaceVisible: company.isMarketplaceVisible,
            isExpired: effectiveAccess.lifecycle.isExpired,
            activeProducts,
            requestedProducts: (0, super_admin_shop_commercial_service_1.parseRequestedProductsSnapshot)(latestRequestedProducts?.newValue),
            effectiveAccess,
        },
        history,
        productHistory,
        pendingRequests,
    };
}
