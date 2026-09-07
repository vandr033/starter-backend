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

const mysqlIntegrationEnabled =
  process.env.RUN_MYSQL_INTEGRATION === '1' &&
  /^mysql(?:s)?:\/\//i.test(process.env.DATABASE_URL || '');
const skipReason = mysqlIntegrationEnabled
  ? false
  : 'RUN_MYSQL_INTEGRATION=1 and a mysql:// DATABASE_URL are required';

const repository = createOutboundMessageRepository(prisma);
let server: Server | null = null;
let batchId: string | null = null;
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

  const expired = await createLinkedSemanticJob('expired', new Date(Date.now() - 1_000));
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
