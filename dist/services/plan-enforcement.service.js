"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompanyPlan = getCompanyPlan;
exports.isFeatureEnabledForCompany = isFeatureEnabledForCompany;
exports.resolveFeatureAccessForCompany = resolveFeatureAccessForCompany;
exports.getStaffSeatUsageForCompany = getStaffSeatUsageForCompany;
exports.buildFeatureNotAvailableMessage = buildFeatureNotAvailableMessage;
exports.buildStaffLimitReachedMessage = buildStaffLimitReachedMessage;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const plan_capabilities_1 = require("../config/plan-capabilities");
const company_entitlements_service_1 = require("./company-entitlements.service");
async function getCompanyPlan(companyId, db = client_2.prisma) {
    const company = await db.company.findUnique({
        where: { id: companyId },
        select: { plan: true },
    });
    return company?.plan ?? null;
}
async function isFeatureEnabledForCompany(companyId, feature, db = client_2.prisma) {
    const entitlements = await (0, company_entitlements_service_1.getCompanyEntitlements)(companyId, db);
    return entitlements.features[feature] === true;
}
async function resolveFeatureAccessForCompany(companyId, feature, db = client_2.prisma) {
    const entitlements = await (0, company_entitlements_service_1.getCompanyEntitlements)(companyId, db);
    const requiredPlan = (0, plan_capabilities_1.getFeatureRequiredPlan)(feature);
    return {
        allowed: entitlements.features[feature] === true,
        currentPlan: entitlements.currentPlan,
        requiredPlan,
    };
}
async function getStaffSeatUsageForCompany(companyId, db = client_2.prisma) {
    const currentPlan = await getCompanyPlan(companyId, db);
    const currentStaffMembers = await db.companyUser.count({
        where: {
            company_id: companyId,
            deleted_at: null,
            role: {
                in: [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN, client_1.CompanyUserRole.STAFF],
            },
        },
    });
    return {
        currentPlan,
        maxStaffMembers: currentPlan ? (0, plan_capabilities_1.getPlanStaffLimit)(currentPlan) : null,
        currentStaffMembers,
    };
}
function buildFeatureNotAvailableMessage(requiredPlan) {
    return requiredPlan === client_1.ShopPlan.PRO
        ? 'Esta función requiere un plan más alto para activarse.'
        : 'Esta función requiere un plan activo para seguir usándola.';
}
function buildStaffLimitReachedMessage() {
    return 'Llegaste al límite de personas de tu plan.';
}
