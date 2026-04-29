import { Prisma, ProductAccessRequestStatus } from '@prisma/client';
import {
    getProductCatalogDefinition,
    getProductTierDefinition,
} from '../config/product-entitlements';
import { prisma } from '../prisma/client';
import {
    parseCompanyProductHistoryValue,
    resolveCompanyProductHistorySource,
} from './company-product-history.service';
import {
    buildActiveProductSnapshot,
    buildLegacyFallbackActiveProducts,
    isAutoIncludedAddonTier,
    parseRequestedProductsSnapshot,
    type ActiveProductSnapshot,
    type RequestedProductSnapshot,
} from './super-admin-shop-commercial.service';

type DbClient = typeof prisma | Prisma.TransactionClient;

interface SubscriptionHistoryActor {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
}

export interface CompanySubscriptionHistoryItem {
    id: number;
    companyId: number;
    previousPlan: 'STARTER' | 'BUSINESS' | 'PRO' | null;
    newPlan: 'STARTER' | 'BUSINESS' | 'PRO';
    previousBillingCycle: 'MONTHLY' | 'YEARLY' | null;
    newBillingCycle: 'MONTHLY' | 'YEARLY';
    previousPricePaid: string | null;
    newPricePaid: string | null;
    previousAvailableUntil: string | null;
    newAvailableUntil: string;
    previousMarketplaceVisible: boolean | null;
    newMarketplaceVisible: boolean;
    changedByUserId: string | null;
    changedBy: SubscriptionHistoryActor | null;
    changedAt: string;
    note: string | null;
}

export interface CompanySubscriptionSnapshot {
    id: number;
    name: string;
    plan: 'STARTER' | 'BUSINESS' | 'PRO';
    legacyPlanCompatibility: 'STARTER' | 'BUSINESS' | 'PRO';
    billingCycle: 'MONTHLY' | 'YEARLY';
    pricePaid: string | null;
    availableUntil: string;
    isMarketplaceVisible: boolean;
    isExpired: boolean;
    activeProducts: ActiveProductSnapshot[];
    requestedProducts: RequestedProductSnapshot[];
}

export interface CompanyProductHistoryItem {
    id: number;
    companyId: number;
    action: string;
    previousValue: Prisma.JsonValue | null;
    newValue: Prisma.JsonValue | null;
    actorUserId: string | null;
    actor: SubscriptionHistoryActor | null;
    createdAt: string;
    timestamp: string;
    note: string | null;
    source: string | null;
    productCode: string | null;
    previousTier: string | null;
    newTier: string | null;
    previousStatus: string | null;
    newStatus: string | null;
    previousAvailableUntil: string | null;
    newAvailableUntil: string | null;
    pricePaid: string | null;
    billingCycle: string | null;
}

export interface CompanyPendingProductRequestItem {
    id: number;
    productCode: string;
    productName: string;
    tierCode: string;
    tierName: string;
    capability: string;
    status: ProductAccessRequestStatus;
    source: string;
    message: string | null;
    createdAt: string;
    requestedByUserId: string;
    requestedBy: SubscriptionHistoryActor | null;
}

export interface CompanySubscriptionHistoryPayload {
    company: CompanySubscriptionSnapshot;
    history: CompanySubscriptionHistoryItem[];
    productHistory: CompanyProductHistoryItem[];
    pendingRequests: CompanyPendingProductRequestItem[];
}

function toDecimalString(value: Prisma.Decimal | number | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return value.toString();
}

function toIsoString(value: Date | null | undefined): string | null {
    if (!value) return null;
    return value.toISOString();
}

function resolveActorDisplayName(actor: {
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string;
}): string {
    const combined = `${actor.first_name ?? ''} ${actor.last_name ?? ''}`.trim();
    if (combined.length > 0) return combined;
    if (actor.name && actor.name.trim().length > 0) return actor.name.trim();
    return actor.email;
}

export async function getCompanySubscriptionHistoryPayload(
    companyId: number,
    db: DbClient = prisma,
): Promise<CompanySubscriptionHistoryPayload | null> {
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
                where: {
                    status: {
                        in: ['ACTIVE', 'TRIALING'],
                    },
                    OR: [
                        { availableUntil: null },
                        { availableUntil: { gt: new Date() } },
                    ],
                },
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

    if (!company) return null;

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

    const history: CompanySubscriptionHistoryItem[] = historyRows.map((row) => ({
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

    const productHistory: CompanyProductHistoryItem[] = productHistoryRows.map((row) => ({
        ...(function buildFields() {
            const previous = parseCompanyProductHistoryValue(row.previousValue);
            const next = parseCompanyProductHistoryValue(row.newValue);
            return {
                source: resolveCompanyProductHistorySource({
                    previousValue: row.previousValue,
                    newValue: row.newValue,
                }),
                productCode: next?.productCode ?? previous?.productCode ?? null,
                previousTier: previous?.tierCode ?? null,
                newTier: next?.tierCode ?? null,
                previousStatus:
                    previous?.requestStatus ?? previous?.status ?? null,
                newStatus: next?.requestStatus ?? next?.status ?? null,
                previousAvailableUntil: previous?.availableUntil ?? null,
                newAvailableUntil: next?.availableUntil ?? null,
                pricePaid: next?.pricePaid ?? previous?.pricePaid ?? null,
                billingCycle:
                    typeof next?.billingCycle === 'string'
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
            status: ProductAccessRequestStatus.PENDING,
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

    const pendingRequests: CompanyPendingProductRequestItem[] = pendingRequestRows.map((row) => ({
        id: row.id,
        productCode: row.productCode,
        productName: getProductCatalogDefinition(row.productCode).name,
        tierCode: row.tierCode,
        tierName: getProductTierDefinition(row.tierCode).name,
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

    const latestRequestedProducts = productHistoryRows.find(
        (row) => row.action === 'REQUESTED_PRODUCTS_SET',
    );

    const activeProducts =
        company.product_subscriptions.length > 0
            ? company.product_subscriptions.map((subscription) =>
                buildActiveProductSnapshot({
                    productCode: subscription.product.code,
                    tierCode: subscription.productTier.code,
                    billingCycle: subscription.billingCycle ?? company.billingCycle,
                    pricePaid: subscription.pricePaid,
                    currency: subscription.currency ?? company.currency,
                    availableUntil: subscription.availableUntil ?? company.availableUntil,
                    includedByDefault: isAutoIncludedAddonTier(subscription.productTier.code),
                }),
            )
            : buildLegacyFallbackActiveProducts({
                legacyPlan: company.plan,
                companyBillingCycle: company.billingCycle,
                companyPricePaid:
                    company.pricePaid === null || company.pricePaid === undefined
                        ? null
                        : Number(company.pricePaid.toString()),
                companyCurrency: company.currency,
                companyAvailableUntil: company.availableUntil,
            }).map((product) => buildActiveProductSnapshot(product));

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
            isExpired: Date.now() > company.availableUntil.getTime(),
            activeProducts,
            requestedProducts: parseRequestedProductsSnapshot(latestRequestedProducts?.newValue),
        },
        history,
        productHistory,
        pendingRequests,
    };
}
