"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEffectiveCompanyAccess = resolveEffectiveCompanyAccess;
exports.resolveCompanyContextForUser = resolveCompanyContextForUser;
exports.hasCompanyCapability = hasCompanyCapability;
exports.hasCompanyFeature = hasCompanyFeature;
const client_1 = require("@prisma/client");
const company_entitlements_service_1 = require("./company-entitlements.service");
const client_2 = require("../prisma/client");
function toIso(value) {
    return value ? value.toISOString() : null;
}
function isEffectiveSubscription(subscription, now) {
    return ((subscription.status === client_1.CompanyProductSubscriptionStatus.ACTIVE ||
        subscription.status === client_1.CompanyProductSubscriptionStatus.TRIALING) &&
        !subscription.cancelledAt &&
        (!subscription.startsAt || subscription.startsAt.getTime() <= now.getTime()) &&
        (!subscription.availableUntil || subscription.availableUntil.getTime() >= now.getTime()) &&
        subscription.productIsActive !== false &&
        subscription.tierIsActive !== false);
}
function resolveConfiguredProductReason(subscription, now, effective) {
    if (effective)
        return 'EFFECTIVE';
    if (subscription.productIsActive === false || subscription.tierIsActive === false) {
        return 'CATALOG_INACTIVE';
    }
    if (subscription.cancelledAt)
        return 'CANCELLED';
    if (subscription.status !== client_1.CompanyProductSubscriptionStatus.ACTIVE &&
        subscription.status !== client_1.CompanyProductSubscriptionStatus.TRIALING) {
        return 'STATUS_INACTIVE';
    }
    if (subscription.startsAt && subscription.startsAt.getTime() > now.getTime()) {
        return 'FUTURE';
    }
    if (subscription.availableUntil && subscription.availableUntil.getTime() < now.getTime()) {
        return 'EXPIRED';
    }
    return 'STATUS_INACTIVE';
}
function resolveLifecycle(state, now) {
    const isDeleted = Boolean(state.deletedAt);
    const isActive = state.isActive !== false && !isDeleted;
    const isExpired = Boolean(state.availableUntil && state.availableUntil.getTime() < now.getTime());
    if (isDeleted) {
        return {
            mode: 'BLOCKED',
            isActive: false,
            isExpired,
            availableUntil: toIso(state.availableUntil),
            reason: 'COMPANY_DELETED',
        };
    }
    if (!isActive) {
        return {
            mode: 'BLOCKED',
            isActive: false,
            isExpired,
            availableUntil: toIso(state.availableUntil),
            reason: 'COMPANY_INACTIVE',
        };
    }
    if (!state.availableUntil || isExpired) {
        return {
            mode: 'RENEWAL_ONLY',
            isActive: true,
            isExpired: true,
            availableUntil: toIso(state.availableUntil),
            reason: 'COMPANY_EXPIRED',
        };
    }
    return {
        mode: 'FULL',
        isActive: true,
        isExpired: false,
        availableUntil: state.availableUntil.toISOString(),
        reason: null,
    };
}
function resolveConfiguredProducts(state, entitlements, now) {
    if (!state.hasModularSubscriptions) {
        return entitlements.products.map((product) => ({
            id: null,
            productCode: product.productCode,
            tierCode: product.tierCode,
            status: client_1.CompanyProductSubscriptionStatus.ACTIVE,
            isCore: product.isCore,
            includedByDefault: product.includedByDefault,
            startsAt: null,
            availableUntil: toIso(state.availableUntil),
            cancelledAt: null,
            effective: true,
            reason: 'LEGACY_FALLBACK',
        }));
    }
    const effectiveIds = new Set(state.activeSubscriptions
        .map((subscription) => subscription.id)
        .filter((id) => typeof id === 'number'));
    return (state.configuredSubscriptions ?? []).map((subscription) => {
        const effective = effectiveIds.has(subscription.id) || isEffectiveSubscription(subscription, now);
        return {
            id: subscription.id ?? null,
            productCode: subscription.productCode,
            tierCode: subscription.tierCode,
            status: subscription.status,
            isCore: subscription.isCoreProduct,
            includedByDefault: subscription.tierCode === 'CRM_BASE' ||
                subscription.tierCode === 'PERSONALIZACION_BASE' ||
                subscription.tierCode === 'MENSAJERIA_BASE',
            startsAt: toIso(subscription.startsAt),
            availableUntil: toIso(subscription.availableUntil),
            cancelledAt: toIso(subscription.cancelledAt),
            effective,
            reason: resolveConfiguredProductReason(subscription, now, effective),
        };
    });
}
async function resolveEffectiveCompanyAccess(options) {
    const db = options.db ?? client_2.prisma;
    const now = options.now ?? new Date();
    const state = await (0, company_entitlements_service_1.getCompanyEntitlementState)(options.companyId, db, now);
    const entitlements = (0, company_entitlements_service_1.resolveCompanyEntitlementsFromState)(state);
    let activeShiftId = null;
    let activeShiftRole = null;
    if (options.userId) {
        const activeShift = await db.restaurantShiftMember.findFirst({
            where: {
                company_id: options.companyId,
                user_id: options.userId,
                shift: {
                    company_id: options.companyId,
                    status: 'OPEN',
                    start_at: { lte: now },
                    end_at: { gt: now },
                },
            },
            select: {
                shift_id: true,
                role: true,
            },
            orderBy: { updated_at: 'desc' },
        });
        activeShiftId = activeShift?.shift_id ?? null;
        activeShiftRole = activeShift?.role ?? null;
    }
    return {
        version: 1,
        companyId: options.companyId,
        lifecycle: resolveLifecycle(state, now),
        membership: {
            id: null,
            role: options.role ?? null,
        },
        restaurant: {
            activeShiftId,
            activeShiftRole,
        },
        entitlements,
        configuredProducts: resolveConfiguredProducts(state, entitlements, now),
    };
}
async function resolveCompanyContextForUser(userId, companyId, options = {}) {
    const db = options.db ?? client_2.prisma;
    const memberships = await db.companyUser.findMany({
        where: {
            user_id: userId,
            company_id: companyId,
            deleted_at: null,
        },
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            company_id: true,
            user_id: true,
            role: true,
            is_primary_contact: true,
            updated_at: true,
            company: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    plan: true,
                    availableUntil: true,
                    is_active: true,
                    deleted_at: true,
                    restaurant_enabled: true,
                    currency: true,
                    timezone: true,
                },
            },
        },
    });
    const rolePriority = {
        [client_1.CompanyUserRole.OWNER]: 0,
        [client_1.CompanyUserRole.ADMIN]: 1,
        [client_1.CompanyUserRole.STAFF]: 2,
        [client_1.CompanyUserRole.CUSTOMER]: 3,
    };
    const membership = memberships.sort((left, right) => rolePriority[left.role] - rolePriority[right.role]
        || right.updated_at.getTime() - left.updated_at.getTime()
        || right.id - left.id)[0];
    if (!membership)
        return null;
    const access = await resolveEffectiveCompanyAccess({
        companyId,
        userId,
        role: membership.role,
        db,
        now: options.now,
    });
    access.membership.id = membership.id;
    return {
        membership,
        access,
    };
}
function hasCompanyCapability(access, capability) {
    return access.entitlements.productCapabilities[capability] === true;
}
function hasCompanyFeature(access, feature) {
    return access.entitlements.features[feature] === true;
}
