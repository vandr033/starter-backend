import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import {
  OutboundMessageChannel,
  OutboundMessageStatus,
  OutboundMessageType,
  RestaurantNotificationChannel,
  RestaurantNotificationEvent,
  RestaurantNotificationStatus,
  RestaurantNotificationTrigger,
} from '@prisma/client';
import { prisma } from '../src/prisma/client';
import { queueWhatsappBatch } from '../src/services/outbound-message.service';
import { createOutboundMessageRepository } from '../src/services/outbound-message.repository';
import { WhatsappWorker } from '../src/services/whatsapp-worker.service';
import { createWahaClient } from '../src/services/waha.service';
import { sendEventMassMessage } from '../src/services/group-booking.service';

const mysqlIntegrationEnabled =
  process.env.RUN_MYSQL_INTEGRATION === '1' &&
  /^mysql(?:s)?:\/\//i.test(process.env.DATABASE_URL || '');
const skipReason = mysqlIntegrationEnabled
  ? false
  : 'RUN_MYSQL_INTEGRATION=1 and a mysql:// DATABASE_URL are required';

const repository = createOutboundMessageRepository(prisma);
let server: Server | null = null;
let batchId: string | null = null;
const manualEventBatchIds: string[] = [];
const manualEventIds: number[] = [];
const manualEventRegistrationIds: number[] = [];
const semanticJobIds: number[] = [];
const semanticLogIds: number[] = [];

function jsonResponse(response: import('node:http').ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(payload));
}

async function listen(serverToStart: Server): Promise<number> {
  await new Promise<void>((resolve) => serverToStart.listen(0, '127.0.0.1', resolve));
  const address = serverToStart.address();
  assert.ok(address && typeof address === 'object');
  return (address as AddressInfo).port;
}

async function close(serverToClose: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    serverToClose.close((error) => (error ? reject(error) : resolve()));
  });
}

before(async () => {
  if (!mysqlIntegrationEnabled) return;
  await prisma.$connect();
});

after(async () => {
  if (!mysqlIntegrationEnabled) return;
  if (server) await close(server);
  if (batchId) {
    await prisma.outboundMessageJob.deleteMany({ where: { batch_id: batchId } });
    await prisma.outboundMessageBatch.delete({ where: { id: batchId } });
  }
  for (const manualEventBatchId of manualEventBatchIds) {
    await prisma.outboundMessageJob.deleteMany({ where: { batch_id: manualEventBatchId } });
    await prisma.outboundMessageBatch.delete({ where: { id: manualEventBatchId } });
  }
  if (manualEventRegistrationIds.length > 0) {
    await prisma.freeEventRegistration.deleteMany({ where: { id: { in: manualEventRegistrationIds } } });
  }
  for (const manualEventId of manualEventIds) {
    await prisma.groupEvent.delete({ where: { id: manualEventId } });
  }
  if (semanticJobIds.length > 0) {
    await prisma.outboundMessageJob.deleteMany({ where: { id: { in: semanticJobIds } } });
  }
  if (semanticLogIds.length > 0) {
    await prisma.restaurantNotificationLog.deleteMany({ where: { id: { in: semanticLogIds } } });
  }
  await prisma.$disconnect();
});

async function createLinkedSemanticJob(label: string, expiresAt?: Date | null): Promise<{ jobId: number; logId: number }> {
  const company = await prisma.company.findFirst({ select: { id: true } });
  assert.ok(company);
  const log = await prisma.restaurantNotificationLog.create({
    data: {
      company_id: company.id,
      event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED,
      channel: RestaurantNotificationChannel.WHATSAPP,
      status: RestaurantNotificationStatus.PENDING,
      trigger: RestaurantNotificationTrigger.MANUAL,
      recipient: '59171234000',
      dedup_key: `semantic-status-log:${label}:${Date.now()}`,
    },
  });
  const created = await repository.createJob({
    companyId: company.id,
    channel: OutboundMessageChannel.WHATSAPP,
    messageType: OutboundMessageType.TEXT,
    recipient: '59171234000@c.us',
    payload: { text: `semantic-status-${label}` },
    sourceType: 'SEMANTIC_STATUS_TEST',
    sourceId: String(log.id),
    dedupeKey: `semantic-status-job:${label}:${Date.now()}`,
    expiresAt,
    restaurantNotificationLogId: log.id,
  });
  semanticJobIds.push(created.job.id);
  semanticLogIds.push(log.id);
  return { jobId: created.job.id, logId: log.id };
}

