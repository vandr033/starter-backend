"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCompanyProductHistorySnapshot = buildCompanyProductHistorySnapshot;
exports.resolveCompanyProductHistoryAction = resolveCompanyProductHistoryAction;
exports.parseCompanyProductHistoryValue = parseCompanyProductHistoryValue;
exports.resolveCompanyProductHistorySource = resolveCompanyProductHistorySource;
exports.recordCompanyProductHistory = recordCompanyProductHistory;
const client_1 = require("@prisma/client");
function toDecimalString(value) {
    if (value === null || value === undefined)
        return null;
    return value.toString();
}
function toIsoString(value) {
    if (!value)
        return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString();
}
function normalizeSnapshotLike(value, source) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return client_1.Prisma.JsonNull;
    }
    const record = value;
    return {
        ...record,
        source: source ??
            (typeof record.source === 'string' && record.source.trim().length > 0
                ? record.source
                : null),
    };
}
function parseSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    const billingCycle = typeof record.billingCycle === 'string' ? record.billingCycle : null;
    return {
        productCode: typeof record.productCode === 'string' ? record.productCode : null,
        productName: typeof record.productName === 'string' ? record.productName : null,
        tierCode: typeof record.tierCode === 'string' ? record.tierCode : null,
        tierName: typeof record.tierName === 'string' ? record.tierName : null,
        status: typeof record.status === 'string' ? record.status : null,
        availableUntil: typeof record.availableUntil === 'string' ? record.availableUntil : null,
        pricePaid: typeof record.pricePaid === 'string' ? record.pricePaid : null,
        billingCycle,
        isCoreProduct: typeof record.isCoreProduct === 'boolean' ? record.isCoreProduct : undefined,
        includedByDefault: typeof record.includedByDefault === 'boolean'
            ? record.includedByDefault
            : undefined,
        source: typeof record.source === 'string' ? record.source : null,
        capability: typeof record.capability === 'string' ? record.capability : null,
        requestId: typeof record.requestId === 'number' ? record.requestId : null,
        requestedByUserId: typeof record.requestedByUserId === 'string' ? record.requestedByUserId : null,
        requestStatus: typeof record.requestStatus === 'string' ? record.requestStatus : null,
    };
}
function buildCompanyProductHistorySnapshot(params) {
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
function resolveCompanyProductHistoryAction(params) {
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
        const isAvailabilityExtension = previousAvailableUntil &&
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
function parseCompanyProductHistoryValue(value) {
    return parseSnapshot(value);
}
function resolveCompanyProductHistorySource(params) {
    const next = parseSnapshot(params.newValue);
    if (next?.source)
        return next.source;
    const previous = parseSnapshot(params.previousValue);
    if (previous?.source)
        return previous.source;
    return null;
}
async function recordCompanyProductHistory({ db, companyId, action, previousValue, newValue, actorUserId, source, note, }) {
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
