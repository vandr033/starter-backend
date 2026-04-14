import { Prisma, ShopPlan } from '@prisma/client';
import { prisma } from '../prisma/client';
import { isPlanFeatureEnabled } from '../config/plan-capabilities';

type DbClient = typeof prisma | Prisma.TransactionClient;

export type CompanyModuleKey = 'RESERVATIONS' | 'STORE';

export type CompanyModules = {
    reservations: boolean;
    store: boolean;
};

type CompanyModuleInput = {
    plan?: ShopPlan | null;
    reservations_enabled?: boolean | null;
    store_enabled?: boolean | null;
};

const DEFAULT_MODULES: CompanyModules = {
    reservations: true,
    store: false,
};

export function resolveCompanyModules(input?: CompanyModuleInput | null): CompanyModules {
    const reservations = input?.reservations_enabled ?? DEFAULT_MODULES.reservations;
    const storeConfigured = input?.store_enabled ?? DEFAULT_MODULES.store;
    const storePlanEnabled = input?.plan ? isPlanFeatureEnabled(input.plan, 'STORE_MODULE') : false;

    return {
        reservations,
        store: storeConfigured && storePlanEnabled,
    };
}

export function isCompanyModuleEnabled(modules: CompanyModules, module: CompanyModuleKey): boolean {
    return module === 'RESERVATIONS' ? modules.reservations : modules.store;
}

export async function getCompanyModules(companyId: number, db: DbClient = prisma): Promise<CompanyModules> {
    const company = await db.company.findUnique({
        where: { id: companyId },
        select: {
            plan: true,
            company_settings: {
                select: {
                    reservations_enabled: true,
                },
            },
            commerce_settings: {
                select: {
                    store_enabled: true,
                },
            },
        },
    });

    return resolveCompanyModules({
        plan: company?.plan,
        reservations_enabled: company?.company_settings?.reservations_enabled,
        store_enabled: company?.commerce_settings?.store_enabled,
    });
}

export function buildCompanyModuleDisabledMessage(module: CompanyModuleKey): string {
    return module === 'RESERVATIONS'
        ? 'Reservations module is disabled for this company'
        : 'Store module is disabled for this company';
}
