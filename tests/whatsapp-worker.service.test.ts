import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OutboundMessageChannel,
  OutboundMessageStatus,
  OutboundMessageType,
} from '@prisma/client';
import {
  classifyWhatsappError,
  retryDelayForAttempt,
  WhatsappWorker,
} from '../src/services/whatsapp-worker.service';
import {
  getWhatsappEnqueueLifecycleStatus,
  isWhatsappEnqueueAccepted,
  queueWhatsappBatch,
  queueWhatsappText,
} from '../src/services/outbound-message.service';
import { isWhatsappDeliverySuccessful } from '../src/utils/whatsappSender';
import { WahaRequestError } from '../src/services/waha.service';
import type { ClaimedOutboundJob, OutboundMessageRepository } from '../src/services/outbound-message.repository';
import { syncWhatsappOtpSessionDelivery } from '../src/services/outbound-message.repository';

function loggerSpy() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function job(overrides: Partial<ClaimedOutboundJob> = {}): ClaimedOutboundJob {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 1,
    company_id: 7,
    channel: OutboundMessageChannel.WHATSAPP,
    message_type: OutboundMessageType.TEXT,
    status: OutboundMessageStatus.PROCESSING,
    recipient: '59171234567@c.us',
    payload: { text: 'hello' },
    source_type: 'TEST',
    source_id: '1',
    batch_id: null,
    dedupe_key: 'test-job',
    attempts: 0,
    max_attempts: 3,
    next_attempt_at: now,
    locked_at: now,
    lock_owner: 'worker',
    last_error_code: null,
    last_error_message: null,
    provider_message_id: null,
    expires_at: null,
    sent_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function repository(overrides: Partial<OutboundMessageRepository> = {}): OutboundMessageRepository {
  return {
    async createJob() { throw new Error('not used'); },
    async createBatchAndJobs() { throw new Error('not used'); },
    async findJobById() { return null; },
    async findJobsByBatchId() { return []; },
    async claimNextPendingJob() { return null; },
    async recoverStaleProcessing() { return 0; },
    async expirePendingJobs() { return 0; },
    async markSent() {},
    async markRetryable() {},
    async markFailed() {},
    async markExpired() {},
    async retryJob() { return null; },
    async retryBatch() { return 0; },
    async cancelJob() { return false; },
    async cancelBatch() { return 0; },
    async getBatchProgress() { return null; },
    ...overrides,
  };
}

test('classifies WAHA outages as retryable without persisting provider response bodies', () => {
  const classification = classifyWhatsappError(new WahaRequestError('upstream failed', {
    operation: 'sending a WhatsApp text message',
    status: 503,
    responseBody: { apiKey: 'must-not-be-stored' },
  }));

  assert.deepEqual(classification, {
    retryable: true,
    status: 503,
    code: 'WAHA_HTTP_503',
    message: 'WAHA returned HTTP 503.',
  });
  assert.equal(retryDelayForAttempt(1), 15_000);
  assert.equal(retryDelayForAttempt(20), 3_600_000);
});

test('worker leaves pending jobs untouched while WAHA is disconnected', async () => {
  let claims = 0;
  let healthChecks = 0;
  const repo = repository({
    async claimNextPendingJob() {
      claims += 1;
      return null;
    },
  });
  const transport = {
    async getSessionInfo() {
      healthChecks += 1;
      return { status: 200, data: { status: 'STOPPED' } };
    },
    async sendTextNow() { throw new Error('must not send while disconnected'); },
    async sendImageNow() { throw new Error('must not send while disconnected'); },
  };

  const worker = new WhatsappWorker({
    repository: repo,
    transport,
    logger: loggerSpy(),
    env: {
      WAHA_ENABLED: 'true',
      WAHA_TRANSPORT: 'remote',
      WAHA_BASE_URL: 'https://waha.example.test',
      WAHA_MIN_INTERVAL_MS: '0',
    },
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    sleep: async () => {},
  });

  await worker.drainOnce();
  assert.equal(healthChecks, 1);
  assert.equal(claims, 0);
});

test('worker claims a job, schedules a bounded retry, and can resume after a later wakeup', async () => {
  const pendingJob = job();
  let claimed = true;
  let retry: { attempt: number; nextAttemptAt: Date; code: string } | null = null;
  let sent = false;
  const repo = repository({
    async claimNextPendingJob() {
      if (!claimed) return null;
      claimed = false;
      return pendingJob;
    },
    async markRetryable(_id, _owner, attempt, nextAttemptAt, code) {
      retry = { attempt, nextAttemptAt, code };
    },
    async markSent() {
      sent = true;
    },
  });
  let transportCalls = 0;
  const transport = {
    async getSessionInfo() {
      return { status: 200, data: { status: 'WORKING' } };
    },
    async sendTextNow() {
      transportCalls += 1;
      if (transportCalls === 1) {
        throw new WahaRequestError('temporary outage', { operation: 'send', status: 503 });
      }
      return { status: 200, data: { id: 'provider-1' } };
    },
    async sendImageNow() {
      return { status: 200, data: { id: 'provider-image-1' } };
    },
  };

  const now = new Date('2026-01-01T00:00:00.000Z');
  const worker = new WhatsappWorker({
    repository: repo,
    transport,
    logger: loggerSpy(),
    env: {
      WAHA_ENABLED: 'true',
      WAHA_TRANSPORT: 'remote',
      WAHA_BASE_URL: 'https://waha.example.test',
      WAHA_MIN_INTERVAL_MS: '0',
      WHATSAPP_MAX_ATTEMPTS: '3',
    },
    now: () => now,
    sleep: async () => {},
  });

  await worker.drainOnce();
  assert.equal(transportCalls, 1);
  const capturedRetry = retry as { attempt: number; nextAttemptAt: Date; code: string } | null;
  assert.ok(capturedRetry);
  assert.deepEqual({ attempt: capturedRetry.attempt, code: capturedRetry.code }, { attempt: 1, code: 'WAHA_HTTP_503' });
  assert.equal(capturedRetry.nextAttemptAt.toISOString(), '2026-01-01T00:00:15.000Z');
  assert.equal(sent, false);

  claimed = true;
  await worker.drainOnce();
  assert.equal(transportCalls, 2);
  assert.equal(sent, true);
});

test('worker marks permanent provider validation failures without retrying them', async () => {
  let claimed = true;
  let failed: { attempt: number; code: string; message: string } | null = null;
  const repo = repository({
    async claimNextPendingJob() {
      if (!claimed) return null;
      claimed = false;
      return job();
    },
    async markFailed(_id, _owner, attempt, code, message) {
      failed = { attempt, code, message };
    },
  });
  let sends = 0;
  const worker = new WhatsappWorker({
    repository: repo,
    transport: {
      async getSessionInfo() {
        return { status: 200, data: { status: 'WORKING' } };
      },
      async sendTextNow() {
        sends += 1;
        throw new WahaRequestError('invalid payload', { operation: 'send', status: 422 });
      },
      async sendImageNow() {
        throw new Error('not used');
      },
    },
    logger: loggerSpy(),
    env: {
      WAHA_ENABLED: 'true',
      WAHA_TRANSPORT: 'remote',
      WAHA_BASE_URL: 'https://waha.example.test',
      WAHA_MIN_INTERVAL_MS: '0',
    },
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    sleep: async () => {},
  });

  await worker.drainOnce();
  assert.equal(sends, 1);
  assert.deepEqual(failed, {
    attempt: 1,
    code: 'WAHA_HTTP_422',
    message: 'WAHA returned HTTP 422.',
  });
});

test('worker expires a job before transport submission when its deadline has passed', async () => {
  let claimed = true;
  let expired = 0;
  let sends = 0;
  const repo = repository({
    async claimNextPendingJob() {
      if (!claimed) return null;
      claimed = false;
      return job({ expires_at: new Date('2025-12-31T23:59:59.000Z') });
    },
    async markExpired() {
      expired += 1;
    },
  });
  const worker = new WhatsappWorker({
    repository: repo,
    transport: {
      async getSessionInfo() {
        return { status: 200, data: { status: 'WORKING' } };
      },
      async sendTextNow() {
        sends += 1;
        throw new Error('must not submit expired job');
      },
      async sendImageNow() {
        throw new Error('not used');
      },
    },
    logger: loggerSpy(),
    env: {
      WAHA_ENABLED: 'true',
      WAHA_TRANSPORT: 'remote',
      WAHA_BASE_URL: 'https://waha.example.test',
      WAHA_MIN_INTERVAL_MS: '0',
    },
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    sleep: async () => {},
  });

  await worker.drainOnce();
  assert.equal(expired, 1);
  assert.equal(sends, 0);
});

test('pending jobs resume after WAHA reconnects without a new enqueue request', async () => {
  let connected = false;
  let claimed = false;
  let sent = false;
  const repo = repository({
    async claimNextPendingJob() {
      if (claimed) return null;
      claimed = true;
      return job();
    },
    async markSent() {
      sent = true;
    },
  });
  const worker = new WhatsappWorker({
    repository: repo,
    transport: {
      async getSessionInfo() {
        return { status: 200, data: { status: connected ? 'WORKING' : 'STARTING' } };
      },
      async sendTextNow() {
        return { status: 200, data: { id: 'reconnected-message' } };
      },
      async sendImageNow() {
        throw new Error('not used');
      },
    },
    logger: loggerSpy(),
    env: {
      WAHA_ENABLED: 'true',
      WAHA_TRANSPORT: 'remote',
      WAHA_BASE_URL: 'https://waha.example.test',
      WAHA_MIN_INTERVAL_MS: '0',
    },
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    sleep: async () => {},
  });

  await worker.drainOnce();
  assert.equal(claimed, false);
  assert.equal(sent, false);

  connected = true;
  await worker.drainOnce();
  assert.equal(claimed, true);
  assert.equal(sent, true);
});

test('a recreated worker recovers an abandoned lease and sends the job once', async () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  let state = job({
    status: OutboundMessageStatus.PROCESSING,
    locked_at: new Date('2025-12-31T23:55:00.000Z'),
    lock_owner: 'dead-worker',
  });
  let sends = 0;
  const repo = repository({
    async recoverStaleProcessing(cutoff, recoveryNow) {
      if (state.status === OutboundMessageStatus.PROCESSING && state.locked_at && state.locked_at < cutoff) {
        state = {
          ...state,
          status: OutboundMessageStatus.PENDING,
          locked_at: null,
          lock_owner: null,
          next_attempt_at: recoveryNow ?? new Date(),
        };
        return 1;
      }
      return 0;
    },
    async claimNextPendingJob(owner, claimNow) {
      if (state.status !== OutboundMessageStatus.PENDING) return null;
      state = { ...state, status: OutboundMessageStatus.PROCESSING, lock_owner: owner, locked_at: claimNow ?? new Date() };
      return state;
    },
    async markSent(_id, owner) {
      if (state.lock_owner !== owner) return;
      state = { ...state, status: OutboundMessageStatus.SENT, locked_at: null, lock_owner: null, sent_at: now };
    },
  });
  const worker = new WhatsappWorker({
    repository: repo,
    transport: {
      async getSessionInfo() {
        return { status: 200, data: { status: 'WORKING' } };
      },
      async sendTextNow() {
        sends += 1;
        return { status: 200, data: { id: 'recovered-message' } };
      },
      async sendImageNow() {
        throw new Error('not used');
      },
    },
    logger: loggerSpy(),
    env: {
      WAHA_ENABLED: 'true',
      WAHA_TRANSPORT: 'remote',
      WAHA_BASE_URL: 'https://waha.example.test',
      WAHA_MIN_INTERVAL_MS: '0',
      WHATSAPP_JOB_LEASE_MS: '120000',
    },
    now: () => now,
    sleep: async () => {},
  });

  await worker.drainOnce();
  assert.equal(sends, 1);
  assert.equal(state.status, OutboundMessageStatus.SENT);
});

