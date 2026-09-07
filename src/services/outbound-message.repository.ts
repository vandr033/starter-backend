import { createHash } from 'node:crypto';
import {
  OutboundMessageChannel,
  OutboundMessageStatus,
  OutboundMessageType,
  RestaurantNotificationStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { prisma } from '../prisma/client';

export type OutboundMessageClient = PrismaClient;

export interface CreateOutboundJobInput {
  companyId?: number | null;
  channel: OutboundMessageChannel;
  messageType: OutboundMessageType;
  recipient: string;
  payload: Prisma.InputJsonValue;
  sourceType: string;
  sourceId?: string | null;
  batchId?: string | null;
  dedupeKey: string;
  maxAttempts?: number;
  expiresAt?: Date | null;
  nextAttemptAt?: Date;
  restaurantNotificationLogId?: number | null;
  bookingNotificationAttemptId?: number | null;
  installmentReminderLogId?: number | null;
  groupTicketId?: number | null;
}

export interface CreateOutboundBatchInput {
  id?: string;
  companyId?: number | null;
  channel: OutboundMessageChannel;
  sourceType: string;
  sourceId?: string | null;
  idempotencyKey: string;
  createdByUserId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  jobs: CreateOutboundJobInput[];
}

export interface ClaimedOutboundJob {
  id: number;
  company_id: number | null;
  channel: OutboundMessageChannel;
  message_type: OutboundMessageType;
  status: OutboundMessageStatus;
  recipient: string;
  payload: Prisma.JsonValue;
  source_type: string;
  source_id: string | null;
  batch_id: string | null;
  dedupe_key: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: Date;
  locked_at: Date | null;
  lock_owner: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  provider_message_id: string | null;
  expires_at: Date | null;
  sent_at: Date | null;
  group_ticket_id?: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface OutboundBatchProgress {
  batch: {
    id: string;
    company_id: number | null;
    channel: OutboundMessageChannel;
    source_type: string;
    source_id: string | null;
    idempotency_key: string;
    created_by_user_id: string | null;
    metadata: Prisma.JsonValue | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
  };
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  expired: number;
  cancelled: number;
  terminal: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'EMPTY';
}

export interface OutboundMessageRepository {
  createJob(input: CreateOutboundJobInput): Promise<{ job: ClaimedOutboundJob; duplicate: boolean }>;
  createBatchAndJobs(input: CreateOutboundBatchInput): Promise<{
    batchId: string;
    jobs: ClaimedOutboundJob[];
    createdJobCount: number;
    duplicateBatch: boolean;
  }>;
  findJobById(id: number, companyId?: number): Promise<ClaimedOutboundJob | null>;
  findJobsByBatchId(batchId: string, companyId?: number): Promise<ClaimedOutboundJob[]>;
  claimNextPendingJob(lockOwner: string, now?: Date): Promise<ClaimedOutboundJob | null>;
  recoverStaleProcessing(cutoff: Date, now?: Date): Promise<number>;
  expirePendingJobs(now?: Date): Promise<number>;
  markSent(id: number, lockOwner: string, providerMessageId?: string | null): Promise<void>;
  markRetryable(
    id: number,
    lockOwner: string,
    attempt: number,
    nextAttemptAt: Date,
    code: string,
    message: string,
  ): Promise<void>;
  markFailed(id: number, lockOwner: string, attempt: number, code: string, message: string): Promise<void>;
  markExpired(id: number, lockOwner?: string | null, code?: string): Promise<void>;
  retryJob(id: number, companyId?: number): Promise<ClaimedOutboundJob | null>;
  retryBatch(batchId: string, companyId?: number): Promise<number>;
  cancelJob(id: number, companyId?: number): Promise<boolean>;
  cancelBatch(batchId: string, companyId?: number): Promise<number>;
  getBatchProgress(batchId: string, companyId?: number): Promise<OutboundBatchProgress | null>;
}

export type WhatsappOtpSessionLink =
  | { kind: 'PAID_EVENT_GUEST_CHECKOUT'; sessionId: string }
  | { kind: 'GROUP_CLASS_GUEST_ENROLLMENT'; sessionId: string }
  | { kind: 'COMMERCE_GUEST_CHECKOUT'; sessionId: string };

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toClaimedJob(value: unknown): ClaimedOutboundJob {
  return value as ClaimedOutboundJob;
}

async function refreshBatchCompletion(
  client: PrismaClient | Prisma.TransactionClient,
  batchId: string | null | undefined,
): Promise<void> {
  if (!batchId) return;

  const openCount = await client.outboundMessageJob.count({
    where: {
      batch_id: batchId,
      status: {
        in: [OutboundMessageStatus.PENDING, OutboundMessageStatus.PROCESSING],
      },
    },
  });

  if (openCount > 0) return;

  await client.outboundMessageBatch.updateMany({
    where: {
      id: batchId,
      completed_at: null,
    },
    data: { completed_at: new Date() },
  });
}

type LifecycleSyncDetails = {
  providerMessageId?: string | null;
  sentAt?: Date | null;
  statusAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  nextAttemptAt?: Date | null;
  attempt?: number;
  countTicketDelivery?: boolean;
};

async function attachLinkedRecords(
  client: PrismaClient | Prisma.TransactionClient,
  jobId: number,
  input: CreateOutboundJobInput,
): Promise<void> {
  if (input.restaurantNotificationLogId != null) {
    const result = await client.restaurantNotificationLog.updateMany({
      where: { id: input.restaurantNotificationLogId },
      data: { outbound_message_job_id: jobId },
    });
    if (result.count !== 1) throw new Error('Restaurant notification log not found for WhatsApp job.');
  }
  if (input.bookingNotificationAttemptId != null) {
    const result = await client.bookingNotificationAttempt.updateMany({
      where: { id: input.bookingNotificationAttemptId },
      data: { outbound_message_job_id: jobId },
    });
    if (result.count !== 1) throw new Error('Booking notification attempt not found for WhatsApp job.');
  }
  if (input.installmentReminderLogId != null) {
    const result = await client.installmentReminderLog.updateMany({
      where: { id: input.installmentReminderLogId },
      data: { outbound_message_job_id: jobId },
    });
    if (result.count !== 1) throw new Error('Installment reminder log not found for WhatsApp job.');
  }
}

async function syncLinkedRecords(
  client: PrismaClient | Prisma.TransactionClient,
  jobId: number,
  status: OutboundMessageStatus,
  details: LifecycleSyncDetails = {},
): Promise<void> {
  const sent = status === OutboundMessageStatus.SENT;
  const errorState = status === OutboundMessageStatus.FAILED
    || status === OutboundMessageStatus.EXPIRED
    || status === OutboundMessageStatus.CANCELLED;
  const sentAt = sent ? details.sentAt ?? null : null;
  const providerMessageId = sent ? details.providerMessageId ?? null : null;
  const errorCode = errorState ? details.errorCode ?? null : null;
  const errorMessage = errorState ? details.errorMessage ?? null : null;
  const lifecycleStatus = status as string;

  await client.restaurantNotificationLog.updateMany({
    where: { outbound_message_job_id: jobId },
    data: {
      status: lifecycleStatus as RestaurantNotificationStatus,
      provider_id: providerMessageId,
      error_code: errorCode,
      error_message: errorMessage,
      sent_at: sentAt,
    },
  });

  await client.bookingNotificationAttempt.updateMany({
    where: { outbound_message_job_id: jobId },
    data: {
      status: lifecycleStatus,
      reason: errorMessage ?? errorCode,
      ...(details.attempt === undefined ? {} : { attempt_count: details.attempt }),
      ...(details.statusAt === undefined ? {} : { last_attempted_at: details.statusAt }),
      next_retry_at: status === OutboundMessageStatus.PENDING ? details.nextAttemptAt ?? null : null,
      sent_at: sentAt,
    },
  });

  await client.installmentReminderLog.updateMany({
    where: { outbound_message_job_id: jobId },
    data: {
      status: lifecycleStatus,
      sent_at: sentAt,
    },
  });

  await client.paidEventGuestCheckoutSession.updateMany({
    where: { phone_delivery_job_id: jobId },
    data: {
      phone_delivery_status: lifecycleStatus,
      phone_delivery_succeeded: sent,
    },
  });

  await client.groupClassGuestEnrollmentSession.updateMany({
    where: { phone_delivery_job_id: jobId },
    data: {
      phone_delivery_status: lifecycleStatus,
      phone_delivery_succeeded: sent,
    },
  });

  await client.commerceGuestCheckoutSession.updateMany({
    where: { phone_delivery_job_id: jobId },
    data: {
      phone_delivery_status: lifecycleStatus,
      phone_delivery_succeeded: sent,
    },
  });

  if (status === OutboundMessageStatus.SENT) {
    const guestLogs = await client.restaurantNotificationLog.findMany({
      where: {
        outbound_message_job_id: jobId,
        reservation_guest_id: { not: null },
      },
      select: { reservation_guest_id: true },
    });
    const guestIds = Array.from(new Set(
      guestLogs
        .map((log) => log.reservation_guest_id)
        .filter((guestId): guestId is number => guestId != null),
    ));
    if (guestIds.length > 0 && sentAt) {
      await client.restaurantReservationGuest.updateMany({
        where: { id: { in: guestIds } },
        data: { invited_at: sentAt },
      });
    }
  }

  if (status === OutboundMessageStatus.SENT && details.countTicketDelivery) {
    const linkedJob = await client.outboundMessageJob.findUnique({
      where: { id: jobId },
      select: { group_ticket_id: true },
    });
    if (linkedJob?.group_ticket_id != null) {
      await client.groupTicket.updateMany({
        where: { id: linkedJob.group_ticket_id },
        data: {
          last_sent_at: sentAt ?? new Date(),
          delivery_count: { increment: 1 },
        },
      });
    }
  }
}

function buildJobWhere(id: number, companyId?: number) {
  return {
    id,
    ...(companyId === undefined ? {} : { company_id: companyId }),
  };
}

function scopedBatchIdempotencyKey(companyId: number | null | undefined, idempotencyKey: string): string {
  const scope = companyId == null ? 'global' : `company:${companyId}`;
  const value = `${scope}:${idempotencyKey}`;
  if (value.length <= 191) return value;
  return `${scope}:${createHash('sha256').update(value).digest('hex')}`;
}

export function createOutboundMessageRepository(client: PrismaClient = prisma): OutboundMessageRepository {
  return {
    async createJob(input) {
      try {
        return await client.$transaction(async (tx) => {
          const existing = await tx.outboundMessageJob.findUnique({
            where: { dedupe_key: input.dedupeKey },
          });
          if (existing) {
            await attachLinkedRecords(tx, existing.id, input);
            await syncLinkedRecords(tx, existing.id, existing.status, {
              providerMessageId: existing.provider_message_id,
              sentAt: existing.sent_at,
              errorCode: existing.last_error_code,
              errorMessage: existing.last_error_message,
            });
            return { job: toClaimedJob(existing), duplicate: true };
          }

          const created = await tx.outboundMessageJob.create({
            data: {
              company_id: input.companyId ?? null,
              channel: input.channel,
              message_type: input.messageType,
              recipient: input.recipient,
              payload: input.payload,
              source_type: input.sourceType,
              source_id: input.sourceId ?? null,
              batch_id: input.batchId ?? null,
              dedupe_key: input.dedupeKey,
              max_attempts: input.maxAttempts ?? 8,
              expires_at: input.expiresAt ?? null,
              next_attempt_at: input.nextAttemptAt ?? new Date(),
              group_ticket_id: input.groupTicketId ?? null,
            },
          });
          await attachLinkedRecords(tx, created.id, input);
          if (input.batchId) {
            await tx.outboundMessageBatch.updateMany({
              where: { id: input.batchId },
              data: { completed_at: null },
            });
          }
          await syncLinkedRecords(tx, created.id, created.status);
          return { job: toClaimedJob(created), duplicate: false };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const duplicate = await client.outboundMessageJob.findUnique({
          where: { dedupe_key: input.dedupeKey },
        });
        if (!duplicate) throw error;
        await attachLinkedRecords(client, duplicate.id, input);
        await syncLinkedRecords(client, duplicate.id, duplicate.status, {
          providerMessageId: duplicate.provider_message_id,
          sentAt: duplicate.sent_at,
          errorCode: duplicate.last_error_code,
          errorMessage: duplicate.last_error_message,
        });
        return { job: toClaimedJob(duplicate), duplicate: true };
      }
    },

    async createBatchAndJobs(input) {
      const idempotencyKey = scopedBatchIdempotencyKey(input.companyId, input.idempotencyKey);
      const existingBatch = await client.outboundMessageBatch.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      if (existingBatch) {
        const jobs = await client.outboundMessageJob.findMany({
          where: { batch_id: existingBatch.id },
          orderBy: { id: 'asc' },
        });
        return {
          batchId: existingBatch.id,
          jobs: jobs.map(toClaimedJob),
          createdJobCount: 0,
          duplicateBatch: true,
        };
      }

      try {
        const result = await client.$transaction(async (tx) => {
          const batch = await tx.outboundMessageBatch.create({
            data: {
              ...(input.id ? { id: input.id } : {}),
              company_id: input.companyId ?? null,
              channel: input.channel,
              source_type: input.sourceType,
              source_id: input.sourceId ?? null,
              idempotency_key: idempotencyKey,
              created_by_user_id: input.createdByUserId ?? null,
              metadata: input.metadata ?? undefined,
            },
          });

          if (input.jobs.length > 0) {
            await tx.outboundMessageJob.createMany({
              data: input.jobs.map((job) => ({
                company_id: job.companyId ?? input.companyId ?? null,
                channel: job.channel,
                message_type: job.messageType,
                recipient: job.recipient,
                payload: job.payload,
                source_type: job.sourceType,
                source_id: job.sourceId ?? null,
                batch_id: batch.id,
                dedupe_key: job.dedupeKey,
                max_attempts: job.maxAttempts ?? 8,
                expires_at: job.expiresAt ?? null,
                next_attempt_at: job.nextAttemptAt ?? new Date(),
                group_ticket_id: job.groupTicketId ?? null,
              })),
              skipDuplicates: true,
            });
          }

          const jobs = await tx.outboundMessageJob.findMany({
            where: { batch_id: batch.id },
            orderBy: { id: 'asc' },
          });

          return {
            batchId: batch.id,
            jobs: jobs.map(toClaimedJob),
            createdJobCount: jobs.length,
            duplicateBatch: false,
          };
        });

        return result;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const duplicateBatch = await client.outboundMessageBatch.findUnique({
          where: { idempotency_key: idempotencyKey },
        });
        if (!duplicateBatch) throw error;
        const jobs = await client.outboundMessageJob.findMany({
          where: { batch_id: duplicateBatch.id },
          orderBy: { id: 'asc' },
        });
        return {
          batchId: duplicateBatch.id,
          jobs: jobs.map(toClaimedJob),
          createdJobCount: 0,
          duplicateBatch: true,
        };
      }
    },

    async findJobById(id, companyId) {
      const job = await client.outboundMessageJob.findFirst({
        where: buildJobWhere(id, companyId),
      });
      return job ? toClaimedJob(job) : null;
    },

    async findJobsByBatchId(batchId, companyId) {
      const jobs = await client.outboundMessageJob.findMany({
        where: {
          batch_id: batchId,
          ...(companyId === undefined ? {} : { company_id: companyId }),
        },
        orderBy: { id: 'asc' },
      });
      return jobs.map(toClaimedJob);
    },

    async claimNextPendingJob(lockOwner, now = new Date()) {
      return client.$transaction(async (tx) => {
        let candidate: { id: number } | undefined;
        try {
          const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
            SELECT id
            FROM outbound_message_job
            WHERE status = ${OutboundMessageStatus.PENDING}
              AND next_attempt_at <= ${now}
              AND attempts < max_attempts
              AND (expires_at IS NULL OR expires_at > ${now})
            ORDER BY id ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `);
          candidate = rows[0];
        } catch {
          // MySQL 5.7 does not support SKIP LOCKED. The conditional update
          // below remains atomic and is a safe compatibility fallback.
          const fallback = await tx.outboundMessageJob.findFirst({
            where: {
              status: OutboundMessageStatus.PENDING,
              next_attempt_at: { lte: now },
              OR: [{ expires_at: null }, { expires_at: { gt: now } }],
            },
            orderBy: { id: 'asc' },
            select: { id: true },
          });
          candidate = fallback ?? undefined;
        }

        if (!candidate) return null;

        const claimed = await tx.outboundMessageJob.updateMany({
          where: {
            id: candidate.id,
            status: OutboundMessageStatus.PENDING,
          },
          data: {
            status: OutboundMessageStatus.PROCESSING,
            locked_at: now,
            lock_owner: lockOwner,
          },
        });
        if (claimed.count !== 1) return null;

        const job = await tx.outboundMessageJob.findUnique({
          where: { id: candidate.id },
        });
        if (!job) return null;
        await syncLinkedRecords(tx, job.id, OutboundMessageStatus.PROCESSING, {
          statusAt: now,
          attempt: job.attempts + 1,
        });
        return toClaimedJob(job);
      });
    },

    async recoverStaleProcessing(cutoff, now = new Date()) {
      return client.$transaction(async (tx) => {
        const staleJobs = await tx.outboundMessageJob.findMany({
          where: {
            status: OutboundMessageStatus.PROCESSING,
            locked_at: { lt: cutoff },
          },
          select: { id: true },
        });
        if (staleJobs.length === 0) return 0;
        await tx.outboundMessageJob.updateMany({
          where: {
            status: OutboundMessageStatus.PROCESSING,
            locked_at: { lt: cutoff },
          },
          data: {
            status: OutboundMessageStatus.PENDING,
            next_attempt_at: now,
            locked_at: null,
            lock_owner: null,
            last_error_code: 'STALE_PROCESSING',
            last_error_message: 'Recovered after a worker lease expired.',
          },
        });
        for (const staleJob of staleJobs) {
          await syncLinkedRecords(tx, staleJob.id, OutboundMessageStatus.PENDING, {
            statusAt: now,
            errorCode: 'STALE_PROCESSING',
            errorMessage: 'Recovered after a worker lease expired.',
            nextAttemptAt: now,
          });
        }
        return staleJobs.length;
      });
    },

    async expirePendingJobs(now = new Date()) {
      return client.$transaction(async (tx) => {
        const expiringJobs = await tx.outboundMessageJob.findMany({
          where: {
            status: OutboundMessageStatus.PENDING,
            expires_at: { lte: now },
          },
          select: { id: true, batch_id: true },
        });
        if (expiringJobs.length === 0) return 0;
        await tx.outboundMessageJob.updateMany({
          where: {
            status: OutboundMessageStatus.PENDING,
            expires_at: { lte: now },
          },
          data: {
            status: OutboundMessageStatus.EXPIRED,
            last_error_code: 'EXPIRED',
            last_error_message: 'Message expired before it could be sent.',
          },
        });

        for (const expiringJob of expiringJobs) {
          await syncLinkedRecords(tx, expiringJob.id, OutboundMessageStatus.EXPIRED, {
            statusAt: now,
            errorCode: 'EXPIRED',
            errorMessage: 'Message expired before it could be sent.',
          });
        }

        const batchIds = Array.from(new Set(
          expiringJobs
            .map((job) => job.batch_id)
            .filter((batchId): batchId is string => Boolean(batchId)),
        ));
        for (const batchId of batchIds) await refreshBatchCompletion(tx, batchId);
        return expiringJobs.length;
      });
    },

    async markSent(id, lockOwner, providerMessageId = null) {
      await client.$transaction(async (tx) => {
        const sentAt = new Date();
        const result = await tx.outboundMessageJob.updateMany({
          where: {
            id,
            status: OutboundMessageStatus.PROCESSING,
            lock_owner: lockOwner,
          },
          data: {
            status: OutboundMessageStatus.SENT,
            attempts: { increment: 1 },
            provider_message_id: providerMessageId,
            sent_at: sentAt,
            locked_at: null,
            lock_owner: null,
          },
        });

        if (result.count !== 1) return;
        const job = await tx.outboundMessageJob.findUnique({
          where: { id },
          select: { batch_id: true, provider_message_id: true },
        });
        await syncLinkedRecords(tx, id, OutboundMessageStatus.SENT, {
          providerMessageId: job?.provider_message_id,
          sentAt,
          countTicketDelivery: true,
        });
        await refreshBatchCompletion(tx, job?.batch_id);
      });
    },

    async markRetryable(id, lockOwner, attempt, nextAttemptAt, code, message) {
      await client.$transaction(async (tx) => {
        const result = await tx.outboundMessageJob.updateMany({
          where: {
            id,
            status: OutboundMessageStatus.PROCESSING,
            lock_owner: lockOwner,
          },
          data: {
            status: OutboundMessageStatus.PENDING,
            attempts: attempt,
            next_attempt_at: nextAttemptAt,
            locked_at: null,
            lock_owner: null,
            last_error_code: code,
            last_error_message: message,
          },
        });
        if (result.count !== 1) return;
        await syncLinkedRecords(tx, id, OutboundMessageStatus.PENDING, {
          statusAt: new Date(),
          attempt,
          nextAttemptAt,
          errorCode: code,
          errorMessage: message,
        });
      });
    },

    async markFailed(id, lockOwner, attempt, code, message) {
      await client.$transaction(async (tx) => {
        const statusAt = new Date();
        const result = await tx.outboundMessageJob.updateMany({
          where: {
            id,
            status: OutboundMessageStatus.PROCESSING,
            lock_owner: lockOwner,
          },
          data: {
            status: OutboundMessageStatus.FAILED,
            attempts: attempt,
            locked_at: null,
            lock_owner: null,
            last_error_code: code,
            last_error_message: message,
          },
        });
        if (result.count !== 1) return;
        const job = await tx.outboundMessageJob.findUnique({ where: { id }, select: { batch_id: true } });
        await syncLinkedRecords(tx, id, OutboundMessageStatus.FAILED, {
          statusAt,
          attempt,
          errorCode: code,
          errorMessage: message,
        });
        await refreshBatchCompletion(tx, job?.batch_id);
      });
    },

    async markExpired(id, lockOwner = null, code = 'EXPIRED') {
      await client.$transaction(async (tx) => {
        const statusAt = new Date();
        const result = await tx.outboundMessageJob.updateMany({
          where: {
            id,
            status: { in: [OutboundMessageStatus.PENDING, OutboundMessageStatus.PROCESSING] },
            ...(lockOwner ? { lock_owner: lockOwner } : {}),
          },
          data: {
            status: OutboundMessageStatus.EXPIRED,
            locked_at: null,
            lock_owner: null,
            last_error_code: code,
            last_error_message: 'Message expired before delivery.',
          },
        });
        if (result.count !== 1) return;
        const job = await tx.outboundMessageJob.findUnique({ where: { id }, select: { batch_id: true } });
        await syncLinkedRecords(tx, id, OutboundMessageStatus.EXPIRED, {
          statusAt,
          errorCode: code,
          errorMessage: 'Message expired before delivery.',
        });
        await refreshBatchCompletion(tx, job?.batch_id);
      });
    },

    async retryJob(id, companyId) {
      const retried = await client.$transaction(async (tx) => {
        const nextAttemptAt = new Date();
        const result = await tx.outboundMessageJob.updateMany({
          where: {
            ...buildJobWhere(id, companyId),
            status: OutboundMessageStatus.FAILED,
          },
          data: {
            status: OutboundMessageStatus.PENDING,
            attempts: 0,
            next_attempt_at: nextAttemptAt,
            locked_at: null,
            lock_owner: null,
            last_error_code: null,
            last_error_message: null,
            sent_at: null,
          },
        });
        if (result.count !== 1) return null;
        const retriedJob = await tx.outboundMessageJob.findUnique({ where: { id } });
        if (!retriedJob) return null;
        await syncLinkedRecords(tx, id, OutboundMessageStatus.PENDING, {
          nextAttemptAt,
        });
        if (retriedJob.batch_id) {
          await tx.outboundMessageBatch.updateMany({
            where: { id: retriedJob.batch_id },
            data: { completed_at: null },
          });
        }
        return toClaimedJob(retriedJob);
      });
      if (!retried) return null;
      return retried;
    },

    async retryBatch(batchId, companyId) {
      return client.$transaction(async (tx) => {
        const nextAttemptAt = new Date();
        const failedJobs = await tx.outboundMessageJob.findMany({
          where: {
            batch_id: batchId,
            ...(companyId === undefined ? {} : { company_id: companyId }),
            status: OutboundMessageStatus.FAILED,
          },
          select: { id: true },
        });
        if (failedJobs.length === 0) return 0;
        await tx.outboundMessageJob.updateMany({
          where: {
            batch_id: batchId,
            ...(companyId === undefined ? {} : { company_id: companyId }),
            status: OutboundMessageStatus.FAILED,
          },
          data: {
            status: OutboundMessageStatus.PENDING,
            attempts: 0,
            next_attempt_at: nextAttemptAt,
            locked_at: null,
            lock_owner: null,
            last_error_code: null,
            last_error_message: null,
            sent_at: null,
          },
        });
        for (const failedJob of failedJobs) {
          await syncLinkedRecords(tx, failedJob.id, OutboundMessageStatus.PENDING, {
            nextAttemptAt,
          });
        }
        await tx.outboundMessageBatch.updateMany({
          where: { id: batchId },
          data: { completed_at: null },
        });
        return failedJobs.length;
      });
    },

    async cancelJob(id, companyId) {
      return client.$transaction(async (tx) => {
        const result = await tx.outboundMessageJob.updateMany({
          where: {
            ...buildJobWhere(id, companyId),
            status: OutboundMessageStatus.PENDING,
          },
          data: {
            status: OutboundMessageStatus.CANCELLED,
            last_error_code: 'CANCELLED',
            last_error_message: 'Cancelled by an operator.',
          },
        });
        if (result.count !== 1) return false;
        const job = await tx.outboundMessageJob.findUnique({ where: { id }, select: { batch_id: true } });
        await syncLinkedRecords(tx, id, OutboundMessageStatus.CANCELLED, {
          statusAt: new Date(),
          errorCode: 'CANCELLED',
          errorMessage: 'Cancelled by an operator.',
        });
        await refreshBatchCompletion(tx, job?.batch_id);
        return true;
      });
    },

    async cancelBatch(batchId, companyId) {
      return client.$transaction(async (tx) => {
        const pendingJobs = await tx.outboundMessageJob.findMany({
          where: {
            batch_id: batchId,
            ...(companyId === undefined ? {} : { company_id: companyId }),
            status: OutboundMessageStatus.PENDING,
          },
          select: { id: true },
        });
        if (pendingJobs.length === 0) {
          await refreshBatchCompletion(tx, batchId);
          return 0;
        }
        await tx.outboundMessageJob.updateMany({
          where: {
            batch_id: batchId,
            ...(companyId === undefined ? {} : { company_id: companyId }),
            status: OutboundMessageStatus.PENDING,
          },
          data: {
            status: OutboundMessageStatus.CANCELLED,
            last_error_code: 'CANCELLED',
            last_error_message: 'Cancelled by an operator.',
          },
        });
        for (const pendingJob of pendingJobs) {
          await syncLinkedRecords(tx, pendingJob.id, OutboundMessageStatus.CANCELLED, {
            statusAt: new Date(),
            errorCode: 'CANCELLED',
            errorMessage: 'Cancelled by an operator.',
          });
        }
        await refreshBatchCompletion(tx, batchId);
        return pendingJobs.length;
      });
    },

    async getBatchProgress(batchId, companyId) {
      const batch = await client.outboundMessageBatch.findFirst({
        where: {
          id: batchId,
          ...(companyId === undefined ? {} : { company_id: companyId }),
        },
      });
      if (!batch) return null;

      const grouped = await client.outboundMessageJob.groupBy({
        by: ['status'],
        where: { batch_id: batchId },
        _count: { _all: true },
      });
      const counts = new Map(grouped.map((entry) => [entry.status, entry._count._all]));
      const pending = counts.get(OutboundMessageStatus.PENDING) ?? 0;
      const processing = counts.get(OutboundMessageStatus.PROCESSING) ?? 0;
      const sent = counts.get(OutboundMessageStatus.SENT) ?? 0;
      const failed = counts.get(OutboundMessageStatus.FAILED) ?? 0;
      const expired = counts.get(OutboundMessageStatus.EXPIRED) ?? 0;
      const cancelled = counts.get(OutboundMessageStatus.CANCELLED) ?? 0;
      const total = pending + processing + sent + failed + expired + cancelled;
      const terminal = sent + failed + expired + cancelled;

      let status: OutboundBatchProgress['status'] = 'EMPTY';
      if (total > 0 && (pending > 0 || processing > 0)) status = processing > 0 ? 'PROCESSING' : 'PENDING';
      else if (failed > 0) status = 'FAILED';
      else if (expired > 0) status = 'EXPIRED';
      else if (cancelled > 0) status = 'CANCELLED';
      else if (total > 0) status = 'COMPLETED';

      if (!batch.completed_at && total > 0 && terminal === total) {
        await client.outboundMessageBatch.updateMany({
          where: { id: batchId, completed_at: null },
          data: { completed_at: new Date() },
        });
      }

      return {
        batch: batch as OutboundBatchProgress['batch'],
        total,
        pending,
        processing,
        sent,
        failed,
        expired,
        cancelled,
        terminal,
        status,
      };
    },
  };
}

/**
 * OTP sessions are created after their outbox job so the session can retain
 * the generated job id. Lock the job while attaching the late-created session
 * and mirror its current lifecycle, closing the small worker-before-session
 * race without polling or timestamp inference.
 */
export async function syncWhatsappOtpSessionDelivery(
  jobId: number | null | undefined,
  link: WhatsappOtpSessionLink,
  client: PrismaClient = prisma,
): Promise<void> {
  if (jobId == null) return;

  await client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ status: OutboundMessageStatus }>>(Prisma.sql`
      SELECT status
      FROM outbound_message_job
      WHERE id = ${jobId}
      FOR UPDATE
    `);
    const job = rows[0];
    if (!job) return;

    const data = {
      phone_delivery_status: job.status as string,
      phone_delivery_succeeded: job.status === OutboundMessageStatus.SENT,
    };
    let result: { count: number };
    if (link.kind === 'PAID_EVENT_GUEST_CHECKOUT') {
      result = await tx.paidEventGuestCheckoutSession.updateMany({ where: { id: link.sessionId }, data });
    } else if (link.kind === 'GROUP_CLASS_GUEST_ENROLLMENT') {
      result = await tx.groupClassGuestEnrollmentSession.updateMany({ where: { id: link.sessionId }, data });
    } else {
      result = await tx.commerceGuestCheckoutSession.updateMany({ where: { id: link.sessionId }, data });
    }
    if (result.count !== 1) throw new Error('OTP session not found for WhatsApp job.');
  });
}

export const outboundMessageRepository = createOutboundMessageRepository();
