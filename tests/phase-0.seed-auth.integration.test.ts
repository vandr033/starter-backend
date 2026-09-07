import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { CompanyUserRole } from '@prisma/client';
import { getAuth } from '../src/config/auth';
import {
  BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
  BETTER_AUTH_CREDENTIAL_PROVIDER_IDS,
} from '../src/config/auth-constants';
import { prisma } from '../src/prisma/client';

/**
 * This test intentionally exercises Better Auth against MySQL. It is skipped
 * for the ordinary unit suite and must be enabled explicitly in disposable
 * database verification.
 */
const mysqlIntegrationEnabled =
  process.env.RUN_MYSQL_INTEGRATION === '1' &&
  /^mysql(?:s)?:\/\//i.test(process.env.DATABASE_URL || '');
const skipReason = mysqlIntegrationEnabled
  ? false
  : 'RUN_MYSQL_INTEGRATION=1 and a mysql:// DATABASE_URL are required';

const seededAccounts = [
  {
    email: 'superadmin@example.com',
    password: 'SuperAdmin123!',
    isSuperAdmin: true,
    role: null,
  },
  {
    email: 'diego@fadefactory.bo',
    password: 'Owner123!',
    isSuperAdmin: false,
    role: CompanyUserRole.OWNER,
  },
  {
    email: 'ana@glownails.bo',
    password: 'Admin123!',
    isSuperAdmin: false,
    role: CompanyUserRole.ADMIN,
  },
  {
    email: 'carlos@fadefactory.bo',
    password: 'Staff123!',
    isSuperAdmin: false,
    role: CompanyUserRole.STAFF,
  },
  {
    email: 'juan@example.com',
    password: 'Customer123!',
    isSuperAdmin: false,
    role: CompanyUserRole.CUSTOMER,
  },
] as const;

let startedAt: Date | null = null;
let seededUserIds: string[] = [];

before(async () => {
  if (!mysqlIntegrationEnabled) return;
  await prisma.$connect();
});

after(async () => {
  if (!mysqlIntegrationEnabled) return;

  if (startedAt && seededUserIds.length > 0) {
    await prisma.session.deleteMany({
      where: {
        userId: { in: seededUserIds },
        createdAt: { gte: startedAt },
      },
    });
  }

  await prisma.$disconnect();
});

test('seeded roles authenticate through Better Auth email/password flow', { skip: skipReason }, async () => {
  startedAt = new Date();
  const auth = await getAuth();

  for (const expected of seededAccounts) {
    const identity = await prisma.user.findUnique({
      where: { email: expected.email },
      select: {
        id: true,
        email: true,
        is_super_admin: true,
        accounts: {
          where: { providerId: { in: [...BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] } },
          select: {
            id: true,
            accountId: true,
            providerId: true,
            password: true,
          },
        },
        company_users: {
          where: { deleted_at: null },
          select: { role: true },
        },
      },
    });

    assert.ok(identity, `${expected.email} was not created by the seed`);
    seededUserIds.push(identity.id);
    assert.equal(identity.email, expected.email);
    assert.equal(identity.is_super_admin, expected.isSuperAdmin);

    const credentialAccounts = identity.accounts.filter(
      (account) => account.providerId === BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
    );
    assert.equal(credentialAccounts.length, 1, `${expected.email} must have one canonical credential account`);
    assert.equal(credentialAccounts[0]?.accountId, expected.email);
    assert.ok(credentialAccounts[0]?.password, `${expected.email} must have a password hash`);

    if (expected.role) {
      assert.ok(
        identity.company_users.some((companyUser) => companyUser.role === expected.role),
        `${expected.email} must have the seeded ${expected.role} membership`,
      );
    }

    const response = await auth.api.signInEmail({
      body: {
        email: expected.email,
        password: expected.password,
      },
      headers: new Headers({
        origin: 'http://localhost:3000',
        host: 'localhost:3001',
      }),
      asResponse: true,
    });
    const payload = await response.json() as {
      token?: unknown;
      user?: { id?: unknown; email?: unknown };
      message?: unknown;
    };

    assert.equal(
      response.ok,
      true,
      `${expected.email} Better Auth sign-in failed: ${JSON.stringify(payload)}`,
    );
    assert.equal(response.status, 200);
    assert.equal(payload.user?.id, identity.id);
    assert.equal(payload.user?.email, expected.email);
    assert.equal(typeof payload.token, 'string');

    const session = await prisma.session.findUnique({
      where: { token: payload.token as string },
      select: { userId: true },
    });
    assert.deepEqual(session, { userId: identity.id });
  }
});