async function moveSemanticJobToProcessing(jobId: number, lockOwner: string, now: Date): Promise<void> {
  await prisma.outboundMessageJob.update({
    where: { id: jobId },
    data: {
      status: OutboundMessageStatus.PROCESSING,
      locked_at: now,
      lock_owner: lockOwner,
    },
  });
}

async function createManualEventCase(
  companyId: number,
  label: string,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  const unique = `${Date.now()}-${manualEventIds.length}`;
  const event = await prisma.groupEvent.create({
    data: {
      company_id: companyId,
      title: `Manual mass-message ${label}`,
      slug: `manual-mass-message-${label}-${unique}`,
      is_free: true,
      price_cents: 0,
      max_capacity: 1,
      start_at: startAt,
      end_at: endAt,
    },
  });
  manualEventIds.push(event.id);

  const registration = await prisma.freeEventRegistration.create({
    data: {
      group_event_id: event.id,
      company_id: companyId,
      reservation_code: `T${unique}`,
      first_name: label,
      last_name: 'Recipient',
      gender: 'PREFER_NOT_TO_SAY',
      age: 30,
      email: `manual-mass-${label}-${unique}@example.test`,
      phone_prefix: '591',
      phone_number: `7123${String(400 + manualEventRegistrationIds.length).padStart(4, '0')}`,
      tos_accepted: true,
      status: 'CONFIRMED',
    },
  });
  manualEventRegistrationIds.push(registration.id);

  const result = await sendEventMassMessage(companyId, event.id, {
    message: 'Manual timing regression',
    delivery_mode: 'WHATSAPP',
    idempotency_key: `manual-timing-regression:${unique}`,
  });
  const resultData = result.data as { batch_id?: string; queued_whatsapp?: number };
  assert.equal(result.error, false);
  assert.equal(resultData.queued_whatsapp, 1);
  assert.ok(resultData.batch_id);
  manualEventBatchIds.push(resultData.batch_id);

  const jobs = await prisma.outboundMessageJob.findMany({
    where: { batch_id: resultData.batch_id },
  });
  assert.equal(jobs.length, 1);
  assert.ok(jobs.every((job) =>
    job.status === OutboundMessageStatus.PENDING
    && job.expires_at === null
    && job.attempts === 0,
  ));
}

