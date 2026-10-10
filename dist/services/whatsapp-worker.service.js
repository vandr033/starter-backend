"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappWorker = exports.WhatsappWorker = void 0;
exports.classifyWhatsappError = classifyWhatsappError;
exports.retryDelayForAttempt = retryDelayForAttempt;
exports.startWhatsappWorker = startWhatsappWorker;
exports.stopWhatsappWorker = stopWhatsappWorker;
exports.wakeWhatsappWorker = wakeWhatsappWorker;
const node_os_1 = require("node:os");
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const logger_1 = require("../config/logger");
const waha_service_1 = require("./waha.service");
const outbound_message_repository_1 = require("./outbound-message.repository");
const outbound_message_service_1 = require("./outbound-message.service");
const whatsapp_worker_signals_1 = require("./whatsapp-worker-signals");
const demo_session_service_1 = require("./demo-session.service");
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_LEASE_MS = 120000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 20000;
const DEFAULT_MIN_INTERVAL_MS = 5000;
const RETRY_DELAYS_MS = [15000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000];
function readPositiveInt(env, name, fallback) {
    const parsed = Number.parseInt(env[name] ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function readNonNegativeInt(env, name, fallback) {
    const parsed = Number.parseInt(env[name] ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
function isWorkerEnabled(env) {
    return env.WHATSAPP_WORKER_ENABLED?.trim().toLowerCase() !== 'false';
}
function safeErrorMessage(error) {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown WhatsApp transport error';
    return raw
        .replace(/(?:x-api-key|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
}
function readErrorStatus(error) {
    if (error instanceof waha_service_1.WahaRequestError)
        return error.status;
    if (!error || typeof error !== 'object')
        return undefined;
    const status = error.status;
    return typeof status === 'number' ? status : undefined;
}
function classifyWhatsappError(error) {
    const status = readErrorStatus(error);
    if (status !== undefined) {
        if (status >= 200 && status < 300) {
            return {
                retryable: false,
                status,
                code: 'WAHA_PROVIDER_REJECTED',
                message: 'WAHA did not confirm acceptance of the message.',
            };
        }
        const retryable = [408, 425, 429, 500, 502, 503, 504].includes(status);
        return {
            retryable,
            status,
            code: `WAHA_HTTP_${status}`,
            message: `WAHA returned HTTP ${status}.`,
        };
    }
    if (error instanceof Error && /payload is missing|message text is required|image url is required/i.test(error.message)) {
        return {
            retryable: false,
            code: 'INVALID_WHATSAPP_PAYLOAD',
            message: 'The WhatsApp payload is invalid.',
        };
    }
    const isTimeout = error instanceof waha_service_1.WahaRequestError
        && (error.cause instanceof Error && error.cause.name === 'AbortError'
            || /timed out/i.test(error.message));
    return {
        retryable: true,
        code: isTimeout || (error instanceof Error && error.name === 'AbortError') ? 'WAHA_TIMEOUT' : 'WAHA_NETWORK_ERROR',
        message: safeErrorMessage(error),
    };
}
function retryDelayForAttempt(attempt) {
    const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, attempt - 1));
    return RETRY_DELAYS_MS[index];
}
function isSuccessfulTransportResponse(response) {
    if (response.status < 200 || response.status >= 300)
        return false;
    const data = response.data;
    if (data && typeof data === 'object' && 'deliveryStatus' in data) {
        return data.deliveryStatus === 'SENT';
    }
    return true;
}
function providerMessageId(response) {
    const data = response.data;
    if (!data || typeof data !== 'object')
        return null;
    const record = data;
    const direct = [record.id, record.messageId, record.message_id].find((value) => typeof value === 'string');
    if (direct)
        return direct;
    const nested = record.data;
    if (nested && typeof nested === 'object') {
        const nestedRecord = nested;
        const value = [nestedRecord.id, nestedRecord.messageId, nestedRecord.message_id]
            .find((candidate) => typeof candidate === 'string');
        if (value)
            return value;
    }
    return null;
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function payloadText(job) {
    const payload = asRecord(job.payload);
    return typeof payload?.text === 'string' && payload.text.trim() ? payload.text : null;
}
function payloadImage(job) {
    const payload = asRecord(job.payload);
    if (typeof payload?.imageUrl !== 'string' || !payload.imageUrl.trim())
        return null;
    return {
        imageUrl: payload.imageUrl,
        ...(typeof payload.caption === 'string' ? { caption: payload.caption } : {}),
        ...(typeof payload.fallbackText === 'string' ? { fallbackText: payload.fallbackText } : {}),
        ...(typeof payload.fallbackDedupeKey === 'string' ? { fallbackDedupeKey: payload.fallbackDedupeKey } : {}),
    };
}
function workerId() {
    return `${(0, node_os_1.hostname)()}-${process.pid}-${(0, node_crypto_1.randomUUID)()}`.slice(0, 191);
}
class WhatsappWorker {
    constructor(options = {}) {
        this.timer = null;
        this.unregisterWakeup = null;
        this.runningPromise = null;
        this.stopping = false;
        this.lastAttemptAt = 0;
        this.lastProviderState = '';
        this.repository = options.repository ?? outbound_message_repository_1.outboundMessageRepository;
        this.transport = options.transport ?? waha_service_1.wahaClient;
        this.env = options.env ?? process.env;
        this.log = options.logger ?? logger_1.logger;
        this.now = options.now ?? (() => new Date());
        this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
        this.id = workerId();
        this.pollIntervalMs = readPositiveInt(this.env, 'WHATSAPP_WORKER_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS);
        this.leaseMs = readPositiveInt(this.env, 'WHATSAPP_JOB_LEASE_MS', DEFAULT_LEASE_MS);
        this.shutdownTimeoutMs = readPositiveInt(this.env, 'WHATSAPP_WORKER_SHUTDOWN_TIMEOUT_MS', DEFAULT_SHUTDOWN_TIMEOUT_MS);
        this.configuredMaxAttempts = readPositiveInt(this.env, 'WHATSAPP_MAX_ATTEMPTS', 8);
        this.minIntervalMs = readNonNegativeInt(this.env, 'WAHA_MIN_INTERVAL_MS', DEFAULT_MIN_INTERVAL_MS);
    }
    async start() {
        if (this.timer || !isWorkerEnabled(this.env)) {
            if (!isWorkerEnabled(this.env)) {
                this.log.info({ event: 'whatsapp_worker_disabled' }, 'WhatsApp outbox worker is disabled by configuration');
            }
            return;
        }
        this.stopping = false;
        this.unregisterWakeup = (0, whatsapp_worker_signals_1.registerWhatsappWorkerWakeup)(() => this.wake());
        this.timer = setInterval(() => this.wake(), this.pollIntervalMs);
        this.log.info({
            event: 'whatsapp_worker_started',
            workerId: this.id,
            pollIntervalMs: this.pollIntervalMs,
            leaseMs: this.leaseMs,
        }, 'Durable WhatsApp outbox worker started');
        this.wake();
    }
    wake() {
        if (this.stopping || !this.timer)
            return;
        if (!this.runningPromise) {
            this.runningPromise = this.drainLoop().finally(() => {
                this.runningPromise = null;
            });
        }
    }
    async drainOnce() {
        if (this.stopping)
            return;
        await this.drainLoop();
    }
    async resolveProviderAvailability() {
        const state = (0, waha_service_1.getWahaProviderState)(this.env);
        if (state.mode === 'disabled') {
            return {
                available: false,
                mode: state.mode,
                state: 'DISABLED',
                reason: state.reason ?? 'PROVIDER_DISABLED',
            };
        }
        if (state.mode === 'sink') {
            return { available: true, mode: state.mode, state: 'SINK' };
        }
        if (!state.configured) {
            return {
                available: false,
                mode: state.mode,
                state: 'NOT_CONFIGURED',
                reason: state.reason ?? 'PROVIDER_NOT_CONFIGURED',
            };
        }
        try {
            const config = (0, waha_service_1.resolveWahaConfig)(this.env);
            const response = await this.transport.getSessionInfo(config.session);
            const sessionStatus = String(response.data?.status ?? 'UNKNOWN').toUpperCase();
            return {
                available: sessionStatus === 'WORKING',
                mode: state.mode,
                state: sessionStatus,
                reason: sessionStatus === 'WORKING' ? undefined : `WAHA_${sessionStatus}`,
            };
        }
        catch (error) {
            const status = error instanceof waha_service_1.WahaRequestError ? error.status : undefined;
            return {
                available: false,
                mode: state.mode,
                state: status === 404 ? 'SESSION_NOT_FOUND' : 'HEALTH_CHECK_FAILED',
                reason: status === 404 ? 'SESSION_NOT_FOUND' : 'WAHA_HEALTH_CHECK_FAILED',
            };
        }
    }
    logProviderTransition(availability) {
        const key = `${availability.mode}:${availability.state}:${availability.available}`;
        if (key === this.lastProviderState)
            return;
        const previous = this.lastProviderState;
        this.lastProviderState = key;
        if (availability.available) {
            this.log.info({
                event: previous ? 'whatsapp_provider_reconnected' : 'whatsapp_worker_provider_ready',
                workerId: this.id,
                providerState: availability.state,
            }, previous ? 'WhatsApp provider is available again; pending jobs will resume' : 'WhatsApp provider is available');
        }
        else {
            this.log.warn({
                event: 'whatsapp_worker_paused',
                workerId: this.id,
                providerState: availability.state,
                reason: availability.reason,
            }, 'WhatsApp outbox worker is paused; pending jobs remain durable');
        }
    }
    async drainLoop() {
        if (this.stopping)
            return;
        const availability = await this.resolveProviderAvailability();
        this.logProviderTransition(availability);
        // Disabled means the application intentionally opted out of WhatsApp;
        // do not touch the outbox in that mode. For configured-but-unavailable
        // providers, maintenance still runs so leases and expirations progress.
        if (availability.mode === 'disabled')
            return;
        const now = this.now();
        await this.repository.recoverStaleProcessing(new Date(now.getTime() - this.leaseMs), now);
        await this.repository.expirePendingJobs(now);
        if (!availability.available)
            return;
        while (!this.stopping) {
            const job = await this.repository.claimNextPendingJob(this.id, this.now());
            if (!job)
                return;
            const continueDraining = await this.processClaimedJob(job, availability.mode);
            if (!continueDraining)
                return;
        }
    }
    async waitForRateLimit(mode) {
        if (mode !== 'remote' || this.lastAttemptAt === 0)
            return;
        const waitMs = Math.max(0, this.minIntervalMs - (Date.now() - this.lastAttemptAt));
        if (waitMs > 0) {
            this.log.debug({ event: 'whatsapp_worker_rate_limit_wait', waitMs }, 'Waiting between WhatsApp sends');
            await this.sleep(waitMs);
        }
    }
    async processClaimedJob(job, mode) {
        const current = this.now();
        if (job.company_id != null && await (0, demo_session_service_1.isDemoCompanyId)(job.company_id)) {
            await this.repository.markExpired(job.id, this.id, 'DEMO_READ_ONLY');
            this.log.warn({ event: 'whatsapp_demo_job_skipped', jobId: job.id, companyId: job.company_id }, 'Skipped WhatsApp outbox job for a demo tenant');
            return true;
        }
        if (job.expires_at && job.expires_at.getTime() <= current.getTime()) {
            await this.repository.markExpired(job.id, this.id);
            return true;
        }
        const maxAttempts = Math.min(job.max_attempts || this.configuredMaxAttempts, this.configuredMaxAttempts);
        if (job.attempts >= maxAttempts) {
            await this.repository.markFailed(job.id, this.id, job.attempts, 'MAX_ATTEMPTS_REACHED', 'The WhatsApp job reached its configured attempt limit.');
            return true;
        }
        if (mode === 'sink') {
            await this.repository.markSent(job.id, this.id, 'LOCAL_SINK');
            this.log.info({ event: 'whatsapp_job_sink_completed', jobId: job.id }, 'WhatsApp job captured by local sink');
            return true;
        }
        await this.waitForRateLimit(mode);
        this.lastAttemptAt = Date.now();
        try {
            let response;
            if (job.message_type === client_1.OutboundMessageType.TEXT) {
                const text = payloadText(job);
                if (!text)
                    throw new Error('WhatsApp text payload is missing.');
                response = await this.transport.sendTextNow(job.recipient, text);
            }
            else {
                const image = payloadImage(job);
                if (!image)
                    throw new Error('WhatsApp image payload is missing.');
                response = await this.transport.sendImageNow(job.recipient, image.imageUrl, image.caption);
            }
            if (!isSuccessfulTransportResponse(response)) {
                throw new waha_service_1.WahaRequestError('WAHA did not accept the message.', {
                    operation: 'submitting a WhatsApp outbound job',
                    status: response.status || 503,
                    responseBody: response.data,
                });
            }
            await this.repository.markSent(job.id, this.id, providerMessageId(response));
            this.log.info({
                event: 'whatsapp_job_sent',
                jobId: job.id,
                recipient: job.recipient,
                messageType: job.message_type,
                attempt: job.attempts + 1,
            }, 'WhatsApp outbox job accepted by WAHA');
            return true;
        }
        catch (error) {
            return this.handleFailure(job, error);
        }
    }
    async handleFailure(job, error) {
        const classification = classifyWhatsappError(error);
        const attempt = job.attempts + 1;
        const now = this.now();
        if (job.expires_at && job.expires_at.getTime() <= now.getTime()) {
            await this.repository.markExpired(job.id, this.id, 'EXPIRED_AFTER_FAILURE');
            return true;
        }
        const maxAttempts = Math.min(job.max_attempts || this.configuredMaxAttempts, this.configuredMaxAttempts);
        if (classification.retryable && attempt < maxAttempts) {
            const nextAttemptAt = new Date(now.getTime() + retryDelayForAttempt(attempt));
            await this.repository.markRetryable(job.id, this.id, attempt, nextAttemptAt, classification.code, classification.message);
            this.log.warn({
                event: 'whatsapp_job_retry_scheduled',
                jobId: job.id,
                attempt,
                nextAttemptAt,
                code: classification.code,
                status: classification.status,
            }, 'WhatsApp outbox job will be retried');
            // One transient provider failure is enough to stop this drain cycle.
            // The next poll/health transition will resume it without burning an
            // attempt on every pending job during a global outage.
            return false;
        }
        await this.repository.markFailed(job.id, this.id, attempt, classification.code, classification.message);
        await this.enqueueImageFallback(job);
        this.log.error({
            event: 'whatsapp_job_failed',
            jobId: job.id,
            attempt,
            code: classification.code,
            status: classification.status,
        }, 'WhatsApp outbox job permanently failed');
        return !classification.retryable;
    }
    async enqueueImageFallback(job) {
        if (job.message_type !== client_1.OutboundMessageType.IMAGE)
            return;
        const image = payloadImage(job);
        if (!image?.fallbackText)
            return;
        const fallbackDedupeKey = (0, outbound_message_service_1.hashDedupeKey)(image.fallbackDedupeKey || `${job.dedupe_key}:fallback`);
        try {
            const result = await this.repository.createJob({
                companyId: job.company_id,
                channel: job.channel,
                messageType: client_1.OutboundMessageType.TEXT,
                recipient: job.recipient,
                payload: { text: image.fallbackText },
                sourceType: `${job.source_type}_FALLBACK`.slice(0, 64),
                sourceId: job.source_id,
                batchId: job.batch_id,
                dedupeKey: fallbackDedupeKey,
                maxAttempts: job.max_attempts,
                expiresAt: job.expires_at,
                groupTicketId: job.group_ticket_id,
            });
            if (!result.duplicate) {
                this.log.warn({ event: 'whatsapp_image_fallback_queued', jobId: job.id, fallbackJobId: result.job.id }, 'Queued text fallback after WhatsApp image failure');
                this.wake();
            }
        }
        catch (error) {
            this.log.error({ event: 'whatsapp_image_fallback_failed', jobId: job.id, error: safeErrorMessage(error) }, 'Unable to persist WhatsApp image fallback job');
        }
    }
    async stop() {
        if (!this.timer && !this.runningPromise)
            return;
        this.stopping = true;
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
        this.unregisterWakeup?.();
        this.unregisterWakeup = null;
        const running = this.runningPromise;
        if (running) {
            await Promise.race([
                running,
                this.sleep(this.shutdownTimeoutMs).then(() => undefined),
            ]);
        }
        this.log.info({ event: 'whatsapp_worker_stopped', workerId: this.id }, 'WhatsApp outbox worker stopped');
    }
}
exports.WhatsappWorker = WhatsappWorker;
exports.whatsappWorker = new WhatsappWorker();
async function startWhatsappWorker() {
    await exports.whatsappWorker.start();
}
async function stopWhatsappWorker() {
    await exports.whatsappWorker.stop();
}
function wakeWhatsappWorker() {
    exports.whatsappWorker.wake();
}
