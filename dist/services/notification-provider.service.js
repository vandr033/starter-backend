"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEmailDeliverySuccessful = isEmailDeliverySuccessful;
exports.getEmailProviderState = getEmailProviderState;
exports.setEmailTransportFactoryForTests = setEmailTransportFactoryForTests;
exports.deliverEmail = deliverEmail;
exports.getLocalEmailDeliveries = getLocalEmailDeliveries;
exports.clearLocalEmailDeliveries = clearLocalEmailDeliveries;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = require("../config/logger");
const demo_session_service_1 = require("./demo-session.service");
const demo_request_context_1 = require("./demo-request-context");
function isEmailDeliverySuccessful(result) {
    return Boolean(result
        && typeof result === 'object'
        && result.provider === 'email'
        && result.status === 'SENT');
}
let remoteTransporter = null;
let remoteTransporterKey = null;
let emailTransportFactoryForTests = null;
const localEmailDeliveries = [];
function normalize(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function isTrue(value) {
    return normalize(value).toLowerCase() === 'true';
}
function resolveMode(env) {
    const configured = normalize(env.MAIL_TRANSPORT).toLowerCase();
    if (configured === 'sink')
        return 'sink';
    if (configured === 'disabled')
        return 'disabled';
    return 'remote';
}
function getEmailProviderState(env = process.env) {
    const enabled = isTrue(env.MAIL_ENABLED);
    const mode = enabled ? resolveMode(env) : 'disabled';
    if (!enabled || mode === 'disabled') {
        return { enabled, mode: 'disabled', configured: false, reason: 'PROVIDER_DISABLED' };
    }
    if (mode === 'sink') {
        return { enabled, mode, configured: true, reason: null };
    }
    const host = normalize(env.MAIL_HOST);
    const from = normalize(env.MAIL_FROM);
    const user = normalize(env.MAIL_USER);
    const pass = normalize(env.MAIL_PASS);
    const port = Number.parseInt(normalize(env.MAIL_PORT) || '587', 10);
    const configured = Boolean(host && from && user && pass && Number.isInteger(port) && port > 0 && port < 65536);
    return {
        enabled,
        mode,
        configured,
        reason: configured ? null : 'PROVIDER_NOT_CONFIGURED',
    };
}
function maskRecipient(value) {
    const [local, domain] = value.split('@');
    if (!local || !domain)
        return 'invalid';
    return `${local.slice(0, 2)}***@${domain}`;
}
function transportKey(env) {
    return [
        normalize(env.MAIL_HOST),
        normalize(env.MAIL_PORT) || '587',
        normalize(env.MAIL_SECURE).toLowerCase(),
        normalize(env.MAIL_FROM),
        normalize(env.MAIL_USER),
        normalize(env.MAIL_PASS),
    ].join('|');
}
function getRemoteTransporter(env) {
    const key = transportKey(env);
    if (remoteTransporter && remoteTransporterKey === key)
        return remoteTransporter;
    if (emailTransportFactoryForTests) {
        remoteTransporter = emailTransportFactoryForTests(env);
        remoteTransporterKey = key;
        return remoteTransporter;
    }
    const port = Number.parseInt(normalize(env.MAIL_PORT) || '587', 10);
    const secure = isTrue(env.MAIL_SECURE) || port === 465;
    remoteTransporter = nodemailer_1.default.createTransport({
        host: normalize(env.MAIL_HOST),
        port,
        secure,
        requireTLS: !secure,
        auth: {
            user: normalize(env.MAIL_USER),
            pass: normalize(env.MAIL_PASS),
        },
        connectionTimeout: Number.parseInt(normalize(env.MAIL_CONNECTION_TIMEOUT_MS) || '15000', 10),
        greetingTimeout: Number.parseInt(normalize(env.MAIL_GREETING_TIMEOUT_MS) || '15000', 10),
        socketTimeout: Number.parseInt(normalize(env.MAIL_SOCKET_TIMEOUT_MS) || '20000', 10),
    });
    remoteTransporterKey = key;
    return remoteTransporter;
}
/**
 * Replaces the remote email transport for deterministic unit tests. Production
 * code never calls this; resetting it also clears the cached transporter.
 */
function setEmailTransportFactoryForTests(factory) {
    emailTransportFactoryForTests = factory;
    remoteTransporter = null;
    remoteTransporterKey = null;
}
async function deliverEmail(message, env = process.env) {
    const normalizedRecipient = normalize(message.to);
    if ((0, demo_request_context_1.isDemoRequest)()
        || (message.companyId != null && await (0, demo_session_service_1.isDemoCompanyId)(message.companyId))
        || normalizedRecipient.endsWith('@demo.priconpri.invalid')) {
        return { provider: 'email', status: 'SKIPPED', reason: 'DEMO_READ_ONLY' };
    }
    const state = getEmailProviderState(env);
    const recipient = normalizedRecipient;
    if (!recipient || !recipient.includes('@')) {
        const result = {
            provider: 'email',
            status: 'SKIPPED',
            reason: 'INVALID_RECIPIENT',
        };
        logger_1.logger.warn({ provider: 'email', status: result.status, reason: result.reason }, 'Email delivery skipped');
        return result;
    }
    if (state.mode === 'disabled') {
        const result = {
            provider: 'email',
            status: 'SKIPPED',
            reason: 'PROVIDER_DISABLED',
        };
        logger_1.logger.info({ provider: 'email', status: result.status, reason: result.reason, to: maskRecipient(recipient) }, 'Email delivery skipped');
        return result;
    }
    if (!state.configured) {
        const result = {
            provider: 'email',
            status: 'FAILED',
            reason: 'PROVIDER_NOT_CONFIGURED',
        };
        logger_1.logger.error({ provider: 'email', status: result.status, reason: result.reason, to: maskRecipient(recipient) }, 'Email provider is not configured');
        return result;
    }
    if (state.mode === 'sink') {
        localEmailDeliveries.push({ to: recipient, subject: message.subject, html: message.html });
        const result = {
            provider: 'email',
            status: 'SENT',
            reason: 'LOCAL_SINK',
            providerId: 'local-sink',
        };
        logger_1.logger.info({ provider: 'email', status: result.status, reason: result.reason, to: maskRecipient(recipient) }, 'Email captured by local notification sink');
        return result;
    }
    try {
        const info = await getRemoteTransporter(env).sendMail({
            to: recipient,
            from: normalize(message.from) || normalize(env.MAIL_FROM),
            subject: message.subject,
            html: message.html,
        });
        const result = {
            provider: 'email',
            status: 'SENT',
            reason: 'REMOTE_SUCCESS',
            providerId: typeof info.messageId === 'string' ? info.messageId : undefined,
        };
        logger_1.logger.info({ provider: 'email', status: result.status, to: maskRecipient(recipient), providerId: result.providerId }, 'Email delivered');
        return result;
    }
    catch (error) {
        const result = {
            provider: 'email',
            status: 'FAILED',
            reason: 'TRANSPORT_FAILED',
        };
        logger_1.logger.error({ provider: 'email', status: result.status, reason: result.reason, to: maskRecipient(recipient), error: error instanceof Error ? { name: error.name, code: error.code } : undefined }, 'Email transport failed');
        return result;
    }
}
function getLocalEmailDeliveries() {
    return localEmailDeliveries.map((delivery) => ({ ...delivery }));
}
function clearLocalEmailDeliveries() {
    localEmailDeliveries.length = 0;
}