test('real MySQL outbox survives a WAHA outage and worker recreation', { skip: skipReason }, async () => {
  let connected = true;
  let sendCount = 0;
  const providerMessageIds: string[] = [];

  server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/api/sessions/default') {
      jsonResponse(response, 200, { name: 'default', status: connected ? 'WORKING' : 'STOPPED' });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/sendText') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        assert.ok(body.includes('chatId'));
        if (!connected) {
          jsonResponse(response, 503, { error: 'simulated outage' });
          return;
        }

        sendCount += 1;
        const providerId = `integration-message-${sendCount}`;
        providerMessageIds.push(providerId);
        jsonResponse(response, 200, { id: providerId });

        // The first accepted message is followed by an outage. The worker's
        // current drain cycle will encounter the outage on the next job.
        if (sendCount === 1) connected = false;
      });
      return;
    }

    jsonResponse(response, 404, { error: 'not found' });
  });

  const port = await listen(server);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WAHA_ENABLED: 'true',
    WAHA_TRANSPORT: 'remote',
    WAHA_BASE_URL: `http://127.0.0.1:${port}`,
    WAHA_SESSION: 'default',
    WAHA_TIMEOUT_MS: '2000',
    WAHA_MIN_INTERVAL_MS: '0',
    WHATSAPP_MAX_ATTEMPTS: '3',
    WHATSAPP_JOB_LEASE_MS: '120000',
  };
  const transport = createWahaClient({ env });
  // Keep the controllable worker clock just ahead of the DB timestamps that
  // the real repository writes while the batch is inserted.
  let currentTime = new Date(Date.now() + 1_000);
  const now = () => new Date(currentTime);

  const queued = await queueWhatsappBatch(
    [
      { recipient: '59171234567', text: 'integration-one', sourceId: 'one', dedupeKey: 'integration-one' },
      { recipient: '59171234568', text: 'integration-two', sourceId: 'two', dedupeKey: 'integration-two' },
      { recipient: '59171234569', text: 'integration-three', sourceId: 'three', dedupeKey: 'integration-three' },
    ],
    {
      sourceType: 'WHATSAPP_INTEGRATION_TEST',
      idempotencyKey: `whatsapp-integration-${Date.now()}`,
      metadata: { purpose: 'durable-outbox-verification' },
    },
    {
      repository,
      providerState: { enabled: true, mode: 'remote', configured: true, reason: null },
    },
  );

  assert.equal(queued.accepted, true);
  assert.equal(queued.queued, 3);
  assert.ok(queued.batchId);
  batchId = queued.batchId;

  const firstWorker = new WhatsappWorker({ repository, transport, env, now, sleep: async () => {} });
  await firstWorker.drainOnce();

  let progress = await repository.getBatchProgress(batchId);
  assert.ok(progress);
  assert.equal(progress.sent, 1);
  assert.equal(progress.pending, 2);
  assert.equal(progress.processing, 0);
  assert.equal(sendCount, 1);

  // A worker recreation while WAHA is down must leave the durable rows alone.
  const restartedWhileDisconnected = new WhatsappWorker({ repository, transport, env, now, sleep: async () => {} });
  await restartedWhileDisconnected.drainOnce();
  progress = await repository.getBatchProgress(batchId);
  assert.ok(progress);
  assert.equal(progress.sent, 1);
  assert.equal(progress.pending, 2);
  assert.equal(sendCount, 1);

  connected = true;
  currentTime = new Date(currentTime.getTime() + 16_000);
  const restartedAfterReconnect = new WhatsappWorker({ repository, transport, env, now, sleep: async () => {} });
  await restartedAfterReconnect.drainOnce();

  progress = await repository.getBatchProgress(batchId);
  assert.ok(progress);
  assert.equal(progress.sent, 3);
  assert.equal(progress.pending, 0);
  assert.equal(progress.processing, 0);
  assert.equal(progress.failed, 0);
  assert.equal(progress.status, 'COMPLETED');
  assert.equal(sendCount, 3);
  assert.deepEqual(providerMessageIds, [
    'integration-message-1',
    'integration-message-2',
    'integration-message-3',
  ]);

  const jobs = await repository.findJobsByBatchId(batchId);
  assert.equal(jobs.length, 3);
  assert.ok(jobs.every((job) => job.status === 'SENT'));
  assert.equal(new Set(jobs.map((job) => job.provider_message_id)).size, 3);
});

