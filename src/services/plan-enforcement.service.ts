import { CompanyUserRole, Prisma, ShopPlan } from '@prisma/client';
import { prisma } from '../prisma/client';
import {
    getFeatureRequiredPlan,
    getPlanStaffLimit,
    isPlanFeatureEnabled,
    type PlanFeatureKey,
} from '../config/plan-capabilities';

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
    const plan = await getCompanyPlan(companyId, db);
    if (!plan) return false;
    return isPlanFeatureEnabled(plan, feature);
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
    const currentPlan = await getCompanyPlan(companyId, db);
    const requiredPlan = getFeatureRequiredPlan(feature);

    return {
        allowed: currentPlan ? isPlanFeatureEnabled(currentPlan, feature) : false,
        currentPlan,
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
        ? 'Available on the Pro plan'
        : 'Available on the Business plan';
}

export function buildStaffLimitReachedMessage(): string {
    return 'Staff limit reached for your plan';
}
