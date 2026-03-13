import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

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
    billingCycle: 'MONTHLY' | 'YEARLY';
    pricePaid: string | null;
    availableUntil: string;
    isMarketplaceVisible: boolean;
    isExpired: boolean;
}

export interface CompanySubscriptionHistoryPayload {
    company: CompanySubscriptionSnapshot;
    history: CompanySubscriptionHistoryItem[];
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
            isMarketplaceVisible: true,
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

    return {
        company: {
            id: company.id,
            name: company.name,
            plan: company.plan,
            billingCycle: company.billingCycle,
            pricePaid: toDecimalString(company.pricePaid),
            availableUntil: company.availableUntil.toISOString(),
            isMarketplaceVisible: company.isMarketplaceVisible,
            isExpired: Date.now() > company.availableUntil.getTime(),
        },
        history,
    };
}
