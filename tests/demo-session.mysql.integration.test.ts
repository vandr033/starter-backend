import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import { after, before, test } from 'node:test';
import { CompanyUserRole } from '@prisma/client';
import { DEMO_PROFILES } from '../src/config/demo-profiles';
import { requireAuth, requireCompanyRole } from '../src/middlewares/requireAuth';
import { requireActiveCompany } from '../src/middlewares/requireActiveCompany';
import { requireRestaurantCompanyContext } from '../src/middlewares/requireRestaurantCompanyContext';
import { demoReadOnlyMiddleware, demoSessionMiddleware } from '../src/middlewares/demo-session.middleware';
import { prisma } from '../src/prisma/client';
import {
  assertDemoOperatorMayJoinCompany,
  assertDemoOperatorMembershipsAreDemo,
  inspectDemoOperatorMemberships,
} from '../src/services/demo-operator-membership.service';
import { ACTIVE_COMPANY_COOKIE_NAME } from '../src/utils/active-shop-cookie';
import { DEMO_SESSION_COOKIE, createDemoSession, hashDemoSessionToken, resolveDemoSession, revokeDemoSession } from '../src/services/demo-session.service';
import * as AdminAuthService from '../src/services/admin-auth.service';
import adminAuthRoutes from '../src/routes/admin-auth.routes';
import adminRestaurantReservationsRoutes from '../src/routes/admin-restaurant-reservations.routes';
import { seedDemoProfiles } from '../prisma/seed.demo';

const databaseName = (() => {
  try { return new URL(process.env.DATABASE_URL || '').pathname.slice(1); } catch { return ''; }
})();
const mysqlIntegrationEnabled = process.env.RUN_MYSQL_INTEGRATION === '1'
  && process.env.RUN_DEMO_SEED_INTEGRATION === '1'
  && /^mysql(?:s)?:\/\//i.test(process.env.DATABASE_URL || '')
  && /(?:^|[_-])test$/i.test(databaseName);
const skipReason = mysqlIntegrationEnabled
  ? false
  : 'Use a disposable MySQL database named *_test with RUN_MYSQL_INTEGRATION=1 and RUN_DEMO_SEED_INTEGRATION=1';

before(async () => {
  if (mysqlIntegrationEnabled) await prisma.$connect();
});

after(async () => {
  if (mysqlIntegrationEnabled) await prisma.$disconnect();
});

async function fixtureCounts() {
  const output: Record<string, unknown> = {};
  for (const profile of Object.values(DEMO_PROFILES)) {
    const company = await prisma.company.findUniqueOrThrow({ where: { slug: profile.companySlug }, select: { id: true } });
    const [customers, bookings, shifts, waitlist, eventBookings, freeRegistrations, classSessions, classEnrollments, orders] = await Promise.all([
      prisma.customerProfile.count({ where: { company_id: company.id } }),
      prisma.booking.count({ where: { company_id: company.id, notes: 'demo-fixture:seed:v1' } }),
      prisma.restaurantShift.count({ where: { company_id: company.id, notes: 'demo-fixture:seed:v1' } }),
      prisma.restaurantWaitlist.count({ where: { company_id: company.id, internal_notes: 'demo-fixture:seed:v1' } }),
      prisma.groupEventBooking.count({ where: { company_id: company.id, notes: 'demo-fixture:seed:v1' } }),
      prisma.freeEventRegistration.count({ where: { company_id: company.id, source: 'demo-fixture:seed:v1' } }),
      prisma.groupClassSession.count({ where: { company_id: company.id } }),
      prisma.groupClassEnrollment.count({ where: { company_id: company.id } }),
      prisma.commerceOrder.count({ where: { company_id: company.id, order_number: { startsWith: 'DEMO-' } } }),
    ]);
    output[profile.key] = { customers, bookings, shifts, waitlist, eventBookings, freeRegistrations, classSessions, classEnrollments, orders };
  }
  return output;
}

