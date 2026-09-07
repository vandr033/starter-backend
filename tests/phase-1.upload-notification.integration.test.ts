import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import { prisma } from '../src/prisma/client';
import {
  assertStoredUpload,
  consumeUploadIntent,
  issueUploadIntent,
  recordStoredUpload,
  UPLOAD_PURPOSES,
} from '../src/services/upload-intent.service';
import { StorageService } from '../src/services/storage.service';
import { UploadSecurityError, UPLOAD_ERROR_CODES } from '../src/utils/upload-errors';

/**
 * This test intentionally uses the migration-created MySQL schema. It is
 * skipped by the ordinary unit suite and is enabled by test:mysql and the
 * disposable Phase 0/1 verifier.
 */
const mysqlIntegrationEnabled =
  process.env.RUN_MYSQL_INTEGRATION === '1' &&
  /^mysql(?:s)?:\/\//i.test(process.env.DATABASE_URL || '');
const skipReason = mysqlIntegrationEnabled
  ? false
  : 'RUN_MYSQL_INTEGRATION=1 and a mysql:// DATABASE_URL are required';

let companyA: { id: number; slug: string } | null = null;
let companyB: { id: number; slug: string } | null = null;
const intentNonces: string[] = [];
const storedPaths: string[] = [];

function tokenNonce(token: string): string {
  const payload = token.split('.')[1];
  assert.ok(payload);
  return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { nonce: string }).nonce;
}

function trackIntent<T extends { uploadIntent: string }>(intent: T): T {
  intentNonces.push(tokenNonce(intent.uploadIntent));
  return intent;
}

async function assertIntentError(action: () => Promise<unknown>, expectedCode: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof UploadSecurityError);
    assert.equal(error.errorCode, expectedCode);
    return true;
  });
}

before(async () => {
  if (!mysqlIntegrationEnabled) return;
  await prisma.$connect();
  companyA = await prisma.company.findUnique({
    where: { slug: 'fade-factory-barbershop' },
    select: { id: true, slug: true },
  });
  companyB = await prisma.company.findUnique({
    where: { slug: 'glow-nails-studio' },
    select: { id: true, slug: true },
  });
  assert.ok(companyA, 'The seed must provide the first public tenant');
  assert.ok(companyB, 'The seed must provide the second public tenant');
});

after(async () => {
  if (!mysqlIntegrationEnabled) return;
  for (const path of storedPaths) {
    await StorageService.deleteFile(path).catch(() => undefined);
  }
  if (intentNonces.length > 0) {
    await prisma.uploadIntent.deleteMany({ where: { nonce: { in: intentNonces } } });
  }
  await prisma.$disconnect();
});