test('two workers cannot claim the same pending job in the same repository', async () => {
  let state = job({ status: OutboundMessageStatus.PENDING });
  let sends = 0;
  const repo = repository({
    async claimNextPendingJob(owner, claimNow) {
      if (state.status !== OutboundMessageStatus.PENDING) return null;
      state = { ...state, status: OutboundMessageStatus.PROCESSING, lock_owner: owner, locked_at: claimNow ?? new Date() };
      return state;
    },
    async markSent(_id, owner) {
      if (state.lock_owner === owner) state = { ...state, status: OutboundMessageStatus.SENT, lock_owner: null, locked_at: null };
    },
  });
  const transport = {
    async getSessionInfo() {
      return { status: 200, data: { status: 'WORKING' } };
    },
    async sendTextNow() {
      sends += 1;
      return { status: 200, data: { id: 'one-send' } };
    },
    async sendImageNow() {
      throw new Error('not used');
    },
  };
  const options = {
    repository: repo,
    transport,
    logger: loggerSpy(),
    env: {
      WAHA_ENABLED: 'true',
      WAHA_TRANSPORT: 'remote',
      WAHA_BASE_URL: 'https://waha.example.test',
      WAHA_MIN_INTERVAL_MS: '0',
    },
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    sleep: async () => {},
  };
  const firstWorker = new WhatsappWorker(options);
  const secondWorker = new WhatsappWorker(options);

  await Promise.all([firstWorker.drainOnce(), secondWorker.drainOnce()]);
  assert.equal(sends, 1);
  assert.equal(state.status, OutboundMessageStatus.SENT);
});

