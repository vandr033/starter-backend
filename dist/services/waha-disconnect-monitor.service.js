"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wahaDisconnectMonitor = void 0;
exports.createWahaDisconnectMonitor = createWahaDisconnectMonitor;
exports.startWahaDisconnectMonitor = startWahaDisconnectMonitor;
const logger_1 = require("../config/logger");
const sendEmail_1 = require("../utils/sendEmail");
const waha_service_1 = require("./waha.service");
const whatsapp_worker_signals_1 = require("./whatsapp-worker-signals");
const DEFAULT_ALERT_EMAIL = 'sebastian.andradeg@outlook.com';
const DEFAULT_MONITOR_INTERVAL_MS = 30000;
const DISCONNECTED_STATUSES = new Set([
    'FAILED',
    'SCAN_QR_CODE',
    'STOPPED',
]);
function normalizeOptionalString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function parsePositiveInt(value, fallback) {
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function normalizeStatus(value) {
    return typeof value === 'string' && value.trim()
        ? value.trim().toUpperCase()
        : null;
}
function maskEmail(email) {
    const [local, domain] = email.split('@');
    if (!local || !domain)
        return email;
    return `${local.slice(0, 2)}***@${domain}`;
}
function buildAlertHtml(params) {
    return `
    <p>The WAHA WhatsApp session is disconnected and needs attention.</p>
    <ul>
      <li><strong>Session:</strong> ${escapeHtml(params.session)}</li>
      <li><strong>Status:</strong> ${escapeHtml(params.status)}</li>
      <li><strong>Detected at:</strong> ${escapeHtml(params.detectedAt.toISOString())}</li>
    </ul>
    <p>Open the Super Admin WAHA dashboard to restart the session or scan a new QR code.</p>
  `;
}
function createWahaDisconnectMonitor(options = {}) {
    const env = options.env ?? process.env;
    const client = options.client ?? waha_service_1.wahaClient;
    const log = options.logger ?? logger_1.logger;
    const now = options.now ?? (() => new Date());
    const emailSender = options.sendEmail ?? sendEmail_1.sendGenericEmail;
    const session = normalizeOptionalString(env.WAHA_SESSION) || 'default';
    const recipient = normalizeOptionalString(env.WAHA_DISCONNECT_ALERT_EMAIL) || DEFAULT_ALERT_EMAIL;
    const intervalMs = parsePositiveInt(env.WAHA_MONITOR_INTERVAL_MS, DEFAULT_MONITOR_INTERVAL_MS);
    let outageAlertSent = false;
    let lastObservedStatus = null;
    let timer = null;
    let checkInFlight = null;
    async function sendDisconnectAlert(status) {
        const detectedAt = now();
        const result = await emailSender(recipient, `Alert: WAHA disconnected (${session})`, buildAlertHtml({ session, status, detectedAt }));
        if (result?.status === 'FAILED') {
            throw new Error(`Email delivery failed: ${result.reason}`);
        }
        outageAlertSent = true;
        log.warn({
            event: 'waha_disconnect_alert_sent',
            session,
            status,
            recipient: maskEmail(recipient),
            detectedAt: detectedAt.toISOString(),
            deliveryStatus: result?.status ?? 'SENT',
            deliveryReason: result?.reason ?? 'REMOTE_SUCCESS',
        }, result?.status === 'SKIPPED'
            ? 'WAHA disconnect alert email skipped'
            : 'WAHA disconnect alert email sent');
    }
    async function performCheck() {
        let status;
        try {
            const response = await client.getSessionInfo(session);
            status = normalizeStatus(response.data?.status) || 'UNKNOWN';
        }
        catch (error) {
            if (error instanceof waha_service_1.WahaRequestError && error.status === 404) {
                status = 'SESSION_NOT_FOUND';
            }
            else {
                log.error({
                    event: 'waha_disconnect_monitor_check_failed',
                    session,
                    error,
                }, 'Unable to check WAHA session status');
                return;
            }
        }
        const previousStatus = lastObservedStatus;
        lastObservedStatus = status;
        // The worker also polls independently, which is required when it runs in
        // a separate process. In the web process this status transition wakes it
        // immediately after a reconnect instead of waiting for the next poll.
        if (previousStatus !== status)
            (0, whatsapp_worker_signals_1.wakeWhatsappWorker)();
        if (status === 'WORKING') {
            if (outageAlertSent) {
                log.info({
                    event: 'waha_session_reconnected',
                    session,
                    previousStatus,
                }, 'WAHA session reconnected; disconnect alert state reset');
            }
            outageAlertSent = false;
            return;
        }
        const isDisconnected = DISCONNECTED_STATUSES.has(status) || status === 'SESSION_NOT_FOUND';
        if (!isDisconnected || outageAlertSent)
            return;
        try {
            await sendDisconnectAlert(status);
        }
        catch (error) {
            log.error({
                event: 'waha_disconnect_alert_failed',
                session,
                status,
                recipient: maskEmail(recipient),
                error,
            }, 'Unable to send WAHA disconnect alert email');
        }
    }
    function checkNow() {
        if (checkInFlight)
            return checkInFlight;
        checkInFlight = performCheck().finally(() => {
            checkInFlight = null;
        });
        return checkInFlight;
    }
    function start() {
        if (timer)
            return;
        log.info({
            event: 'waha_disconnect_monitor_started',
            session,
            intervalMs,
            recipient: maskEmail(recipient),
        }, 'WAHA disconnect monitor started');
        void checkNow();
        timer = setInterval(() => {
            void checkNow();
        }, intervalMs);
        timer.unref();
    }
    function stop() {
        if (!timer)
            return;
        clearInterval(timer);
        timer = null;
    }
    return {
        checkNow,
        start,
        stop,
    };
}
exports.wahaDisconnectMonitor = createWahaDisconnectMonitor();
function startWahaDisconnectMonitor() {
    exports.wahaDisconnectMonitor.start();
}
