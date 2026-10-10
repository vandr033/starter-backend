import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_PROFILES, getDemoProfile, getDemoProfileForCompanySlug } from '../src/config/demo-profiles';
import { requireActiveCompany } from '../src/middlewares/requireActiveCompany';
import { runWithDemoRequestContext } from '../src/services/demo-request-context';
import { createDemoSession, hashDemoSessionToken } from '../src/services/demo-session.service';
import { triggerCustomerExportWebhook } from '../src/services/customer.service';
import { issueUploadIntent, UPLOAD_PURPOSES } from '../src/services/upload-intent.service';
import { deliverEmail } from '../src/services/notification-provider.service';
import { queueWhatsappText } from '../src/services/outbound-message.service';
import { StorageService } from '../src/services/storage.service';
import {
  demoCompanySlugWriteGuard,
  demoReadOnlyMiddleware,
  demoTenantWriteGuard,
} from '../src/middlewares/demo-session.middleware';

function responseMock() {
  const result: { statusCode: number; body?: unknown } = { statusCode: 200 };
  const response = {
    status(code: number) {
      result.statusCode = code;
      return response;
    },
    json(body: unknown) {
      result.body = body;
      return response;
    },
  };
  return { result, response };
}

test('demo registry only resolves canonical profile keys and seeded slugs', () => {
  assert.equal(Object.keys(DEMO_PROFILES).length, 6);
  assert.equal(getDemoProfile('reservas')?.companySlug, 'atelier-27-demo');
  assert.equal(getDemoProfile('constructor'), null);
  assert.equal(getDemoProfileForCompanySlug('club-horizonte-demo')?.key, 'completo');
  assert.equal(getDemoProfileForCompanySlug('customer-controlled-demo'), null);
});

test('demo session token hashing is stable and returns only a SHA-256 digest', () => {
  const first = hashDemoSessionToken('opaque-demo-token');
  assert.equal(first, hashDemoSessionToken('opaque-demo-token'));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, 'opaque-demo-token');
});

test('invalid demo profiles are rejected before database access', async () => {
  assert.deepEqual(await createDemoSession('made-up-profile'), { error: 'INVALID_DEMO_PROFILE' });
});

test('demo read-only middleware permits reads, locked Company validation, and sign-out, but denies other writes', () => {
  const session = { demoSessionContext: { id: 'demo', companyId: 1 } };

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const { result, response } = responseMock();
    let nextCalled = false;
    demoReadOnlyMiddleware(
      { method, originalUrl: '/api/admin/services', url: '/api/admin/services', ...session } as never,
      response as never,
      () => { nextCalled = true; },
    );
    assert.equal(nextCalled, false);
    assert.equal(result.statusCode, 403);
    assert.equal((result.body as { code: string }).code, 'DEMO_READ_ONLY');
  }

  for (const [method, originalUrl] of [
    ['GET', '/api/admin/dashboard/metrics'],
    ['POST', '/api/admin/auth/active-shop'],
    ['POST', '/api/admin/auth/sign-out'],
  ]) {
    const { response } = responseMock();
    let nextCalled = false;
    demoReadOnlyMiddleware(
      { method, originalUrl, url: originalUrl, ...session } as never,
      response as never,
      () => { nextCalled = true; },
    );
    assert.equal(nextCalled, true);
  }

  const normalRequest = { method: 'POST', originalUrl: '/api/admin/services', url: '/api/admin/services' };
  let normalRequestContinued = false;
  demoReadOnlyMiddleware(normalRequest as never, responseMock().response as never, () => { normalRequestContinued = true; });
  assert.equal(normalRequestContinued, true, 'non-demo admin writes keep their existing path');
});

test('public demo writes are rejected by known slug before reaching route handlers', async () => {
  const { result, response } = responseMock();
  let nextCalled = false;
  demoCompanySlugWriteGuard(
    { method: 'POST', params: { slug: 'atelier-27-demo' } } as never,
    response as never,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, false);
  assert.equal(result.statusCode, 403);

  const tenantResult = responseMock();
  nextCalled = false;
  await demoTenantWriteGuard(
    { method: 'POST', originalUrl: '/api/public/commerce/club-horizonte-demo/orders' } as never,
    tenantResult.response as never,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, false);
  assert.equal(tenantResult.result.statusCode, 403);

  let normalPublicWriteContinued = false;
  demoCompanySlugWriteGuard(
    { method: 'POST', params: { slug: 'normal-business' } } as never,
    responseMock().response as never,
    () => { normalPublicWriteContinued = true; },
  );
  assert.equal(normalPublicWriteContinued, true, 'non-demo public businesses retain their write path');
});

test('demo tenants cannot obtain upload intents', async () => {
  await assert.rejects(
    issueUploadIntent({ slug: 'atelier-27-demo', purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF }),
    (error: unknown) => {
      const uploadError = error as { statusCode?: number; errorCode?: string };
      return uploadError.statusCode === 403 && uploadError.errorCode === 'UPLOAD_INTENT_INVALID';
    },
  );
});

test('active-company request tampering is rejected before company lookup', async () => {
  const { result, response } = responseMock();
  let nextCalled = false;
  await requireActiveCompany({ source: 'body' })(
    { method: 'GET', body: { company_id: 987654 }, demoSessionContext: { companyId: 101 } } as never,
    response as never,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal((result.body as { code: string }).code, 'DEMO_COMPANY_MISMATCH');
});

test('demo request context suppresses email, WhatsApp, and file writes at service boundaries', async () => {
  const outcomes = await runWithDemoRequestContext({
    isDemo: true,
    sessionId: 'demo-session',
    profileKey: 'reservas',
    companyId: 101,
  }, async () => {
    const email = await deliverEmail({ to: 'customer@example.test', subject: 'Demo', html: '<p>Demo</p>' });
    const whatsapp = await queueWhatsappText('+59170000000', 'Demo message');
    await assert.rejects(
      StorageService.saveFile(101, 'qr', 'demo-proof.png', Buffer.from('no-write')),
      /DEMO_READ_ONLY/,
    );
    return { email, whatsapp };
  });

  assert.deepEqual(outcomes.email, { provider: 'email', status: 'SKIPPED', reason: 'DEMO_READ_ONLY' });
  assert.equal(outcomes.whatsapp.accepted, false);
  assert.equal(outcomes.whatsapp.reason, 'DEMO_READ_ONLY');
});

test('fixture contacts are blocked even when a caller omits tenant context', async () => {
  const email = await deliverEmail({ to: 'demo.customer@demo.priconpri.invalid', subject: 'Demo', html: '<p>Demo</p>' });
  const whatsapp = await queueWhatsappText('0000000000', 'Demo message');
  assert.deepEqual(email, { provider: 'email', status: 'SKIPPED', reason: 'DEMO_READ_ONLY' });
  assert.equal(whatsapp.accepted, false);
  assert.equal(whatsapp.reason, 'DEMO_READ_ONLY');
});

test('demo request context prevents customer-export webhook execution', async () => {
  const result = await runWithDemoRequestContext({
    isDemo: true,
    sessionId: 'demo-session',
    profileKey: 'reservas',
    companyId: 101,
  }, () => triggerCustomerExportWebhook({
    companyId: 101,
    companyName: 'Atelier 27',
    customers: [],
  }));

  assert.deepEqual(result, { triggered: false });
});