test('queue APIs return durable acceptance and dedupe results without touching WAHA', async () => {
  const created: Array<Record<string, unknown>> = [];
  const fakeJob = job({ id: 42, status: OutboundMessageStatus.PENDING });
  const repo = repository({
    async createJob(input) {
      created.push(input as unknown as Record<string, unknown>);
      return { job: fakeJob, duplicate: created.length > 1 };
    },
    async createBatchAndJobs(input) {
      return {
        batchId: 'batch-1',
        jobs: input.jobs.map((_, index) => job({ id: index + 1, batch_id: 'batch-1' })),
        createdJobCount: input.jobs.length,
        duplicateBatch: false,
      };
    },
  });
  const providerState = {
    enabled: true,
    mode: 'remote' as const,
    configured: true,
    reason: null,
  };

  const first = await queueWhatsappText('71234567', 'Hello', {
    sourceType: 'TEST',
    sourceId: '1',
    dedupeKey: 'same-message',
  }, { repository: repo, providerState });
  const second = await queueWhatsappText('71234567', 'Hello', {
    sourceType: 'TEST',
    sourceId: '1',
    dedupeKey: 'same-message',
  }, { repository: repo, providerState });
  const batch = await queueWhatsappBatch([
    { recipient: '71234567', text: 'one', sourceId: '1', dedupeKey: 'one' },
    { recipient: '71234568', text: 'two', sourceId: '2', dedupeKey: 'two' },
  ], {
    sourceType: 'TEST_BATCH',
    idempotencyKey: 'batch-key',
  }, { repository: repo, providerState });

  assert.equal(first.status, 'QUEUED');
  assert.equal(getWhatsappEnqueueLifecycleStatus(first), OutboundMessageStatus.PENDING);
  assert.equal(isWhatsappDeliverySuccessful(first), false);
  assert.equal(second.status, 'DUPLICATE');
  assert.equal(isWhatsappEnqueueAccepted(second), true);
  assert.equal(getWhatsappEnqueueLifecycleStatus({
    accepted: true,
    status: 'DUPLICATE',
    existingStatus: OutboundMessageStatus.SENT,
  }), OutboundMessageStatus.SENT);
  assert.equal(isWhatsappDeliverySuccessful({
    accepted: true,
    status: 'DUPLICATE',
    existingStatus: OutboundMessageStatus.SENT,
  }), true);
  assert.equal(getWhatsappEnqueueLifecycleStatus({
    accepted: true,
    status: 'DUPLICATE',
    existingStatus: OutboundMessageStatus.FAILED,
  }), OutboundMessageStatus.FAILED);
  assert.equal(isWhatsappEnqueueAccepted({
    accepted: true,
    status: 'DUPLICATE',
    existingStatus: OutboundMessageStatus.FAILED,
  }), false);
  assert.equal(batch.batchId, 'batch-1');
  assert.equal(batch.queued, 2);
  assert.equal(created.length, 2);
  assert.equal(created[0].recipient, '59171234567@c.us');
});

