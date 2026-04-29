import { CompanyUserRole, Prisma, ShopPlan } from '@prisma/client';
import { prisma } from '../prisma/client';
import {
    getFeatureRequiredPlan,
    getPlanStaffLimit,
    type PlanFeatureKey,
} from '../config/plan-capabilities';
import { getCompanyEntitlements } from './company-entitlements.service';

type DbClient = typeof prisma | Prisma.TransactionClient;

export async function getCompanyPlan(companyId: number, db: DbClient = prisma): Promise<ShopPlan | null> {
    const company = await db.company.findUnique({
        where: { id: companyId },
        select: { plan: true },
    });

    return company?.plan ?? null;
}

export async function isFeatureEnabledForCompany(
    companyId: number,
    feature: PlanFeatureKey,
    db: DbClient = prisma,
): Promise<boolean> {
    const entitlements = await getCompanyEntitlements(companyId, db);
    return entitlements.features[feature] === true;
}

export async function resolveFeatureAccessForCompany(
    companyId: number,
    feature: PlanFeatureKey,
    db: DbClient = prisma,
): Promise<{
    allowed: boolean;
    currentPlan: ShopPlan | null;
    requiredPlan: ShopPlan;
}> {
    const entitlements = await getCompanyEntitlements(companyId, db);
    const requiredPlan = getFeatureRequiredPlan(feature);

    return {
        allowed: entitlements.features[feature] === true,
        currentPlan: entitlements.currentPlan,
        requiredPlan,
    };
}

export async function getStaffSeatUsageForCompany(
    companyId: number,
    db: DbClient = prisma,
): Promise<{
    currentPlan: ShopPlan | null;
    maxStaffMembers: number | null;
    currentStaffMembers: number;
}> {
    const currentPlan = await getCompanyPlan(companyId, db);

    const currentStaffMembers = await db.companyUser.count({
        where: {
            company_id: companyId,
            deleted_at: null,
            role: {
                in: [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF],
            },
        },
    });

    return {
        currentPlan,
        maxStaffMembers: currentPlan ? getPlanStaffLimit(currentPlan) : null,
        currentStaffMembers,
    };
}

export function buildFeatureNotAvailableMessage(requiredPlan: ShopPlan): string {
    return requiredPlan === ShopPlan.PRO
        ? 'Esta función requiere un plan más alto para activarse.'
        : 'Esta función requiere un plan activo para seguir usándola.';
}

export function buildStaffLimitReachedMessage(): string {
    return 'Llegaste al límite de personas de tu plan.';
}