test('real MySQL enforces scoped upload intent lifecycle and persistence', { skip: skipReason }, async () => {
  if (!companyA || !companyB) throw new Error('The seeded public tenants are required');
  const tenantA = companyA;
  const tenantB = companyB;

  await assertIntentError(
    () => consumeUploadIntent('', {
      expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
      companyId: tenantA.id,
    }),
    UPLOAD_ERROR_CODES.INTENT_INVALID,
  );

  await assertIntentError(
    () => issueUploadIntent({ slug: 'does-not-exist-phase-1', purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF }),
    UPLOAD_ERROR_CODES.INTENT_INVALID,
  );

  const anonymous = trackIntent(await issueUploadIntent({
    slug: tenantA.slug,
    purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
    context: { type: 'BOOKING' },
  }));
  assert.equal(anonymous.purpose, UPLOAD_PURPOSES.BOOKING_QR_PROOF);
  assert.equal(anonymous.contextId, null);
  assert.equal(anonymous.maxBytes, 5 * 1024 * 1024);
  assert.deepEqual(anonymous.allowedMimeTypes, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

  const consumed = await consumeUploadIntent(anonymous.uploadIntent, {
    expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
    companyId: tenantA.id,
    contextId: null,
  });
  assert.equal(consumed.companyId, tenantA.id);
  assert.equal(consumed.nonce, tokenNonce(anonymous.uploadIntent));

  await assertIntentError(
    () => consumeUploadIntent(anonymous.uploadIntent, {
      expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
      companyId: tenantA.id,
      contextId: null,
    }),
    UPLOAD_ERROR_CODES.INTENT_REPLAYED,
  );

  const scopedFile = await StorageService.saveFile(
    tenantA.id,
    'qr',
    `phase-1-${Date.now()}-${randomBytes(8).toString('hex')}.png`,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  storedPaths.push(scopedFile);
  await recordStoredUpload(consumed, scopedFile);
  const stored = await assertStoredUpload({
    rawPathOrUrl: `/api/storage/${scopedFile}`,
    companyId: tenantA.id,
    purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
    contextId: null,
  });
  assert.equal(stored.relativePath, scopedFile);
  assert.equal(stored.intent.id, consumed.databaseId);

  const wrongTenant = trackIntent(await issueUploadIntent({
    slug: tenantB.slug,
    purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
  }));
  await assertIntentError(
    () => consumeUploadIntent(wrongTenant.uploadIntent, {
      expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
      companyId: tenantA.id,
      contextId: null,
    }),
    UPLOAD_ERROR_CODES.INTENT_INVALID,
  );
  const tenantBound = await consumeUploadIntent(wrongTenant.uploadIntent, {
    expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
    companyId: tenantB.id,
    contextId: null,
  });
  assert.equal(tenantBound.companyId, tenantB.id);

  const wrongPurpose = trackIntent(await issueUploadIntent({
    slug: tenantA.slug,
    purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
  }));
  await assertIntentError(
    () => consumeUploadIntent(wrongPurpose.uploadIntent, {
      expectedPurpose: UPLOAD_PURPOSES.ORDER_PAYMENT_PROOF,
      companyId: tenantA.id,
      contextId: null,
    }),
    UPLOAD_ERROR_CODES.INTENT_INVALID,
  );

  const forged = trackIntent(await issueUploadIntent({
    slug: tenantA.slug,
    purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
  }));
  const forgedToken = `${forged.uploadIntent.slice(0, -1)}${forged.uploadIntent.endsWith('a') ? 'b' : 'a'}`;
  await assertIntentError(
    () => consumeUploadIntent(forgedToken, {
      expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
      companyId: tenantA.id,
      contextId: null,
    }),
    UPLOAD_ERROR_CODES.INTENT_INVALID,
  );

  const expired = trackIntent(await issueUploadIntent({
    slug: tenantA.slug,
    purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
  }));
  await prisma.uploadIntent.update({
    where: { nonce: tokenNonce(expired.uploadIntent) },
    data: { expires_at: new Date(0) },
  });
  await assertIntentError(
    () => consumeUploadIntent(expired.uploadIntent, {
      expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
      companyId: tenantA.id,
      contextId: null,
    }),
    UPLOAD_ERROR_CODES.INTENT_EXPIRED,
  );

  const userBound = trackIntent(await issueUploadIntent({
    slug: tenantA.slug,
    purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
    context: { type: 'BOOKING' },
    authUserId: 'user_barber_owner',
  }));
  assert.equal(userBound.contextId, 'BOOKING:user_barber_owner');
  await assertIntentError(
    () => consumeUploadIntent(userBound.uploadIntent, {
      expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
      companyId: tenantA.id,
      contextId: null,
    }),
    UPLOAD_ERROR_CODES.INTENT_INVALID,
  );
  const userBoundConsumed = await consumeUploadIntent(userBound.uploadIntent, {
    expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
    companyId: tenantA.id,
    contextId: 'BOOKING:user_barber_owner',
  });
  assert.equal(userBoundConsumed.contextId, 'BOOKING:user_barber_owner');

  const anonymousFlow = trackIntent(await issueUploadIntent({
    slug: tenantA.slug,
    purpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
    context: { type: 'BOOKING', id: 'guest-flow-0123456789' },
  }));
  assert.equal(anonymousFlow.contextId, 'BOOKING:guest-flow-0123456789');
  await assertIntentError(
    () => consumeUploadIntent(anonymousFlow.uploadIntent, {
      expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
      companyId: tenantA.id,
      contextId: null,
    }),
    UPLOAD_ERROR_CODES.INTENT_INVALID,
  );
  const anonymousFlowConsumed = await consumeUploadIntent(anonymousFlow.uploadIntent, {
    expectedPurpose: UPLOAD_PURPOSES.BOOKING_QR_PROOF,
    companyId: tenantA.id,
    contextId: 'BOOKING:guest-flow-0123456789',
  });
  assert.equal(anonymousFlowConsumed.contextId, 'BOOKING:guest-flow-0123456789');
});