test('real MySQL manual event mass messages stay queued after the event and deliver', { skip: skipReason }, async () => {
  const company = await prisma.company.findFirst({ select: { id: true } });
  assert.ok(company);

  const now = new Date();
  const event = await prisma.groupEvent.create({
    data: {
      company_id: company.id,
      title: 'Manual mass-message regression',
      slug: `manual-mass-message-regression-${Date.now()}`,
      is_free: true,
      price_cents: 0,
      max_capacity: 20,
      start_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      end_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    },
  });
  manualEventIds.push(event.id);

  await prisma.freeEventRegistration.createMany({
    data: Array.from({ length: 20 }, (_, index) => ({
      group_event_id: event.id,
      company_id: company.id,
      reservation_code: `M${String(index).padStart(5, '0')}`,
      first_name: `Regression ${index}`,
      last_name: 'Recipient',
      gender: 'PREFER_NOT_TO_SAY',
      age: 30,
      email: `manual-mass-regression-${Date.now()}-${index}@example.test`,
      phone_prefix: '591',
      phone_number: `71234${String(index).padStart(3, '0')}`,
      tos_accepted: true,
      status: 'CONFIRMED',
    })),
  });
  const registrations = await prisma.freeEventRegistration.findMany({
    where: { group_event_id: event.id },
    select: { id: true },
  });
  manualEventRegistrationIds.push(...registrations.map((registration) => registration.id));

  const previousWahaEnabled = process.env.WAHA_ENABLED;
  const previousWahaTransport = process.env.WAHA_TRANSPORT;
  process.env.WAHA_ENABLED = 'true';
  process.env.WAHA_TRANSPORT = 'sink';
  try {
    const result = await sendEventMassMessage(company.id, event.id, {
      message: 'Gracias por asistir',
      delivery_mode: 'WHATSAPP',
      idempotency_key: `manual-event-regression-${Date.now()}`,
    });
    const resultData = result.data as { batch_id?: string; queued_whatsapp?: number };
    assert.equal(result.error, false);
    assert.equal(resultData.queued_whatsapp, 20);
    assert.ok(resultData.batch_id);
    const mainBatchId = resultData.batch_id;
    manualEventBatchIds.push(mainBatchId);

    const sameDay = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    await createManualEventCase(
      company.id,
      'weeks-past',
      new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000),
      new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
    );
    await createManualEventCase(
      company.id,
      'same-day-completed',
      sameDay,
      new Date(now.getTime() - 60 * 60 * 1000),
    );
    await createManualEventCase(
      company.id,
      'future',
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    );

    let jobs = await prisma.outboundMessageJob.findMany({
      where: { batch_id: mainBatchId },
      orderBy: { id: 'asc' },
    });
    assert.equal(jobs.length, 20);
    assert.ok(jobs.every((job) =>
      job.status === OutboundMessageStatus.PENDING
      && job.expires_at === null
      && job.attempts === 0,
    ));

    let progress = await repository.getBatchProgress(mainBatchId);
    assert.ok(progress);
    assert.deepEqual(
      { total: progress.total, pending: progress.pending, processing: progress.processing, sent: progress.sent, failed: progress.failed, expired: progress.expired, cancelled: progress.cancelled },
      { total: 20, pending: 20, processing: 0, sent: 0, failed: 0, expired: 0, cancelled: 0 },
    );

    await prisma.outboundMessageJob.updateMany({
      where: { id: { in: jobs.slice(0, 5).map((job) => job.id) } },
      data: { status: OutboundMessageStatus.SENT, sent_at: now },
    });
    await prisma.outboundMessageJob.update({
      where: { id: jobs[5].id },
      data: { status: OutboundMessageStatus.PROCESSING, locked_at: now, lock_owner: 'progress-test' },
    });
    progress = await repository.getBatchProgress(mainBatchId);
    assert.ok(progress);
    assert.deepEqual(
      { total: progress.total, pending: progress.pending, processing: progress.processing, sent: progress.sent, failed: progress.failed, expired: progress.expired, cancelled: progress.cancelled },
      { total: 20, pending: 14, processing: 1, sent: 5, failed: 0, expired: 0, cancelled: 0 },
    );

    await prisma.outboundMessageJob.updateMany({
      where: { batch_id: mainBatchId },
      data: {
        status: OutboundMessageStatus.PENDING,
        sent_at: null,
        locked_at: null,
        lock_owner: null,
      },
    });
    await prisma.outboundMessageJob.updateMany({
      where: { id: { in: jobs.slice(0, 19).map((job) => job.id) } },
      data: { status: OutboundMessageStatus.SENT, sent_at: now },
    });
    await prisma.outboundMessageJob.update({
      where: { id: jobs[19].id },
      data: { status: OutboundMessageStatus.FAILED, attempts: 1, last_error_code: 'TEST_FAILURE' },
    });
    progress = await repository.getBatchProgress(mainBatchId);
    assert.ok(progress);
    assert.deepEqual(
      { pending: progress.pending, processing: progress.processing, sent: progress.sent, failed: progress.failed, expired: progress.expired, cancelled: progress.cancelled, terminal: progress.terminal },
      { pending: 0, processing: 0, sent: 19, failed: 1, expired: 0, cancelled: 0, terminal: 20 },
    );
    await prisma.outboundMessageJob.update({
      where: { id: jobs[0].id },
      data: { status: OutboundMessageStatus.EXPIRED, last_error_code: 'EXPIRED' },
    });
    progress = await repository.getBatchProgress(mainBatchId);
    assert.ok(progress);
    assert.deepEqual(
      { sent: progress.sent, failed: progress.failed, expired: progress.expired, cancelled: progress.cancelled, terminal: progress.terminal },
      { sent: 18, failed: 1, expired: 1, cancelled: 0, terminal: 20 },
    );

    await prisma.outboundMessageJob.updateMany({
      where: { batch_id: mainBatchId },
      data: {
        status: OutboundMessageStatus.PENDING,
        sent_at: null,
        locked_at: null,
        lock_owner: null,
        expires_at: null,
        attempts: 0,
        last_error_code: null,
        last_error_message: null,
      },
    });
    await prisma.outboundMessageJob.update({
      where: { id: jobs[0].id },
      data: {
        status: OutboundMessageStatus.FAILED,
        expires_at: new Date(now.getTime() - 1_000),
        attempts: 1,
      },
    });
    const retried = await repository.retryJob(jobs[0].id, company.id);
    assert.ok(retried);
    assert.equal(retried.status, OutboundMessageStatus.PENDING);
    assert.equal(retried.expires_at, null);
    await prisma.outboundMessageJob.update({
      where: { id: jobs[1].id },
      data: {
        status: OutboundMessageStatus.FAILED,
        expires_at: new Date(now.getTime() - 1_000),
        attempts: 1,
      },
    });
    assert.equal(await repository.retryBatch(mainBatchId, company.id), 1);
    const batchRetried = await repository.findJobById(jobs[1].id);
    assert.ok(batchRetried);
    assert.equal(batchRetried.status, OutboundMessageStatus.PENDING);
    assert.equal(batchRetried.expires_at, null);

    const worker = new WhatsappWorker({
      repository,
      env: {
        ...process.env,
        WAHA_ENABLED: 'true',
        WAHA_TRANSPORT: 'sink',
        WAHA_MIN_INTERVAL_MS: '0',
      },
      now: () => new Date(),
      sleep: async () => {},
    });
    await worker.drainOnce();

    jobs = await prisma.outboundMessageJob.findMany({ where: { batch_id: mainBatchId } });
    assert.equal(jobs.length, 20);
    assert.ok(jobs.every((job) => job.status === OutboundMessageStatus.SENT));
    progress = await repository.getBatchProgress(mainBatchId);
    assert.ok(progress);
    assert.equal(progress.sent, 20);
    assert.equal(progress.pending, 0);
    assert.equal(progress.failed, 0);
    for (const manualEventBatchId of manualEventBatchIds) {
      const timingJobs = await prisma.outboundMessageJob.findMany({ where: { batch_id: manualEventBatchId } });
      assert.ok(timingJobs.every((job) => job.status === OutboundMessageStatus.SENT));
    }
  } finally {
    if (previousWahaEnabled === undefined) delete process.env.WAHA_ENABLED;
    else process.env.WAHA_ENABLED = previousWahaEnabled;
    if (previousWahaTransport === undefined) delete process.env.WAHA_TRANSPORT;
    else process.env.WAHA_TRANSPORT = previousWahaTransport;
  }
});