test('enqueue rejects a stale caller-supplied expiry before creating a job', async () => {
  let createCalls = 0;
  const result = await queueWhatsappText('71234567', 'stale expiry', {
    sourceType: 'GROUP_EVENT_MASS_MESSAGE',
    expiresAt: new Date('2025-12-31T23:59:59.000Z'),
  }, {
    repository: repository({
      async createJob() {
        createCalls += 1;
        return { job: job({ status: OutboundMessageStatus.PENDING }), duplicate: false };
      },
    }),
    providerState: {
      enabled: true,
      mode: 'remote',
      configured: true,
      reason: null,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, 'INVALID_EXPIRY');
  assert.equal(createCalls, 0);

  let batchCreateCalls = 0;
  const batchResult = await queueWhatsappBatch([
    { recipient: '71234567', text: 'stale expiry', expiresAt: new Date('2025-12-31T23:59:59.000Z') },
  ], {
    sourceType: 'GROUP_EVENT_MASS_MESSAGE',
    idempotencyKey: 'stale-batch-expiry',
  }, {
    repository: repository({
      async createBatchAndJobs() {
        batchCreateCalls += 1;
        throw new Error('should not create a stale batch');
      },
    }),
    providerState: {
      enabled: true,
      mode: 'remote',
      configured: true,
      reason: null,
    },
  });

  assert.equal(batchResult.accepted, false);
  assert.equal(batchResult.reason, 'INVALID_EXPIRY');
  assert.equal(batchCreateCalls, 0);
});

test('late-linked OTP sessions mirror terminal outbox status without false success', async () => {
  const updates: Array<{ where: unknown; data: unknown }> = [];
  const client = {
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
      $queryRaw: async () => [{ status: OutboundMessageStatus.EXPIRED }],
      commerceGuestCheckoutSession: {
        updateMany: async (input: { where: unknown; data: unknown }) => {
          updates.push(input);
          return { count: 1 };
        },
      },
    }),
  } as any;

  await syncWhatsappOtpSessionDelivery(
    77,
    { kind: 'COMMERCE_GUEST_CHECKOUT', sessionId: 'otp-session-1' },
    client,
  );

  assert.deepEqual(updates, [{
    where: { id: 'otp-session-1' },
    data: { phone_delivery_status: OutboundMessageStatus.EXPIRED, phone_delivery_succeeded: false },
  }]);
});