function responseRecorder() {
  const state: { status: number; body: unknown } = { status: 200, body: null };
  const response = {
    status(code: number) { state.status = code; return response; },
    json(body: unknown) { state.body = body; return response; },
  };
  return { state, response };
}

async function runActiveCompanyMiddleware(req: any) {
  const { state, response } = responseRecorder();
  let nextCalled = false;
  await requireActiveCompany({ source: 'query' })(req, response as never, () => { nextCalled = true; });
  return { state, nextCalled, req };
}

test('demo sessions lock tenants and demo fixture seeding is idempotent', { skip: skipReason }, async () => {
  const demoSlugs = Object.values(DEMO_PROFILES).map((profile) => profile.companySlug);
  const unrelatedBefore = await prisma.company.findMany({
    where: { slug: { notIn: demoSlugs } },
    select: { id: true, name: true, updated_at: true },
    orderBy: { id: 'asc' },
  });

  await seedDemoProfiles();
  const firstCounts = await fixtureCounts();
  await seedDemoProfiles();
  const secondCounts = await fixtureCounts();
  assert.deepEqual(secondCounts, firstCounts, 'second seed pass should preserve fixture counts');
  assert.deepEqual(
    await prisma.company.findMany({
      where: { slug: { notIn: demoSlugs } },
      select: { id: true, name: true, updated_at: true },
      orderBy: { id: 'asc' },
    }),
    unrelatedBefore,
    'demo seed must leave non-demo companies unchanged',
  );

  const launched = await createDemoSession('reservas');
  assert.ok(!('error' in launched));
  const profile = DEMO_PROFILES.reservas;
  const company = await prisma.company.findUniqueOrThrow({ where: { slug: profile.companySlug }, select: { id: true } });
  const record = await prisma.demoSession.findUniqueOrThrow({ where: { tokenHash: hashDemoSessionToken(launched.token) } });
  assert.equal(record.companyId, company.id);
  assert.equal(record.profile, profile.key);
  assert.notEqual(record.tokenHash, launched.token, 'only the token digest is persisted');
  assert.ok(record.expiresAt.getTime() > Date.now());

  const resolved = await resolveDemoSession(launched.token);
  assert.ok(resolved);
  assert.equal(resolved.companyId, company.id);
  assert.equal(resolved.profile.companySlug, profile.companySlug);

  const request: any = {
    authUser: { id: resolved.userId },
    demoSessionContext: resolved,
    headers: { cookie: 'active_company_id=987654321' },
  };
  const { state, response } = responseRecorder();
  let nextCalled = false;
  await requireCompanyRole([CompanyUserRole.OWNER])(request, response as never, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'tampered active_company_id is ignored for demo requests');
  assert.equal(request.companyID, company.id);

  await revokeDemoSession(resolved.id);
  assert.equal(await resolveDemoSession(launched.token), null, 'revoked sessions no longer resolve');
  assert.equal(state.status, 200);
});

