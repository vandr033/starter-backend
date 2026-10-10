"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOutboundMessageRepository = void 0;
exports.hashDedupeKey = hashDedupeKey;
exports.queueWhatsappText = queueWhatsappText;
exports.queueWhatsappCode = queueWhatsappCode;
exports.queueWhatsappImage = queueWhatsappImage;
exports.queueWhatsappGroupMessage = queueWhatsappGroupMessage;
exports.queueWhatsappBatch = queueWhatsappBatch;
exports.isWhatsappEnqueueAccepted = isWhatsappEnqueueAccepted;
exports.getWhatsappEnqueueLifecycleStatus = getWhatsappEnqueueLifecycleStatus;
exports.getWhatsappBatchProgress = getWhatsappBatchProgress;
exports.getWhatsappJob = getWhatsappJob;
exports.retryWhatsappJob = retryWhatsappJob;
exports.retryWhatsappBatch = retryWhatsappBatch;
exports.cancelWhatsappJob = cancelWhatsappJob;
exports.cancelWhatsappBatch = cancelWhatsappBatch;
exports.normalizeWhatsappRecipient = normalizeWhatsappRecipient;
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const logger_1 = require("../config/logger");
const waha_service_1 = require("./waha.service");
const outbound_message_repository_1 = require("./outbound-message.repository");
Object.defineProperty(exports, "createOutboundMessageRepository", { enumerable: true, get: function () { return outbound_message_repository_1.createOutboundMessageRepository; } });
const whatsapp_worker_signals_1 = require("./whatsapp-worker-signals");
const notificationBranding_1 = require("../utils/notificationBranding");
const demo_session_service_1 = require("./demo-session.service");
const demo_request_context_1 = require("./demo-request-context");
function safeSourceType(value) {
    const normalized = value?.trim() || 'WHATSAPP_MESSAGE';
    return normalized.slice(0, 64);
}
function safeSourceId(value) {
    if (!value)
        return null;
    return value.trim().slice(0, 191) || null;
}
function safeMaxAttempts(value) {
    if (!Number.isFinite(value) || !value || value < 1)
        return 8;
    return Math.min(20, Math.floor(value));
}
function safeIdempotencyKey(value) {
    const normalized = value.trim();
    if (!normalized)
        return `wa-batch:${(0, node_crypto_1.randomUUID)()}`;
    if (normalized.length <= 191)
        return normalized;
    return `wa-batch:${hashDedupeKey(normalized)}`;
}
function hashDedupeKey(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
function buildDedupeKey(value, fallback) {
    return hashDedupeKey(value?.trim() || fallback);
}
function buildBrandedTextWithBranding(text, branding) {
    const trimmedText = text.trim();
    if (!trimmedText)
        throw new Error('WhatsApp message text is required.');
    return branding
        ? (0, notificationBranding_1.appendCompanyContactLine)(trimmedText, branding)
        : trimmedText.includes('Priconpri')
            ? trimmedText
            : `${trimmedText}\n\nPriconpri`;
}
async function buildBrandedText(text, options) {
    const companyBranding = options?.companyId
        ? await (0, notificationBranding_1.getCompanyNotificationBranding)(options.companyId)
        : null;
    return buildBrandedTextWithBranding(text, (0, notificationBranding_1.mergeBranding)(companyBranding, options?.branding));
}
function resolveRecipient(recipient) {
    return (0, waha_service_1.buildWahaChatId)(recipient);
}
function rejection(error, reason = 'QUEUE_REJECTED') {
    const message = error instanceof Error ? error.message : reason;
    const resolvedReason = error instanceof outbound_message_repository_1.OutboundMessageValidationError ? error.code : reason;
    logger_1.logger.error({
        event: 'whatsapp_enqueue_rejected',
        reason: resolvedReason,
        error: message.slice(0, 300),
    }, 'WhatsApp message could not be persisted to the outbox');
    return { accepted: false, status: 'REJECTED', reason: resolvedReason };
}
function batchRejection(error, total) {
    const reason = error instanceof Error ? error.message : 'QUEUE_REJECTED';
    const resolvedReason = error instanceof outbound_message_repository_1.OutboundMessageValidationError ? error.code : 'QUEUE_REJECTED';
    logger_1.logger.error({
        event: 'whatsapp_batch_enqueue_rejected',
        reason: resolvedReason,
        error: reason.slice(0, 300),
    }, 'WhatsApp batch could not be persisted to the outbox');
    return {
        accepted: false,
        status: 'REJECTED',
        total,
        queued: 0,
        duplicates: 0,
        rejected: total,
        skipped: 0,
        reason: resolvedReason,
    };
}
function getRepository(dependencies) {
    return dependencies?.repository ?? outbound_message_repository_1.outboundMessageRepository;
}
function getProviderState(dependencies) {
    return dependencies?.providerState ?? (0, waha_service_1.getWahaProviderState)();
}
async function isDemoCompany(companyId) {
    return (0, demo_request_context_1.isDemoRequest)() || (companyId != null && await (0, demo_session_service_1.isDemoCompanyId)(companyId));
}
function isDemoPhoneNumber(value) {
    const digits = value.replace(/\D/g, '');
    return /^0{8,}$/.test(digits);
}
async function queueWhatsappText(recipient, text, options = {}, dependencies) {
    if (await isDemoCompany(options.companyId) || isDemoPhoneNumber(recipient)) {
        return { accepted: false, status: 'SKIPPED', reason: 'DEMO_READ_ONLY' };
    }
    const providerState = getProviderState(dependencies);
    if (providerState.mode === 'disabled') {
        logger_1.logger.info({ event: 'whatsapp_delivery_skipped', reason: providerState.reason }, 'WhatsApp delivery skipped because the provider is disabled');
        return { accepted: false, status: 'SKIPPED', reason: providerState.reason ?? 'PROVIDER_DISABLED' };
    }
    if (!providerState.configured) {
        return { accepted: false, status: 'REJECTED', reason: providerState.reason ?? 'PROVIDER_NOT_CONFIGURED' };
    }
    try {
        (0, outbound_message_repository_1.validateOutboundMessageExpiry)(options.expiresAt);
        const chatId = resolveRecipient(recipient);
        const brandedText = await buildBrandedText(text, options);
        const sourceType = safeSourceType(options.sourceType);
        const dedupeKey = buildDedupeKey(options.dedupeKey, `${sourceType}:${options.sourceId ?? ''}:${chatId}:${brandedText}`);
        const result = await getRepository(dependencies).createJob({
            companyId: options.companyId ?? null,
            channel: client_1.OutboundMessageChannel.WHATSAPP,
            messageType: client_1.OutboundMessageType.TEXT,
            recipient: chatId,
            payload: { text: brandedText },
            sourceType,
            sourceId: safeSourceId(options.sourceId),
            batchId: options.batchId ?? null,
            dedupeKey,
            maxAttempts: safeMaxAttempts(options.maxAttempts),
            expiresAt: options.expiresAt ?? null,
            restaurantNotificationLogId: options.restaurantNotificationLogId ?? null,
            bookingNotificationAttemptId: options.bookingNotificationAttemptId ?? null,
            installmentReminderLogId: options.installmentReminderLogId ?? null,
            groupTicketId: options.groupTicketId ?? null,
        });
        const status = result.duplicate ? 'DUPLICATE' : 'QUEUED';
        (0, whatsapp_worker_signals_1.wakeWhatsappWorker)();
        return {
            accepted: true,
            status,
            jobId: result.job.id,
            existingStatus: result.duplicate ? result.job.status : undefined,
            reason: providerState.configured ? undefined : providerState.reason ?? 'PROVIDER_NOT_CONFIGURED',
        };
    }
    catch (error) {
        return rejection(error);
    }
}
async function queueWhatsappCode(recipient, code, options = {}, dependencies) {
    return queueWhatsappText(recipient, `Priconpri\n\nTu codigo de verificacion es: ${code}`, {
        ...options,
        sourceType: options.sourceType ?? 'WHATSAPP_OTP',
        dedupeKey: options.dedupeKey ?? `WHATSAPP_OTP:${options.sourceId ?? recipient}:${code}`,
    }, dependencies);
}
async function queueWhatsappImage(recipient, imageUrl, caption, options = {}, dependencies) {
    if (await isDemoCompany(options.companyId) || isDemoPhoneNumber(recipient)) {
        return { accepted: false, status: 'SKIPPED', reason: 'DEMO_READ_ONLY' };
    }
    const providerState = getProviderState(dependencies);
    if (providerState.mode === 'disabled') {
        logger_1.logger.info({ event: 'whatsapp_delivery_skipped', reason: providerState.reason }, 'WhatsApp image delivery skipped because the provider is disabled');
        return { accepted: false, status: 'SKIPPED', reason: providerState.reason ?? 'PROVIDER_DISABLED' };
    }
    if (!providerState.configured) {
        return { accepted: false, status: 'REJECTED', reason: providerState.reason ?? 'PROVIDER_NOT_CONFIGURED' };
    }
    try {
        (0, outbound_message_repository_1.validateOutboundMessageExpiry)(options.expiresAt);
        const chatId = resolveRecipient(recipient);
        const normalizedImageUrl = imageUrl.trim();
        if (!normalizedImageUrl)
            throw new Error('WhatsApp image URL is required.');
        const companyBranding = options.companyId
            ? await (0, notificationBranding_1.getCompanyNotificationBranding)(options.companyId)
            : null;
        const branding = (0, notificationBranding_1.mergeBranding)(companyBranding, options.branding);
        const brandedCaption = caption ? buildBrandedTextWithBranding(caption, branding) : undefined;
        const fallbackText = options.fallbackText
            ? buildBrandedTextWithBranding(options.fallbackText, branding)
            : undefined;
        const sourceType = safeSourceType(options.sourceType);
        const dedupeKey = buildDedupeKey(options.dedupeKey, `${sourceType}:${options.sourceId ?? ''}:${chatId}:${normalizedImageUrl}:${brandedCaption ?? ''}`);
        const result = await getRepository(dependencies).createJob({
            companyId: options.companyId ?? null,
            channel: client_1.OutboundMessageChannel.WHATSAPP,
            messageType: client_1.OutboundMessageType.IMAGE,
            recipient: chatId,
            payload: {
                imageUrl: normalizedImageUrl,
                ...(brandedCaption ? { caption: brandedCaption } : {}),
                ...(fallbackText
                    ? {
                        fallbackText,
                        fallbackDedupeKey: options.fallbackDedupeKey
                            ?? `${options.dedupeKey ?? dedupeKey}:fallback`,
                    }
                    : {}),
            },
            sourceType,
            sourceId: safeSourceId(options.sourceId),
            batchId: options.batchId ?? null,
            dedupeKey,
            maxAttempts: safeMaxAttempts(options.maxAttempts),
            expiresAt: options.expiresAt ?? null,
            restaurantNotificationLogId: options.restaurantNotificationLogId ?? null,
            bookingNotificationAttemptId: options.bookingNotificationAttemptId ?? null,
            installmentReminderLogId: options.installmentReminderLogId ?? null,
            groupTicketId: options.groupTicketId ?? null,
        });
        const status = result.duplicate ? 'DUPLICATE' : 'QUEUED';
        (0, whatsapp_worker_signals_1.wakeWhatsappWorker)();
        return {
            accepted: true,
            status,
            jobId: result.job.id,
            existingStatus: result.duplicate ? result.job.status : undefined,
            reason: providerState.configured ? undefined : providerState.reason ?? 'PROVIDER_NOT_CONFIGURED',
        };
    }
    catch (error) {
        return rejection(error);
    }
}
async function queueWhatsappGroupMessage(groupJid, text, options = {}, dependencies) {
    return queueWhatsappText(groupJid, text, {
        ...options,
        sourceType: options.sourceType ?? 'WHATSAPP_GROUP_MESSAGE',
    }, dependencies);
}
async function queueWhatsappBatch(items, options, dependencies) {
    const total = items.length;
    if (await isDemoCompany(options.companyId)) {
        return {
            accepted: false,
            status: 'SKIPPED',
            total,
            queued: 0,
            duplicates: 0,
            rejected: 0,
            skipped: total,
            reason: 'DEMO_READ_ONLY',
        };
    }
    const providerState = getProviderState(dependencies);
    if (providerState.mode === 'disabled') {
        logger_1.logger.info({ event: 'whatsapp_batch_skipped', reason: providerState.reason, total }, 'WhatsApp batch skipped because the provider is disabled');
        return {
            accepted: false,
            status: 'SKIPPED',
            total,
            queued: 0,
            duplicates: 0,
            rejected: 0,
            skipped: total,
            reason: providerState.reason ?? 'PROVIDER_DISABLED',
        };
    }
    if (!providerState.configured) {
        return {
            accepted: false,
            status: 'REJECTED',
            total,
            queued: 0,
            duplicates: 0,
            rejected: total,
            skipped: 0,
            reason: providerState.reason ?? 'PROVIDER_NOT_CONFIGURED',
        };
    }
    for (const item of items) {
        try {
            (0, outbound_message_repository_1.validateOutboundMessageExpiry)(item.expiresAt);
        }
        catch (error) {
            if (error instanceof outbound_message_repository_1.OutboundMessageValidationError)
                return batchRejection(error, total);
            throw error;
        }
    }
    const jobs = [];
    let rejected = 0;
    let branding = options.branding ?? null;
    try {
        const companyBranding = options.companyId
            ? await (0, notificationBranding_1.getCompanyNotificationBranding)(options.companyId)
            : null;
        branding = (0, notificationBranding_1.mergeBranding)(companyBranding, options.branding);
    }
    catch (error) {
        return batchRejection(error, total);
    }
    for (const item of items) {
        try {
            const chatId = resolveRecipient(item.recipient);
            const brandedText = buildBrandedTextWithBranding(item.text, branding);
            const sourceType = safeSourceType(item.sourceType ?? options.sourceType);
            const dedupeKey = buildDedupeKey(item.dedupeKey, `${options.idempotencyKey}:${sourceType}:${item.sourceId ?? options.sourceId ?? ''}:${chatId}:${brandedText}`);
            jobs.push({
                companyId: options.companyId ?? null,
                channel: client_1.OutboundMessageChannel.WHATSAPP,
                messageType: client_1.OutboundMessageType.TEXT,
                recipient: chatId,
                payload: { text: brandedText },
                sourceType,
                sourceId: safeSourceId(item.sourceId ?? options.sourceId),
                dedupeKey,
                maxAttempts: safeMaxAttempts(options.maxAttempts),
                expiresAt: item.expiresAt ?? null,
            });
        }
        catch {
            rejected += 1;
        }
    }
    if (jobs.length === 0) {
        return {
            accepted: false,
            status: 'REJECTED',
            total,
            queued: 0,
            duplicates: 0,
            rejected,
            skipped: 0,
            reason: 'NO_VALID_RECIPIENTS',
        };
    }
    try {
        const input = {
            companyId: options.companyId ?? null,
            channel: client_1.OutboundMessageChannel.WHATSAPP,
            sourceType: safeSourceType(options.sourceType),
            sourceId: safeSourceId(options.sourceId),
            idempotencyKey: safeIdempotencyKey(options.idempotencyKey),
            createdByUserId: options.createdByUserId ?? null,
            metadata: options.metadata ?? null,
            jobs,
        };
        const repository = getRepository(dependencies);
        const result = await repository.createBatchAndJobs(input);
        const queued = result.createdJobCount;
        const duplicates = Math.max(0, jobs.length - queued);
        let pending = queued;
        try {
            pending = (await repository.getBatchProgress(result.batchId))?.pending ?? queued;
        }
        catch (error) {
            logger_1.logger.warn({ event: 'whatsapp_batch_progress_unavailable', batchId: result.batchId, error: error instanceof Error ? error.message : 'Unknown error' }, 'WhatsApp batch was queued but its initial progress could not be read');
        }
        (0, whatsapp_worker_signals_1.wakeWhatsappWorker)();
        return {
            accepted: true,
            status: result.duplicateBatch ? 'DUPLICATE' : 'QUEUED',
            batchId: result.batchId,
            total,
            queued,
            pending,
            duplicates,
            rejected,
            skipped: 0,
            reason: providerState.configured ? undefined : providerState.reason ?? 'PROVIDER_NOT_CONFIGURED',
        };
    }
    catch (error) {
        return batchRejection(error, total);
    }
}
function isWhatsappEnqueueAccepted(result) {
    if (!result || typeof result !== 'object' || !('accepted' in result))
        return false;
    const typedResult = result;
    if (typedResult.accepted !== true)
        return false;
    if (typedResult.status === 'QUEUED')
        return true;
    if (typedResult.status !== 'DUPLICATE')
        return false;
    return typedResult.existingStatus === undefined
        || typedResult.existingStatus === client_1.OutboundMessageStatus.PENDING
        || typedResult.existingStatus === client_1.OutboundMessageStatus.PROCESSING
        || typedResult.existingStatus === client_1.OutboundMessageStatus.SENT;
}
/**
 * Translate an enqueue response into the durable job lifecycle without
 * treating persistence as provider delivery. A rejected enqueue has no job
 * to advance, so callers may use FAILED for their own attempt record.
 */
function getWhatsappEnqueueLifecycleStatus(result) {
    if (!result || typeof result !== 'object')
        return client_1.OutboundMessageStatus.FAILED;
    const typedResult = result;
    if (typedResult.status === 'SKIPPED')
        return 'SKIPPED';
    if (typedResult.status === 'DUPLICATE') {
        const existingStatus = typedResult.existingStatus;
        if (Object.values(client_1.OutboundMessageStatus).includes(existingStatus)) {
            return existingStatus;
        }
        return typedResult.accepted === true
            ? client_1.OutboundMessageStatus.PENDING
            : client_1.OutboundMessageStatus.FAILED;
    }
    if (typedResult.status === 'QUEUED' && typedResult.accepted === true) {
        return client_1.OutboundMessageStatus.PENDING;
    }
    return client_1.OutboundMessageStatus.FAILED;
}
async function getWhatsappBatchProgress(batchId, companyId, repository = outbound_message_repository_1.outboundMessageRepository) {
    return repository.getBatchProgress(batchId, companyId);
}
async function getWhatsappJob(jobId, companyId, repository = outbound_message_repository_1.outboundMessageRepository) {
    return repository.findJobById(jobId, companyId);
}
async function retryWhatsappJob(jobId, companyId, repository = outbound_message_repository_1.outboundMessageRepository) {
    const job = await repository.retryJob(jobId, companyId);
    if (job)
        (0, whatsapp_worker_signals_1.wakeWhatsappWorker)();
    return job;
}
async function retryWhatsappBatch(batchId, companyId, repository = outbound_message_repository_1.outboundMessageRepository) {
    const count = await repository.retryBatch(batchId, companyId);
    if (count > 0)
        (0, whatsapp_worker_signals_1.wakeWhatsappWorker)();
    return count;
}
async function cancelWhatsappJob(jobId, companyId, repository = outbound_message_repository_1.outboundMessageRepository) {
    return repository.cancelJob(jobId, companyId);
}
async function cancelWhatsappBatch(batchId, companyId, repository = outbound_message_repository_1.outboundMessageRepository) {
    return repository.cancelBatch(batchId, companyId);
}
function normalizeWhatsappRecipient(phone) {
    return (0, waha_service_1.normalizeWhatsappPhoneNumber)(phone);
}
