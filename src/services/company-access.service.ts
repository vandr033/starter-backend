import {
    CompanyProductSubscriptionStatus,
    CompanyUserRole,
    Prisma,
    RestaurantShiftMemberRole,
    ShopPlan,
} from '@prisma/client';
import type {
    CompanyEntitlementPayload,
    ProductCapability,
    ProductCode,
    ProductTierCode,
} from '../config/product-entitlements';
import {
    getCompanyEntitlementState,
    resolveCompanyEntitlementsFromState,
    type ActiveCompanyProductSubscription,
} from './company-entitlements.service';
import { prisma } from '../prisma/client';

export type CompanyAccessMode = 'FULL' | 'READ_ONLY' | 'RENEWAL_ONLY' | 'BLOCKED';

export type CompanyLifecycleReason =
    | 'COMPANY_INACTIVE'
    | 'COMPANY_DELETED'
    | 'COMPANY_EXPIRED'
    | null;

export type CompanyProductAccessReason =
    | 'EFFECTIVE'
    | 'LEGACY_FALLBACK'
    | 'FUTURE'
    | 'EXPIRED'
    | 'STATUS_INACTIVE'
    | 'CANCELLED'
    | 'CATALOG_INACTIVE';

export type ConfiguredCompanyProductAccess = {
    id: number | null;
    productCode: ProductCode;
    tierCode: ProductTierCode;
    status: CompanyProductSubscriptionStatus;
    isCore: boolean;
    includedByDefault: boolean;
    startsAt: string | null;
    availableUntil: string | null;
    cancelledAt: string | null;
    effective: boolean;
    reason: CompanyProductAccessReason;
};

export type EffectiveCompanyAccess = {
    version: 1;
    companyId: number;
    lifecycle: {
        mode: CompanyAccessMode;
        isActive: boolean;
        isExpired: boolean;
        availableUntil: string | null;
        reason: CompanyLifecycleReason;
    };
    membership: {
        id: number | null;
        role: CompanyUserRole | null;
    };
    restaurant: {
        activeShiftId: number | null;
        activeShiftRole: RestaurantShiftMemberRole | null;
    };
    entitlements: CompanyEntitlementPayload;
    configuredProducts: ConfiguredCompanyProductAccess[];
};

type DbClient = typeof prisma | Prisma.TransactionClient;

type CompanyContextMembership = {
    id: number;
    company_id: number;
    user_id: string;
    role: CompanyUserRole;
    is_primary_contact: boolean;
    company: {
        id: number;
        name: string;
        slug: string;
        plan: ShopPlan;
        availableUntil: Date;
        is_active: boolean;
        deleted_at: Date | null;
        restaurant_enabled: boolean;
        currency: string;
        timezone: string;
    };
};

function toIso(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
}

function isEffectiveSubscription(
    subscription: ActiveCompanyProductSubscription,
    now: Date,
): boolean {
    return (
        (subscription.status === CompanyProductSubscriptionStatus.ACTIVE ||
            subscription.status === CompanyProductSubscriptionStatus.TRIALING) &&
        !subscription.cancelledAt &&
        (!subscription.startsAt || subscription.startsAt.getTime() <= now.getTime()) &&
        (!subscription.availableUntil || subscription.availableUntil.getTime() >= now.getTime()) &&
        subscription.productIsActive !== false &&
        subscription.tierIsActive !== false
    );
}

function resolveConfiguredProductReason(
    subscription: ActiveCompanyProductSubscription,
    now: Date,
    effective: boolean,
): CompanyProductAccessReason {
    if (effective) return 'EFFECTIVE';
    if (subscription.productIsActive === false || subscription.tierIsActive === false) {
        return 'CATALOG_INACTIVE';
    }
    if (subscription.cancelledAt) return 'CANCELLED';
    if (
        subscription.status !== CompanyProductSubscriptionStatus.ACTIVE &&
        subscription.status !== CompanyProductSubscriptionStatus.TRIALING
    ) {
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

function resolveLifecycle(
    state: Awaited<ReturnType<typeof getCompanyEntitlementState>>,
    now: Date,
): EffectiveCompanyAccess['lifecycle'] {
    const isDeleted = Boolean(state.deletedAt);
    const isActive = state.isActive !== false && !isDeleted;
    const isExpired = Boolean(
        state.availableUntil && state.availableUntil.getTime() < now.getTime(),
    );

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

function resolveConfiguredProducts(
    state: Awaited<ReturnType<typeof getCompanyEntitlementState>>,
    entitlements: CompanyEntitlementPayload,
    now: Date,
): ConfiguredCompanyProductAccess[] {
    if (!state.hasModularSubscriptions) {
        return entitlements.products.map((product) => ({
            id: null,
            productCode: product.productCode,
            tierCode: product.tierCode,
            status: CompanyProductSubscriptionStatus.ACTIVE,
            isCore: product.isCore,
            includedByDefault: product.includedByDefault,
            startsAt: null,
            availableUntil: toIso(state.availableUntil),
            cancelledAt: null,
            effective: true,
            reason: 'LEGACY_FALLBACK',
        }));
    }

    const effectiveIds = new Set(
        state.activeSubscriptions
            .map((subscription) => subscription.id)
            .filter((id): id is number => typeof id === 'number'),
    );

    return (state.configuredSubscriptions ?? []).map((subscription) => {
        const effective = effectiveIds.has(subscription.id as number) || isEffectiveSubscription(subscription, now);
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

export async function resolveEffectiveCompanyAccess(options: {
    companyId: number;
    userId?: string;
    role?: CompanyUserRole | null;
    db?: DbClient;
    now?: Date;
}): Promise<EffectiveCompanyAccess> {
    const db = options.db ?? prisma;
    const now = options.now ?? new Date();
    const state = await getCompanyEntitlementState(options.companyId, db, now);
    const entitlements = resolveCompanyEntitlementsFromState(state);
    let activeShiftId: number | null = null;
    let activeShiftRole: RestaurantShiftMemberRole | null = null;

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

export async function resolveCompanyContextForUser(
    userId: string,
    companyId: number,
    options: { db?: DbClient; now?: Date } = {},
): Promise<{
    membership: CompanyContextMembership;
    access: EffectiveCompanyAccess;
} | null> {
    const db = options.db ?? prisma;
    const membership = await db.companyUser.findFirst({
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

    if (!membership) return null;

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

export function hasCompanyCapability(
    access: EffectiveCompanyAccess,
    capability: ProductCapability,
): boolean {
    return access.entitlements.productCapabilities[capability] === true;
}

export function hasCompanyFeature(
    access: EffectiveCompanyAccess,
    feature: keyof CompanyEntitlementPayload['features'],
): boolean {
    return access.entitlements.features[feature] === true;
}