test('Restaurant demo context rejects tenant tampering, works without a selector, and scopes entity IDs', { skip: skipReason }, async () => {
  await seedDemoProfiles();
  const casaPatio = await prisma.company.findUniqueOrThrow({
    where: { slug: DEMO_PROFILES.restaurante.companySlug },
    select: { id: true, company_type_id: true },
  });
  const atelier = await prisma.company.findUniqueOrThrow({
    where: { slug: DEMO_PROFILES.reservas.companySlug },
    select: { id: true },
  });
  const foreignRestaurant = await prisma.company.findUniqueOrThrow({
    where: { slug: DEMO_PROFILES.completo.companySlug },
    select: { id: true },
  });
  const foreignReservation = await prisma.restaurantReservation.findFirstOrThrow({
    where: { company_id: foreignRestaurant.id },
    select: { id: true },
  });
  const suffix = `${Date.now()}`;
  const realCompany = await prisma.company.create({
    data: {
      slug: `p0-security-${suffix}`,
      name: 'P0 Security Test Company',
      phone: `000${suffix}`,
      timezone: 'America/La_Paz',
      company_type_id: casaPatio.company_type_id,
      is_active: true,
      availableUntil: new Date('2099-12-31T23:59:59.000Z'),
    },
    select: { id: true },
  });
  const normalUser = await prisma.user.create({
    data: { email: `p0-security-${suffix}@example.invalid`, name: 'P0 Security Switch User' },
    select: { id: true },
  });
  const companyMemberships = [casaPatio.id, atelier.id, realCompany.id].map((company_id) => ({
    company_id,
    user_id: normalUser.id,
    role: CompanyUserRole.OWNER,
  }));
  await prisma.companyUser.createMany({ data: companyMemberships });

  const demo = await createDemoSession('restaurante');
  assert.ok(!('error' in demo));
  const resolvedDemo = await resolveDemoSession(demo.token);
  assert.ok(resolvedDemo);
  const app = express();
  app.use(express.json());
  app.use(demoSessionMiddleware, demoReadOnlyMiddleware);
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use('/api/admin/restaurant', adminRestaurantReservationsRoutes);
  app.post('/test/restaurant-write', (req: any, _res, next) => {
    req.authUser = { id: normalUser.id };
    next();
  }, requireRestaurantCompanyContext([CompanyUserRole.OWNER]), (_req, res) => res.sendStatus(204));
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const request = (path: string, activeCompanyId?: number) => {
    const cookies = [`${DEMO_SESSION_COOKIE}=${demo.token}`];
    if (activeCompanyId !== undefined) cookies.push(`${ACTIVE_COMPANY_COOKIE_NAME}=${activeCompanyId}`);
    return fetch(`${baseUrl}${path}`, { headers: { cookie: cookies.join('; ') } });
  };
  const switchDemoCompany = (companyId: number) => fetch(`${baseUrl}/api/admin/auth/active-shop`, {
    method: 'POST',
    headers: { cookie: `${DEMO_SESSION_COOKIE}=${demo.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ company_id: companyId }),
  });

  try {
    const adminSession = await request('/api/admin/auth/session');
    assert.equal(adminSession.status, 200, 'admin session resolves directly from the demo session');
    const adminSessionPayload = await adminSession.json() as any;
    assert.equal(adminSessionPayload.data.activeCompanyId, casaPatio.id);
    assert.deepEqual(adminSessionPayload.data.companyUsers.map((membership: any) => membership.company_id), [casaPatio.id]);

    const lockedShop = await switchDemoCompany(casaPatio.id);
    assert.equal(lockedShop.status, 200, 'switching to the session Company remains valid');
    const lockedShopPayload = await lockedShop.json() as any;
    assert.equal(lockedShopPayload.data.activeCompanyId, casaPatio.id);
    assert.deepEqual(lockedShopPayload.data.companyUsers.map((membership: any) => membership.company_id), [casaPatio.id]);
    assert.equal(lockedShop.headers.get('set-cookie'), null, 'demo sessions do not initialize or change active_company_id');

    for (const id of [atelier.id, 2_147_483_647, realCompany.id]) {
      const response = await switchDemoCompany(id);
      assert.equal(response.status, 403);
      assert.equal((await response.json() as any).code, 'DEMO_COMPANY_MISMATCH');
    }

    const sameCompany = await request('/api/admin/restaurant/reservations', casaPatio.id);
    assert.equal(sameCompany.status, 200, 'matching active_company_id is accepted');

    const tamperedIds = [atelier.id, 2_147_483_647, realCompany.id];
    for (const id of tamperedIds) {
      const response = await request('/api/admin/restaurant/reservations', id);
      assert.equal(response.status, 403, `Company ${id} must be rejected`);
      assert.equal((await response.json() as any).code, 'DEMO_COMPANY_MISMATCH');
    }

    const withoutSelector = await request('/api/admin/restaurant/reservations');
    assert.equal(withoutSelector.status, 200, 'a fresh demo session supplies Restaurant Company context');

    const lockedWithoutQuery = await runActiveCompanyMiddleware({ method: 'GET', query: {}, demoSessionContext: resolvedDemo });
    assert.equal(lockedWithoutQuery.nextCalled, true, 'public tenant routes use the locked Company when company_id is omitted');
    assert.equal(lockedWithoutQuery.req.companyID, casaPatio.id);
    for (const id of [atelier.id, 2_147_483_647, realCompany.id]) {
      const mismatch = await runActiveCompanyMiddleware({ method: 'GET', query: { company_id: String(id) }, demoSessionContext: resolvedDemo });
      assert.equal(mismatch.state.status, 403);
      assert.equal((mismatch.state.body as any).code, 'DEMO_COMPANY_MISMATCH');
    }

    const idor = await request(`/api/admin/restaurant/reservations/${foreignReservation.id}`);
    assert.equal(idor.status, 404, 'a Restaurant entity owned by another Company is not visible');

    for (const companyId of [casaPatio.id, atelier.id, realCompany.id]) {
      const req: any = {
        authUser: { id: normalUser.id },
        headers: { cookie: `${ACTIVE_COMPANY_COOKIE_NAME}=${companyId}` },
      };
      const { state, response } = responseRecorder();
      let nextCalled = false;
      await requireRestaurantCompanyContext([CompanyUserRole.OWNER])(req, response as never, () => { nextCalled = true; });
      assert.equal(nextCalled, true, 'normal Company members retain active Company switching');
      assert.equal(req.companyID, companyId);
      assert.equal(state.status, 200);
    }
    for (const companyId of [casaPatio.id, atelier.id, realCompany.id]) {
      const switched = await AdminAuthService.switchActiveShop(normalUser.id, companyId);
      assert.equal(switched.error, false, 'normal users retain active-shop service switching');
      assert.equal((switched.data as any).activeCompanyId, companyId);
    }
    const missingNormalCompany = { authUser: { id: normalUser.id }, headers: {} } as any;
    const missingContext = responseRecorder();
    let normalNextCalled = false;
    await requireRestaurantCompanyContext([CompanyUserRole.OWNER])(missingNormalCompany, missingContext.response as never, () => { normalNextCalled = true; });
    assert.equal(normalNextCalled, false, 'normal Restaurant users still need an active company selection');
    assert.equal((missingContext.state.body as any).reason, 'ACTIVE_COMPANY_REQUIRED');
    const normalWrite = await fetch(`${baseUrl}/test/restaurant-write`, {
      method: 'POST',
      headers: { cookie: `${ACTIVE_COMPANY_COOKIE_NAME}=${casaPatio.id}` },
    });
    assert.equal(normalWrite.status, 204, 'normal Company members retain Restaurant writes');

    const operatorAudit = await inspectDemoOperatorMemberships();
    assert.equal(operatorAudit.operatorFound, true);
    assert.equal(operatorAudit.invalidMemberships.length, 0, 'every synthetic-operator membership is a designated demo Company');
    await assert.rejects(assertDemoOperatorMayJoinCompany(prisma, resolvedDemo.userId, realCompany.id), /cannot be attached to non-demo Company/);
    assert.equal(await prisma.companyUser.count({ where: { company_id: realCompany.id, user_id: resolvedDemo.userId, role: CompanyUserRole.OWNER } }), 0);

    await prisma.companyUser.create({
      data: { company_id: realCompany.id, user_id: resolvedDemo.userId, role: CompanyUserRole.OWNER },
    });
    try {
      await assert.rejects(assertDemoOperatorMembershipsAreDemo(), /non-demo Company memberships/);
    } finally {
      await prisma.companyUser.deleteMany({ where: { company_id: realCompany.id, user_id: resolvedDemo.userId } });
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await revokeDemoSession(resolvedDemo.id);
    await prisma.companyUser.deleteMany({ where: { user_id: normalUser.id } });
    await prisma.user.delete({ where: { id: normalUser.id } });
    await prisma.company.delete({ where: { id: realCompany.id } });
  }
});
