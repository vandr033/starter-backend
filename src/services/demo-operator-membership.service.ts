import type { Prisma, PrismaClient } from '@prisma/client';
import { DEMO_OPERATOR_EMAIL, getDemoProfileForCompanySlug } from '../config/demo-profiles';
import { prisma } from '../prisma/client';

type DemoDb = PrismaClient | Prisma.TransactionClient;

export async function inspectDemoOperatorMemberships(db: DemoDb = prisma) {
  const operator = await db.user.findUnique({
    where: { email: DEMO_OPERATOR_EMAIL },
    select: { id: true },
  });
  if (!operator) return { operatorFound: false, memberships: [], invalidMemberships: [] };

  const memberships = await db.companyUser.findMany({
    where: { user_id: operator.id },
    select: { company_id: true, company: { select: { slug: true } } },
  });
  const invalidMemberships = memberships
    .filter(({ company }) => !getDemoProfileForCompanySlug(company.slug))
    .map(({ company_id, company }) => ({ companyId: company_id, companySlug: company.slug }));

  return { operatorFound: true, memberships, invalidMemberships };
}

export async function assertDemoOperatorMembershipsAreDemo(db: DemoDb = prisma) {
  const audit = await inspectDemoOperatorMemberships(db);
  if (!audit.operatorFound) throw new Error(`Reserved demo operator ${DEMO_OPERATOR_EMAIL} is missing.`);
  if (audit.invalidMemberships.length) {
    throw new Error(`Reserved demo operator has non-demo Company memberships: ${audit.invalidMemberships.map(({ companySlug }) => companySlug).join(', ')}`);
  }
  return audit;
}

export async function assertDemoOperatorMayJoinCompany(
  db: DemoDb,
  userId: string,
  companyId: number,
) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email !== DEMO_OPERATOR_EMAIL) return;

  const company = await db.company.findUnique({ where: { id: companyId }, select: { slug: true } });
  if (!company || !getDemoProfileForCompanySlug(company.slug)) {
    throw new Error(`Reserved demo operator cannot be attached to non-demo Company ${companyId}.`);
  }
}
