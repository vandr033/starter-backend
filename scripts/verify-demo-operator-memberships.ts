import { DEMO_OPERATOR_EMAIL } from '../src/config/demo-profiles';
import { prisma } from '../src/prisma/client';
import { inspectDemoOperatorMemberships } from '../src/services/demo-operator-membership.service';

async function main() {
  const audit = await inspectDemoOperatorMemberships();
  const slugs = audit.memberships.map(({ company }) => company.slug);
  console.log(JSON.stringify({ email: DEMO_OPERATOR_EMAIL, operatorFound: audit.operatorFound, memberships: slugs, invalidMemberships: audit.invalidMemberships }, null, 2));

  if (!audit.operatorFound || audit.invalidMemberships.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Demo operator membership verification failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
