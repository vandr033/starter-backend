import { BillingCycle, Prisma } from '@prisma/client';

type DbClient = Prisma.TransactionClient | typeof import('../prisma/client').prisma;

export type CompanyProductHistoryAction =
    | 'PRODUCT_ACTIVATED'
    | 'PRODUCT_UPGRADED'
    | 'PRODUCT_DOWNGRADED'
    | 'PRODUCT_CANCELLED'
    | 'PRODUCT_EXPIRED'
    | 'ADDON_ACTIVATED'
    | 'ADDON_REMOVED'
    | 'CAPABILITY_OVERRIDE_ADDED'
    | 'CAPABILITY_OVERRIDE_REMOVED'
    | 'REQUEST_APPROVED'
    | 'REQUEST_REJECTED'
    | 'REQUESTED_PRODUCTS_SET'
    | 'MANUAL_AVAILABILITY_EXTENSION'
    | 'PRODUCT_UPDATED';

export interface CompanyProductHistorySnapshot {
    productCode?: string | null;
    productName?: string | null;
    tierCode?: string | null;
    tierName?: string | null;
    status?: string | null;
    availableUntil?: string | null;
    pricePaid?: string | null;
    billingCycle?: BillingCycle | string | null;
    isCoreProduct?: boolean;
    includedByDefault?: boolean;
    source?: string | null;
    capability?: string | null;
    requestId?: number | null;
    requestedByUserId?: string | null;
    requestStatus?: string | null;
}

type RecordCompanyProductHistoryInput = {
    db: DbClient;
    companyId: number;
    action: string;
    previousValue?: unknown;
    newValue?: unknown;
    actorUserId?: string | null;
    source?: string | null;
    note?: string | null;
};

function toDecimalString(value: Prisma.Decimal | number | string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return value.toString();
}

function toIsoString(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function normalizeSnapshotLike(
    value: unknown,
    source?: string | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return Prisma.JsonNull;
    }

    const record = value as Record<string, unknown>;

    return {
        ...record,
        source:
            source ??
            (typeof record.source === 'string' && record.source.trim().length > 0
                ? record.source
                : null),
    } as Prisma.InputJsonValue;
}

function parseSnapshot(
    value: unknown,
): CompanyProductHistorySnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const record = value as Record<string, unknown>;
    const billingCycle =
        typeof record.billingCycle === 'string' ? record.billingCycle : null;

    return {
        productCode: typeof record.productCode === 'string' ? record.productCode : null,
        productName: typeof record.productName === 'string' ? record.productName : null,
        tierCode: typeof record.tierCode === 'string' ? record.tierCode : null,
        tierName: typeof record.tierName === 'string' ? record.tierName : null,
        status: typeof record.status === 'string' ? record.status : null,
        availableUntil:
            typeof record.availableUntil === 'string' ? record.availableUntil : null,
        pricePaid: typeof record.pricePaid === 'string' ? record.pricePaid : null,
        billingCycle,
        isCoreProduct: typeof record.isCoreProduct === 'boolean' ? record.isCoreProduct : undefined,
        includedByDefault:
            typeof record.includedByDefault === 'boolean'
                ? record.includedByDefault
                : undefined,
        source: typeof record.source === 'string' ? record.source : null,
        capability: typeof record.capability === 'string' ? record.capability : null,
        requestId: typeof record.requestId === 'number' ? record.requestId : null,
        requestedByUserId:
            typeof record.requestedByUserId === 'string' ? record.requestedByUserId : null,
        requestStatus:
            typeof record.requestStatus === 'string' ? record.requestStatus : null,
    };
}

export function buildCompanyProductHistorySnapshot(params: {
    productCode?: string | null;
    productName?: string | null;
    tierCode?: string | null;
    tierName?: string | null;
    status?: string | null;
    availableUntil?: Date | string | null;
    pricePaid?: Prisma.Decimal | number | string | null;
    billingCycle?: BillingCycle | string | null;
    isCoreProduct?: boolean;
    includedByDefault?: boolean;
    source?: string | null;
    capability?: string | null;
    requestId?: number | null;
    requestedByUserId?: string | null;
    requestStatus?: string | null;
}): CompanyProductHistorySnapshot {
    return {
        productCode: params.productCode ?? null,
        productName: params.productName ?? null,
        tierCode: params.tierCode ?? null,
        tierName: params.tierName ?? null,
        status: params.status ?? null,
        availableUntil: toIsoString(params.availableUntil),
        pricePaid: toDecimalString(params.pricePaid),
        billingCycle: params.billingCycle ?? null,
        isCoreProduct: params.isCoreProduct,
        includedByDefault: params.includedByDefault,
        source: params.source ?? null,
        capability: params.capability ?? null,
        requestId: params.requestId ?? null,
        requestedByUserId: params.requestedByUserId ?? null,
        requestStatus: params.requestStatus ?? null,
    };
}

export function resolveCompanyProductHistoryAction(params: {
    action: string;
    previousValue?: unknown;
    newValue?: unknown;
}): string {
    const previous = parseSnapshot(params.previousValue);
    const next = parseSnapshot(params.newValue);

    if (params.action === 'PRODUCT_ACTIVATED' && next && next.isCoreProduct === false) {
        return 'ADDON_ACTIVATED';
    }

    if (params.action === 'PRODUCT_CANCELLED' && previous && previous.isCoreProduct === false) {
        return 'ADDON_REMOVED';
    }

    if (params.action === 'PRODUCT_UPDATED' && previous && next) {
        if (previous.status !== next.status && next.status === 'EXPIRED') {
            return 'PRODUCT_EXPIRED';
        }

        const previousAvailableUntil = previous.availableUntil
            ? new Date(previous.availableUntil)
            : null;
        const nextAvailableUntil = next.availableUntil ? new Date(next.availableUntil) : null;
        const isAvailabilityExtension =
            previousAvailableUntil &&
            nextAvailableUntil &&
            !Number.isNaN(previousAvailableUntil.getTime()) &&
            !Number.isNaN(nextAvailableUntil.getTime()) &&
            nextAvailableUntil.getTime() > previousAvailableUntil.getTime();

        if (isAvailabilityExtension) {
            return 'MANUAL_AVAILABILITY_EXTENSION';
        }
    }

    return params.action;
}

export function parseCompanyProductHistoryValue(
    value: unknown,
): CompanyProductHistorySnapshot | null {
    return parseSnapshot(value);
}

export function resolveCompanyProductHistorySource(params: {
    previousValue?: unknown;
    newValue?: unknown;
}): string | null {
    const next = parseSnapshot(params.newValue);
    if (next?.source) return next.source;

    const previous = parseSnapshot(params.previousValue);
    if (previous?.source) return previous.source;

    return null;
}

export async function recordCompanyProductHistory({
    db,
    companyId,
    action,
    previousValue,
    newValue,
    actorUserId,
    source,
    note,
}: RecordCompanyProductHistoryInput) {
    const resolvedAction = resolveCompanyProductHistoryAction({
        action,
        previousValue,
        newValue,
    });

    await db.companyProductHistory.create({
        data: {
            companyId,
            action: resolvedAction,
            previousValue: normalizeSnapshotLike(previousValue, source),
            newValue: normalizeSnapshotLike(newValue, source),
            actorUserId: actorUserId ?? null,
            note: note?.trim() || null,
        },
    });
}
