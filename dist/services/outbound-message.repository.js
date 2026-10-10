"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.outboundMessageRepository = exports.OutboundMessageValidationError = void 0;
exports.validateOutboundMessageExpiry = validateOutboundMessageExpiry;
exports.createOutboundMessageRepository = createOutboundMessageRepository;
exports.syncWhatsappOtpSessionDelivery = syncWhatsappOtpSessionDelivery;
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
class OutboundMessageValidationError extends Error {
    constructor(message) {
        super(message);
        this.code = 'INVALID_EXPIRY';
        this.name = 'OutboundMessageValidationError';
    }
}
exports.OutboundMessageValidationError = OutboundMessageValidationError;
function validateOutboundMessageExpiry(expiresAt, now = new Date()) {
    if (expiresAt == null)
        return;
    if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
        throw new OutboundMessageValidationError('Outbound message expiry must be a valid date.');
    }
    if (expiresAt.getTime() <= now.getTime()) {
        throw new OutboundMessageValidationError('Outbound message expiry must be in the future.');
    }
}
function isUniqueConstraintError(error) {
    return error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
function toClaimedJob(value) {
    return value;
}
async function refreshBatchCompletion(client, batchId) {
    if (!batchId)
        return;
    const openCount = await client.outboundMessageJob.count({
        where: {
            batch_id: batchId,
            status: {
                in: [client_1.OutboundMessageStatus.PENDING, client_1.OutboundMessageStatus.PROCESSING],
            },
        },
    });
    if (openCount > 0)
        return;
    await client.outboundMessageBatch.updateMany({
        where: {
            id: batchId,
            completed_at: null,
        },
        data: { completed_at: new Date() },
    });
}
async function attachLinkedRecords(client, jobId, input) {
    if (input.restaurantNotificationLogId != null) {
        const result = await client.restaurantNotificationLog.updateMany({
            where: { id: input.restaurantNotificationLogId },
            data: { outbound_message_job_id: jobId },
        });
        if (result.count !== 1)
            throw new Error('Restaurant notification log not found for WhatsApp job.');
    }
    if (input.bookingNotificationAttemptId != null) {
        const result = await client.bookingNotificationAttempt.updateMany({
            where: { id: input.bookingNotificationAttemptId },
            data: { outbound_message_job_id: jobId },
        });
        if (result.count !== 1)
            throw new Error('Booking notification attempt not found for WhatsApp job.');
    }
    if (input.installmentReminderLogId != null) {
        const result = await client.installmentReminderLog.updateMany({
            where: { id: input.installmentReminderLogId },
            data: { outbound_message_job_id: jobId },
        });
        if (result.count !== 1)
            throw new Error('Installment reminder log not found for WhatsApp job.');
    }
}
async function syncLinkedRecords(client, jobId, status, details = {}) {
    const sent = status === client_1.OutboundMessageStatus.SENT;
    const errorState = status === client_1.OutboundMessageStatus.FAILED
        || status === client_1.OutboundMessageStatus.EXPIRED
        || status === client_1.OutboundMessageStatus.CANCELLED;
    const sentAt = sent ? details.sentAt ?? null : null;
    const providerMessageId = sent ? details.providerMessageId ?? null : null;
    const errorCode = errorState ? details.errorCode ?? null : null;
    const errorMessage = errorState ? details.errorMessage ?? null : null;
    const lifecycleStatus = status;
    await client.restaurantNotificationLog.updateMany({
        where: { outbound_message_job_id: jobId },
        data: {
            status: lifecycleStatus,
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
            next_retry_at: status === client_1.OutboundMessageStatus.PENDING ? details.nextAttemptAt ?? null : null,
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
    if (status === client_1.OutboundMessageStatus.SENT) {
        const guestLogs = await client.restaurantNotificationLog.findMany({
            where: {
                outbound_message_job_id: jobId,
                reservation_guest_id: { not: null },
            },
            select: { reservation_guest_id: true },
        });
        const guestIds = Array.from(new Set(guestLogs
            .map((log) => log.reservation_guest_id)
            .filter((guestId) => guestId != null)));
        if (guestIds.length > 0 && sentAt) {
            await client.restaurantReservationGuest.updateMany({
                where: { id: { in: guestIds } },
                data: { invited_at: sentAt },
            });
        }
    }
    if (status === client_1.OutboundMessageStatus.SENT && details.countTicketDelivery) {
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
function buildJobWhere(id, companyId) {
    return {
        id,
        ...(companyId === undefined ? {} : { company_id: companyId }),
    };
}
function scopedBatchIdempotencyKey(companyId, idempotencyKey) {
    const scope = companyId == null ? 'global' : `company:${companyId}`;
    const value = `${scope}:${idempotencyKey}`;
    if (value.length <= 191)
        return value;
    return `${scope}:${(0, node_crypto_1.createHash)('sha256').update(value).digest('hex')}`;
}
function createOutboundMessageRepository(client = client_2.prisma) {
    return {
        async createJob(input) {
            validateOutboundMessageExpiry(input.expiresAt);
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
            }
            catch (error) {
                if (!isUniqueConstraintError(error))
                    throw error;
                const duplicate = await client.outboundMessageJob.findUnique({
                    where: { dedupe_key: input.dedupeKey },
                });
                if (!duplicate)
                    throw error;
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
            for (const job of input.jobs) {
                validateOutboundMessageExpiry(job.expiresAt);
            }
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
            }
            catch (error) {
                if (!isUniqueConstraintError(error))
                    throw error;
                const duplicateBatch = await client.outboundMessageBatch.findUnique({
                    where: { idempotency_key: idempotencyKey },
                });
                if (!duplicateBatch)
                    throw error;
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
                let candidate;
                try {
                    const rows = await tx.$queryRaw(client_1.Prisma.sql `
            SELECT id
            FROM outbound_message_job
            WHERE status = ${client_1.OutboundMessageStatus.PENDING}
              AND next_attempt_at <= ${now}
              AND attempts < max_attempts
              AND (expires_at IS NULL OR expires_at > ${now})
            ORDER BY id ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `);
                    candidate = rows[0];
                }
                catch {
                    // MySQL 5.7 does not support SKIP LOCKED. The conditional update
                    // below remains atomic and is a safe compatibility fallback.
                    const fallback = await tx.outboundMessageJob.findFirst({
                        where: {
                            status: client_1.OutboundMessageStatus.PENDING,
                            next_attempt_at: { lte: now },
                            OR: [{ expires_at: null }, { expires_at: { gt: now } }],
                        },
                        orderBy: { id: 'asc' },
                        select: { id: true },
                    });
                    candidate = fallback ?? undefined;
                }
                if (!candidate)
                    return null;
                const claimed = await tx.outboundMessageJob.updateMany({
                    where: {
                        id: candidate.id,
                        status: client_1.OutboundMessageStatus.PENDING,
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.PROCESSING,
                        locked_at: now,
                        lock_owner: lockOwner,
                    },
                });
                if (claimed.count !== 1)
                    return null;
                const job = await tx.outboundMessageJob.findUnique({
                    where: { id: candidate.id },
                });
                if (!job)
                    return null;
                await syncLinkedRecords(tx, job.id, client_1.OutboundMessageStatus.PROCESSING, {
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
                        status: client_1.OutboundMessageStatus.PROCESSING,
                        locked_at: { lt: cutoff },
                    },
                    select: { id: true },
                });
                if (staleJobs.length === 0)
                    return 0;
                await tx.outboundMessageJob.updateMany({
                    where: {
                        status: client_1.OutboundMessageStatus.PROCESSING,
                        locked_at: { lt: cutoff },
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.PENDING,
                        next_attempt_at: now,
                        locked_at: null,
                        lock_owner: null,
                        last_error_code: 'STALE_PROCESSING',
                        last_error_message: 'Recovered after a worker lease expired.',
                    },
                });
                for (const staleJob of staleJobs) {
                    await syncLinkedRecords(tx, staleJob.id, client_1.OutboundMessageStatus.PENDING, {
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
                        status: client_1.OutboundMessageStatus.PENDING,
                        expires_at: { lte: now },
                    },
                    select: { id: true, batch_id: true },
                });
                if (expiringJobs.length === 0)
                    return 0;
                await tx.outboundMessageJob.updateMany({
                    where: {
                        status: client_1.OutboundMessageStatus.PENDING,
                        expires_at: { lte: now },
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.EXPIRED,
                        last_error_code: 'EXPIRED',
                        last_error_message: 'Message expired before it could be sent.',
                    },
                });
                for (const expiringJob of expiringJobs) {
                    await syncLinkedRecords(tx, expiringJob.id, client_1.OutboundMessageStatus.EXPIRED, {
                        statusAt: now,
                        errorCode: 'EXPIRED',
                        errorMessage: 'Message expired before it could be sent.',
                    });
                }
                const batchIds = Array.from(new Set(expiringJobs
                    .map((job) => job.batch_id)
                    .filter((batchId) => Boolean(batchId))));
                for (const batchId of batchIds)
                    await refreshBatchCompletion(tx, batchId);
                return expiringJobs.length;
            });
        },
        async markSent(id, lockOwner, providerMessageId = null) {
            await client.$transaction(async (tx) => {
                const sentAt = new Date();
                const result = await tx.outboundMessageJob.updateMany({
                    where: {
                        id,
                        status: client_1.OutboundMessageStatus.PROCESSING,
                        lock_owner: lockOwner,
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.SENT,
                        attempts: { increment: 1 },
                        provider_message_id: providerMessageId,
                        sent_at: sentAt,
                        locked_at: null,
                        lock_owner: null,
                    },
                });
                if (result.count !== 1)
                    return;
                const job = await tx.outboundMessageJob.findUnique({
                    where: { id },
                    select: { batch_id: true, provider_message_id: true },
                });
                await syncLinkedRecords(tx, id, client_1.OutboundMessageStatus.SENT, {
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
                        status: client_1.OutboundMessageStatus.PROCESSING,
                        lock_owner: lockOwner,
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.PENDING,
                        attempts: attempt,
                        next_attempt_at: nextAttemptAt,
                        locked_at: null,
                        lock_owner: null,
                        last_error_code: code,
                        last_error_message: message,
                    },
                });
                if (result.count !== 1)
                    return;
                await syncLinkedRecords(tx, id, client_1.OutboundMessageStatus.PENDING, {
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
                        status: client_1.OutboundMessageStatus.PROCESSING,
                        lock_owner: lockOwner,
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.FAILED,
                        attempts: attempt,
                        locked_at: null,
                        lock_owner: null,
                        last_error_code: code,
                        last_error_message: message,
                    },
                });
                if (result.count !== 1)
                    return;
                const job = await tx.outboundMessageJob.findUnique({ where: { id }, select: { batch_id: true } });
                await syncLinkedRecords(tx, id, client_1.OutboundMessageStatus.FAILED, {
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
                        status: { in: [client_1.OutboundMessageStatus.PENDING, client_1.OutboundMessageStatus.PROCESSING] },
                        ...(lockOwner ? { lock_owner: lockOwner } : {}),
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.EXPIRED,
                        locked_at: null,
                        lock_owner: null,
                        last_error_code: code,
                        last_error_message: 'Message expired before delivery.',
                    },
                });
                if (result.count !== 1)
                    return;
                const job = await tx.outboundMessageJob.findUnique({ where: { id }, select: { batch_id: true } });
                await syncLinkedRecords(tx, id, client_1.OutboundMessageStatus.EXPIRED, {
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
                const existing = await tx.outboundMessageJob.findFirst({
                    where: {
                        ...buildJobWhere(id, companyId),
                        status: client_1.OutboundMessageStatus.FAILED,
                    },
                    select: { source_type: true },
                });
                if (!existing)
                    return null;
                const result = await tx.outboundMessageJob.updateMany({
                    where: {
                        ...buildJobWhere(id, companyId),
                        status: client_1.OutboundMessageStatus.FAILED,
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.PENDING,
                        attempts: 0,
                        next_attempt_at: nextAttemptAt,
                        locked_at: null,
                        lock_owner: null,
                        last_error_code: null,
                        last_error_message: null,
                        sent_at: null,
                        ...(existing.source_type === 'GROUP_EVENT_MASS_MESSAGE' ? { expires_at: null } : {}),
                    },
                });
                if (result.count !== 1)
                    return null;
                const retriedJob = await tx.outboundMessageJob.findUnique({ where: { id } });
                if (!retriedJob)
                    return null;
                await syncLinkedRecords(tx, id, client_1.OutboundMessageStatus.PENDING, {
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
            if (!retried)
                return null;
            return retried;
        },
        async retryBatch(batchId, companyId) {
            return client.$transaction(async (tx) => {
                const nextAttemptAt = new Date();
                const batch = await tx.outboundMessageBatch.findFirst({
                    where: {
                        id: batchId,
                        ...(companyId === undefined ? {} : { company_id: companyId }),
                    },
                    select: { source_type: true },
                });
                const failedJobs = await tx.outboundMessageJob.findMany({
                    where: {
                        batch_id: batchId,
                        ...(companyId === undefined ? {} : { company_id: companyId }),
                        status: client_1.OutboundMessageStatus.FAILED,
                    },
                    select: { id: true },
                });
                if (failedJobs.length === 0)
                    return 0;
                await tx.outboundMessageJob.updateMany({
                    where: {
                        batch_id: batchId,
                        ...(companyId === undefined ? {} : { company_id: companyId }),
                        status: client_1.OutboundMessageStatus.FAILED,
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.PENDING,
                        attempts: 0,
                        next_attempt_at: nextAttemptAt,
                        locked_at: null,
                        lock_owner: null,
                        last_error_code: null,
                        last_error_message: null,
                        sent_at: null,
                        ...(batch?.source_type === 'GROUP_EVENT_MASS_MESSAGE' ? { expires_at: null } : {}),
                    },
                });
                for (const failedJob of failedJobs) {
                    await syncLinkedRecords(tx, failedJob.id, client_1.OutboundMessageStatus.PENDING, {
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
                        status: client_1.OutboundMessageStatus.PENDING,
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.CANCELLED,
                        last_error_code: 'CANCELLED',
                        last_error_message: 'Cancelled by an operator.',
                    },
                });
                if (result.count !== 1)
                    return false;
                const job = await tx.outboundMessageJob.findUnique({ where: { id }, select: { batch_id: true } });
                await syncLinkedRecords(tx, id, client_1.OutboundMessageStatus.CANCELLED, {
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
                        status: client_1.OutboundMessageStatus.PENDING,
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
                        status: client_1.OutboundMessageStatus.PENDING,
                    },
                    data: {
                        status: client_1.OutboundMessageStatus.CANCELLED,
                        last_error_code: 'CANCELLED',
                        last_error_message: 'Cancelled by an operator.',
                    },
                });
                for (const pendingJob of pendingJobs) {
                    await syncLinkedRecords(tx, pendingJob.id, client_1.OutboundMessageStatus.CANCELLED, {
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
            if (!batch)
                return null;
            const grouped = await client.outboundMessageJob.groupBy({
                by: ['status'],
                where: { batch_id: batchId },
                _count: { _all: true },
            });
            const counts = new Map(grouped.map((entry) => [entry.status, entry._count._all]));
            const pending = counts.get(client_1.OutboundMessageStatus.PENDING) ?? 0;
            const processing = counts.get(client_1.OutboundMessageStatus.PROCESSING) ?? 0;
            const sent = counts.get(client_1.OutboundMessageStatus.SENT) ?? 0;
            const failed = counts.get(client_1.OutboundMessageStatus.FAILED) ?? 0;
            const expired = counts.get(client_1.OutboundMessageStatus.EXPIRED) ?? 0;
            const cancelled = counts.get(client_1.OutboundMessageStatus.CANCELLED) ?? 0;
            const total = pending + processing + sent + failed + expired + cancelled;
            const terminal = sent + failed + expired + cancelled;
            let status = 'EMPTY';
            if (total > 0 && (pending > 0 || processing > 0))
                status = processing > 0 ? 'PROCESSING' : 'PENDING';
            else if (failed > 0)
                status = 'FAILED';
            else if (expired > 0)
                status = 'EXPIRED';
            else if (cancelled > 0)
                status = 'CANCELLED';
            else if (total > 0)
                status = 'COMPLETED';
            if (!batch.completed_at && total > 0 && terminal === total) {
                await client.outboundMessageBatch.updateMany({
                    where: { id: batchId, completed_at: null },
                    data: { completed_at: new Date() },
                });
            }
            return {
                batch: batch,
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
async function syncWhatsappOtpSessionDelivery(jobId, link, client = client_2.prisma) {
    if (jobId == null)
        return;
    await client.$transaction(async (tx) => {
        const rows = await tx.$queryRaw(client_1.Prisma.sql `
      SELECT status
      FROM outbound_message_job
      WHERE id = ${jobId}
      FOR UPDATE
    `);
        const job = rows[0];
        if (!job)
            return;
        const data = {
            phone_delivery_status: job.status,
            phone_delivery_succeeded: job.status === client_1.OutboundMessageStatus.SENT,
        };
        let result;
        if (link.kind === 'PAID_EVENT_GUEST_CHECKOUT') {
            result = await tx.paidEventGuestCheckoutSession.updateMany({ where: { id: link.sessionId }, data });
        }
        else if (link.kind === 'GROUP_CLASS_GUEST_ENROLLMENT') {
            result = await tx.groupClassGuestEnrollmentSession.updateMany({ where: { id: link.sessionId }, data });
        }
        else {
            result = await tx.commerceGuestCheckoutSession.updateMany({ where: { id: link.sessionId }, data });
        }
        if (result.count !== 1)
            throw new Error('OTP session not found for WhatsApp job.');
    });
}
exports.outboundMessageRepository = createOutboundMessageRepository();
