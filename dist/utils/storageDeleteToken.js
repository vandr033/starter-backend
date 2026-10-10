"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStorageDeleteToken = buildStorageDeleteToken;
exports.verifyStorageDeleteToken = verifyStorageDeleteToken;
const crypto_1 = require("crypto");
const STORAGE_DELETE_TOKEN_VERSION = 1;
const STORAGE_DELETE_TOKEN_PREFIX = 'sdt1';
const DEFAULT_STORAGE_DELETE_TOKEN_TTL_SECONDS = 60 * 60;
let developmentSecret = null;
function getStorageDeleteTokenTtlMs() {
    const parsed = Number.parseInt(process.env.STORAGE_DELETE_TOKEN_TTL_SECONDS || '', 10);
    const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STORAGE_DELETE_TOKEN_TTL_SECONDS;
    return seconds * 1000;
}
function getStorageDeleteTokenSecret() {
    const configuredSecret = [
        process.env.STORAGE_DELETE_TOKEN_SECRET,
        process.env.BETTER_AUTH_SECRET,
        process.env.JWT_SECRET,
        process.env.AUTH_SECRET,
        process.env.SESSION_SECRET,
    ]
        .map((value) => value?.trim())
        .find((value) => Boolean(value));
    if (configuredSecret) {
        return configuredSecret;
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error('STORAGE_DELETE_TOKEN_SECRET (or auth secret) must be configured in production');
    }
    developmentSecret ?? (developmentSecret = (0, crypto_1.randomBytes)(32).toString('hex'));
    return developmentSecret;
}
function base64UrlEncode(input) {
    const source = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return source.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlDecode(input) {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const remainder = padded.length % 4;
    const withPadding = remainder === 0 ? padded : `${padded}${'='.repeat(4 - remainder)}`;
    return Buffer.from(withPadding, 'base64');
}
function signPayload(payloadB64) {
    const mac = (0, crypto_1.createHmac)('sha256', getStorageDeleteTokenSecret()).update(payloadB64).digest();
    return base64UrlEncode(mac);
}
function safeCompareSignature(actual, expected) {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    if (a.length !== b.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(a, b);
}
function buildStorageDeleteToken(relativePath) {
    const payload = {
        v: STORAGE_DELETE_TOKEN_VERSION,
        p: relativePath,
        iat: Date.now(),
        nonce: (0, crypto_1.randomBytes)(10).toString('base64url'),
    };
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    return `${STORAGE_DELETE_TOKEN_PREFIX}.${payloadB64}.${signPayload(payloadB64)}`;
}
function verifyStorageDeleteToken(token, relativePath) {
    const rawToken = token.trim();
    if (!rawToken.startsWith(`${STORAGE_DELETE_TOKEN_PREFIX}.`)) {
        return false;
    }
    const segments = rawToken.split('.');
    if (segments.length !== 3) {
        return false;
    }
    const [, payloadB64, signature] = segments;
    if (!payloadB64 || !signature) {
        return false;
    }
    const expectedSignature = signPayload(payloadB64);
    if (!safeCompareSignature(signature, expectedSignature)) {
        return false;
    }
    try {
        const payloadRaw = base64UrlDecode(payloadB64).toString('utf8');
        const payload = JSON.parse(payloadRaw);
        return (payload.v === STORAGE_DELETE_TOKEN_VERSION &&
            typeof payload.p === 'string' &&
            payload.p === relativePath &&
            typeof payload.iat === 'number' &&
            payload.iat > Date.now() - getStorageDeleteTokenTtlMs() &&
            payload.iat <= Date.now() + 60000);
    }
    catch {
        return false;
    }
}