test('linked notification lifecycle never treats enqueue as provider success', { skip: skipReason }, async () => {
  const queued = await createLinkedSemanticJob('queued');
  let log = await prisma.restaurantNotificationLog.findUnique({ where: { id: queued.logId } });
  assert.ok(log);
  assert.equal(log.status, RestaurantNotificationStatus.PENDING);
  assert.equal(log.sent_at, null);

  const acceptedAt = new Date();
  await moveSemanticJobToProcessing(queued.jobId, 'semantic-worker-sent', acceptedAt);
  await repository.markSent(queued.jobId, 'semantic-worker-sent', 'semantic-provider-1');
  const sentJob = await repository.findJobById(queued.jobId);
  log = await prisma.restaurantNotificationLog.findUnique({ where: { id: queued.logId } });
  assert.ok(sentJob);
  assert.ok(log);
  assert.equal(sentJob.status, OutboundMessageStatus.SENT);
  assert.equal(log.status, RestaurantNotificationStatus.SENT);
  assert.ok(sentJob.sent_at);
  assert.ok(log.sent_at);
  assert.equal(log.sent_at?.getTime(), sentJob.sent_at?.getTime());
  assert.equal(log.provider_id, 'semantic-provider-1');

  const retry = await createLinkedSemanticJob('retry');
  const retryNow = new Date();
  await moveSemanticJobToProcessing(retry.jobId, 'semantic-worker-retry', retryNow);
  const nextAttemptAt = new Date(retryNow.getTime() + 15_000);
  await repository.markRetryable(
    retry.jobId,
    'semantic-worker-retry',
    1,
    nextAttemptAt,
    'WAHA_HTTP_503',
    'WAHA returned HTTP 503.',
  );
  const retryJob = await repository.findJobById(retry.jobId);
  log = await prisma.restaurantNotificationLog.findUnique({ where: { id: retry.logId } });
  assert.ok(retryJob);
  assert.ok(log);
  assert.equal(retryJob.status, OutboundMessageStatus.PENDING);
  assert.equal(log.status, RestaurantNotificationStatus.PENDING);
  assert.equal(log.sent_at, null);
  assert.equal(retryJob.sent_at, null);
  assert.equal(retryJob.next_attempt_at.getTime(), nextAttemptAt.getTime());

  const permanent = await createLinkedSemanticJob('permanent');
  await moveSemanticJobToProcessing(permanent.jobId, 'semantic-worker-failed', new Date());
  await repository.markFailed(
    permanent.jobId,
    'semantic-worker-failed',
    1,
    'WAHA_HTTP_422',
    'WAHA returned HTTP 422.',
  );
  const failedJob = await repository.findJobById(permanent.jobId);
  log = await prisma.restaurantNotificationLog.findUnique({ where: { id: permanent.logId } });
  assert.ok(failedJob);
  assert.ok(log);
  assert.equal(failedJob.status, OutboundMessageStatus.FAILED);
  assert.equal(log.status, RestaurantNotificationStatus.FAILED);
  assert.equal(log.sent_at, null);
  assert.equal(failedJob.sent_at, null);

  const expired = await createLinkedSemanticJob('expired');
  await prisma.outboundMessageJob.update({
    where: { id: expired.jobId },
    data: { expires_at: new Date(Date.now() - 1_000) },
  });
  await repository.expirePendingJobs(new Date());
  const expiredJob = await repository.findJobById(expired.jobId);
  log = await prisma.restaurantNotificationLog.findUnique({ where: { id: expired.logId } });
  assert.ok(expiredJob);
  assert.ok(log);
  assert.equal(expiredJob.status, OutboundMessageStatus.EXPIRED);
  assert.equal(log.status, RestaurantNotificationStatus.EXPIRED);
  assert.equal(expiredJob.sent_at, null);
  assert.equal(log.sent_at, null);

  const restarted = await createLinkedSemanticJob('restarted');
  const staleAt = new Date(Date.now() - 10 * 60_000);
  await moveSemanticJobToProcessing(restarted.jobId, 'dead-semantic-worker', staleAt);
  await repository.recoverStaleProcessing(new Date(Date.now() - 5 * 60_000), new Date());
  log = await prisma.restaurantNotificationLog.findUnique({ where: { id: restarted.logId } });
  assert.ok(log);
  assert.equal(log.status, RestaurantNotificationStatus.PENDING);
  assert.equal(log.sent_at, null);
  const resumedAt = new Date();
  await moveSemanticJobToProcessing(restarted.jobId, 'restarted-semantic-worker', resumedAt);
  await repository.markSent(restarted.jobId, 'restarted-semantic-worker', 'semantic-provider-restarted');
  const resumedJob = await repository.findJobById(restarted.jobId);
  log = await prisma.restaurantNotificationLog.findUnique({ where: { id: restarted.logId } });
  assert.ok(resumedJob);
  assert.ok(log);
  assert.equal(resumedJob.status, OutboundMessageStatus.SENT);
  assert.equal(log.status, RestaurantNotificationStatus.SENT);
  assert.ok(log.sent_at);
  assert.ok(resumedJob.sent_at);
  assert.equal(log.sent_at?.getTime(), resumedJob.sent_at?.getTime());
});
