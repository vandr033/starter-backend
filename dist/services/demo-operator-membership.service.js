"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectDemoOperatorMemberships = inspectDemoOperatorMemberships;
exports.assertDemoOperatorMembershipsAreDemo = assertDemoOperatorMembershipsAreDemo;
exports.assertDemoOperatorMayJoinCompany = assertDemoOperatorMayJoinCompany;
const demo_profiles_1 = require("../config/demo-profiles");
const client_1 = require("../prisma/client");
async function inspectDemoOperatorMemberships(db = client_1.prisma) {
    const operator = await db.user.findUnique({
        where: { email: demo_profiles_1.DEMO_OPERATOR_EMAIL },
        select: { id: true },
    });
    if (!operator)
        return { operatorFound: false, memberships: [], invalidMemberships: [] };
    const memberships = await db.companyUser.findMany({
        where: { user_id: operator.id },
        select: { company_id: true, company: { select: { slug: true } } },
    });
    const invalidMemberships = memberships
        .filter(({ company }) => !(0, demo_profiles_1.getDemoProfileForCompanySlug)(company.slug))
        .map(({ company_id, company }) => ({ companyId: company_id, companySlug: company.slug }));
    return { operatorFound: true, memberships, invalidMemberships };
}
async function assertDemoOperatorMembershipsAreDemo(db = client_1.prisma) {
    const audit = await inspectDemoOperatorMemberships(db);
    if (!audit.operatorFound)
        throw new Error(`Reserved demo operator ${demo_profiles_1.DEMO_OPERATOR_EMAIL} is missing.`);
    if (audit.invalidMemberships.length) {
        throw new Error(`Reserved demo operator has non-demo Company memberships: ${audit.invalidMemberships.map(({ companySlug }) => companySlug).join(', ')}`);
    }
    return audit;
}
async function assertDemoOperatorMayJoinCompany(db, userId, companyId) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email !== demo_profiles_1.DEMO_OPERATOR_EMAIL)
        return;
    const company = await db.company.findUnique({ where: { id: companyId }, select: { slug: true } });
    if (!company || !(0, demo_profiles_1.getDemoProfileForCompanySlug)(company.slug)) {
        throw new Error(`Reserved demo operator cannot be attached to non-demo Company ${companyId}.`);
    }
}
