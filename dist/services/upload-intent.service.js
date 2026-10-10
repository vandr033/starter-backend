"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_PURPOSES = void 0;
exports.issueUploadIntent = issueUploadIntent;
exports.consumeUploadIntent = consumeUploadIntent;
exports.recordStoredUpload = recordStoredUpload;
exports.assertStoredUpload = assertStoredUpload;
exports.uploadIntentContextId = uploadIntentContextId;
const node_crypto_1 = require("node:crypto");
const client_1 = require("../prisma/client");
const company_availability_1 = require("../utils/company-availability");
const upload_errors_1 = require("../utils/upload-errors");
const upload_validation_1 = require("../utils/upload-validation");
const storage_service_1 = require("./storage.service");
const demo_profiles_1 = require("../config/demo-profiles");
const demo_session_service_1 = require("./demo-session.service");
const demo_request_context_1 = require("./demo-request-context");
exports.UPLOAD_PURPOSES = {
    BOOKING_QR_PROOF: 'BOOKING_QR_PROOF',
    ORDER_PAYMENT_PROOF: 'ORDER_PAYMENT_PROOF',
    RESTAURANT_DEPOSIT_PROOF: 'RESTAURANT_DEPOSIT_PROOF',
    GROUP_PAYMENT_PROOF: 'GROUP_PAYMENT_PROOF',
};
const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 10 * 60;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 30 * 60;
const PURPOSE_CONFIG = {
    BOOKING_QR_PROOF: { maxBytes: upload_validation_1.PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: [...upload_validation_1.PUBLIC_UPLOAD_MIME_TYPES] },
    ORDER_PAYMENT_PROOF: { maxBytes: upload_validation_1.PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: [...upload_validation_1.PUBLIC_UPLOAD_MIME_TYPES] },
    RESTAURANT_DEPOSIT_PROOF: { maxBytes: upload_validation_1.PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: [...upload_validation_1.PUBLIC_UPLOAD_MIME_TYPES] },
    GROUP_PAYMENT_PROOF: { maxBytes: upload_validation_1.PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: [...upload_validation_1.PUBLIC_UPLOAD_MIME_TYPES] },
};
let developmentSecret = null;
function normalizedString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed || null;
}
function positiveInteger(value) {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function getSecret(env = process.env) {
    const configured = [
        env.UPLOAD_INTENT_SECRET,
        env.BETTER_AUTH_SECRET,
        env.AUTH_SECRET,
        env.SESSION_SECRET,
        env.JWT_SECRET,
    ]
        .map((value) => value?.trim())
        .find((value) => Boolean(value));
    if (configured)
        return configured;
    if (env.NODE_ENV === 'production') {
        throw new Error('UPLOAD_INTENT_SECRET (or an auth secret) must be configured in production');
    }
    developmentSecret ?? (developmentSecret = (0, node_crypto_1.randomBytes)(32).toString('hex'));
    return developmentSecret;
}
function parseTtlSeconds(env = process.env) {
    const parsed = Number.parseInt(env.UPLOAD_INTENT_TTL_SECONDS || '', 10);
    if (!Number.isFinite(parsed))
        return DEFAULT_TTL_SECONDS;
    return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, parsed));
}
function base64UrlEncode(value) {
    return (typeof value === 'string' ? Buffer.from(value, 'utf8') : value).toString('base64url');
}
function base64UrlDecode(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value))
        return null;
    try {
        return Buffer.from(value, 'base64url');
    }
    catch {
        return null;
    }
}
function sign(payload, env = process.env) {
    return base64UrlEncode((0, node_crypto_1.createHmac)('sha256', getSecret(env)).update(payload).digest());
}
function safeSignatureCompare(actual, expected) {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && (0, node_crypto_1.timingSafeEqual)(actualBuffer, expectedBuffer);
}
function hashToken(token) {
    return (0, node_crypto_1.createHash)('sha256').update(token, 'utf8').digest('hex');
}
function isUploadPurpose(value) {
    return typeof value === 'string' && Object.values(exports.UPLOAD_PURPOSES).includes(value);
}
function invalidIntent(status = 400) {
    return new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID, status);
}
function parseClaims(token, env = process.env) {
    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== `upi${TOKEN_VERSION}`)
        throw invalidIntent();
    const [prefix, payload, signature] = parts;
    if (!payload || !signature || !safeSignatureCompare(signature, sign(payload, env)))
        throw invalidIntent();
    const decoded = base64UrlDecode(payload);
    if (!decoded)
        throw invalidIntent();
    let value;
    try {
        value = JSON.parse(decoded.toString('utf8'));
    }
    catch {
        throw invalidIntent();
    }
    const allowedMimeTypes = Array.isArray(value.allowedMimeTypes)
        ? value.allowedMimeTypes.filter((mime) => typeof mime === 'string').map(upload_validation_1.canonicalUploadMimeType)
        : [];
    const expiresAt = normalizedString(value.expiresAt);
    if (prefix !== `upi${TOKEN_VERSION}`
        || value.v !== TOKEN_VERSION
        || !positiveInteger(value.companyId)
        || !isUploadPurpose(value.purpose)
        || (value.contextId !== null && typeof value.contextId !== 'string')
        || !positiveInteger(value.maxBytes)
        || allowedMimeTypes.length === 0
        || !expiresAt
        || !normalizedString(value.nonce)) {
        throw invalidIntent();
    }
    const parsedExpiry = new Date(expiresAt);
    if (!Number.isFinite(parsedExpiry.getTime()))
        throw invalidIntent();
    return {
        v: TOKEN_VERSION,
        companyId: value.companyId,
        purpose: value.purpose,
        contextId: value.contextId ?? null,
        maxBytes: value.maxBytes,
        allowedMimeTypes: Array.from(new Set(allowedMimeTypes)),
        expiresAt: parsedExpiry.toISOString(),
        nonce: value.nonce,
    };
}
async function findAvailableCompany(slug) {
    if ((0, demo_profiles_1.getDemoProfileForCompanySlug)(slug))
        throw invalidIntent(403);
    const company = await client_1.prisma.company.findUnique({
        where: { slug },
        select: { id: true, slug: true, is_active: true, deleted_at: true, availableUntil: true },
    });
    if (!company || !(0, company_availability_1.isCompanyAvailableNow)(company))
        throw invalidIntent(404);
    return company;
}
function contextRecord(value) {
    return value && typeof value === 'object' ? value : {};
}
async function resolveContext(params) {
    const context = contextRecord(params.context);
    const type = normalizedString(context.type)?.toUpperCase() || null;
    if (params.purpose === exports.UPLOAD_PURPOSES.BOOKING_QR_PROOF) {
        if (type && type !== 'BOOKING')
            throw invalidIntent();
        if (params.authUserId)
            return `BOOKING:${params.authUserId}`;
        // Guest booking pages may upload before sign-in. Bind that upload to a
        // browser-generated flow context so the later authenticated handoff does
        // not have to fall back to an unscoped anonymous booking context.
        const anonymousFlowId = normalizedString(context.id);
        if (!anonymousFlowId)
            return null;
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(anonymousFlowId))
            throw invalidIntent();
        return `BOOKING:${anonymousFlowId}`;
    }
    if (params.purpose === exports.UPLOAD_PURPOSES.GROUP_PAYMENT_PROOF) {
        if (type === 'EVENT') {
            const id = positiveInteger(context.id);
            const event = id
                ? await client_1.prisma.groupEvent.findFirst({ where: { id, company_id: params.companyId, status: 'PUBLISHED', deleted_at: null }, select: { id: true } })
                : null;
            if (!event)
                throw invalidIntent(404);
            return `EVENT:${event.id}`;
        }
        if (type === 'CLASS') {
            const id = positiveInteger(context.id);
            const groupClass = id
                ? await client_1.prisma.groupClass.findFirst({ where: { id, company_id: params.companyId, status: 'PUBLISHED', deleted_at: null }, select: { id: true } })
                : null;
            if (!groupClass)
                throw invalidIntent(404);
            return `CLASS:${groupClass.id}`;
        }
        if (type === 'INSTALLMENT') {
            const enrollmentId = positiveInteger(context.enrollmentId);
            const installmentId = positiveInteger(context.installmentId);
            if (!enrollmentId || !installmentId || !params.authUserId)
                throw invalidIntent();
            const installment = await client_1.prisma.enrollmentInstallment.findFirst({
                where: { id: installmentId, enrollment_id: enrollmentId },
                select: { id: true, payment_status: true, enrollment: { select: { company_id: true, user_id: true } } },
            });
            if (!installment || installment.enrollment.company_id !== params.companyId || installment.enrollment.user_id !== params.authUserId || installment.payment_status === 'PAID') {
                throw invalidIntent(404);
            }
            return `INSTALLMENT:${enrollmentId}:${installment.id}`;
        }
        throw invalidIntent();
    }
    if (params.purpose === exports.UPLOAD_PURPOSES.RESTAURANT_DEPOSIT_PROOF) {
        const reservationCode = normalizedString(params.reservationCode) || normalizedString(context.reservationCode);
        if (!reservationCode)
            throw invalidIntent();
        const reservation = await client_1.prisma.restaurantReservation.findFirst({
            where: { company_id: params.companyId, reservation_code: reservationCode },
            select: { id: true, status: true, deposit: { select: { status: true } } },
        });
        if (!reservation || ['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(reservation.status) || !reservation.deposit || ['APPROVED', 'WAIVED', 'REFUNDED', 'EXPIRED'].includes(reservation.deposit.status)) {
            throw invalidIntent(404);
        }
        return `RESERVATION:${reservation.id}`;
    }
    if (params.purpose === exports.UPLOAD_PURPOSES.ORDER_PAYMENT_PROOF) {
        if (type === 'CHECKOUT') {
            if (!params.authUserId)
                throw invalidIntent(401);
            return `CHECKOUT:${params.authUserId}`;
        }
        if (type === 'ORDER') {
            const orderNumber = normalizedString(context.orderNumber);
            if (!orderNumber)
                throw invalidIntent();
            const order = await client_1.prisma.commerceOrder.findFirst({
                where: { company_id: params.companyId, order_number: orderNumber },
                select: {
                    id: true,
                    payment_method: true,
                    payment_status: true,
                    public_access_token: true,
                    customer_profile: { select: { user_id: true } },
                },
            });
            const accessToken = normalizedString(params.accessToken);
            const authorized = Boolean(order
                && ((params.authUserId && order.customer_profile?.user_id === params.authUserId) || (accessToken && order.public_access_token === accessToken)));
            if (!order || !authorized || !['QR', 'MANUAL'].includes(order.payment_method) || !['AWAITING_PAYMENT', 'PAYMENT_REJECTED'].includes(order.payment_status)) {
                throw invalidIntent(404);
            }
            return `ORDER:${order.id}`;
        }
        throw invalidIntent();
    }
    throw invalidIntent();
}
async function issueUploadIntent(params) {
    if (!isUploadPurpose(params.purpose))
        throw invalidIntent();
    const company = await findAvailableCompany(params.slug);
    const contextId = await resolveContext({
        companyId: company.id,
        purpose: params.purpose,
        context: params.context,
        reservationCode: params.reservationCode,
        accessToken: params.accessToken,
        authUserId: params.authUserId,
    });
    const config = PURPOSE_CONFIG[params.purpose];
    const expiresAt = new Date(Date.now() + parseTtlSeconds() * 1000);
    const claims = {
        v: TOKEN_VERSION,
        companyId: company.id,
        purpose: params.purpose,
        contextId,
        maxBytes: config.maxBytes,
        allowedMimeTypes: config.allowedMimeTypes,
        expiresAt: expiresAt.toISOString(),
        nonce: (0, node_crypto_1.randomBytes)(24).toString('base64url'),
    };
    const payload = base64UrlEncode(JSON.stringify(claims));
    const token = `upi${TOKEN_VERSION}.${payload}.${sign(payload)}`;
    await client_1.prisma.uploadIntent.create({
        data: {
            company_id: company.id,
            purpose: claims.purpose,
            context_id: claims.contextId,
            nonce: claims.nonce,
            token_hash: hashToken(token),
            max_bytes: claims.maxBytes,
            allowed_mime_types: claims.allowedMimeTypes,
            expires_at: expiresAt,
        },
    });
    return {
        uploadIntent: token,
        expiresAt: expiresAt.toISOString(),
        maxBytes: claims.maxBytes,
        allowedMimeTypes: claims.allowedMimeTypes,
        purpose: claims.purpose,
        contextId: claims.contextId,
    };
}
async function consumeUploadIntent(token, options) {
    if (typeof token !== 'string' || !token.trim())
        throw invalidIntent();
    const claims = parseClaims(token);
    const expectedPurposes = Array.isArray(options.expectedPurpose) ? options.expectedPurpose : [options.expectedPurpose];
    const expectedMimeTypes = PURPOSE_CONFIG[claims.purpose].allowedMimeTypes;
    if (!expectedPurposes.includes(claims.purpose) || claims.companyId !== (options.companyId ?? claims.companyId) || (options.contextId !== undefined && claims.contextId !== options.contextId) || claims.maxBytes !== PURPOSE_CONFIG[claims.purpose].maxBytes || JSON.stringify(claims.allowedMimeTypes) !== JSON.stringify(expectedMimeTypes)) {
        throw invalidIntent();
    }
    const now = new Date();
    const expiresAt = new Date(claims.expiresAt);
    if (expiresAt.getTime() <= now.getTime())
        throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_EXPIRED, 410);
    const stored = await client_1.prisma.uploadIntent.findUnique({ where: { nonce: claims.nonce } });
    if (!stored || stored.token_hash !== hashToken(token) || stored.company_id !== claims.companyId || stored.purpose !== claims.purpose || stored.context_id !== claims.contextId) {
        throw invalidIntent();
    }
    if ((0, demo_request_context_1.isDemoRequest)() || await (0, demo_session_service_1.isDemoCompanyId)(stored.company_id))
        throw invalidIntent(403);
    if (stored.expires_at.getTime() <= now.getTime())
        throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_EXPIRED, 410);
    if (stored.consumed_at)
        throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_REPLAYED, 409);
    const consumed = await client_1.prisma.uploadIntent.updateMany({
        where: { id: stored.id, consumed_at: null, expires_at: { gt: now } },
        data: { consumed_at: now },
    });
    if (consumed.count !== 1) {
        const current = await client_1.prisma.uploadIntent.findUnique({ where: { id: stored.id }, select: { consumed_at: true, expires_at: true } });
        if (current?.consumed_at)
            throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_REPLAYED, 409);
        if (!current || current.expires_at.getTime() <= Date.now())
            throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_EXPIRED, 410);
        throw invalidIntent();
    }
    return { ...claims, databaseId: stored.id };
}
async function recordStoredUpload(intent, relativePath) {
    const normalizedPath = storage_service_1.StorageService.toRelativeStoragePath(relativePath);
    if (!normalizedPath || normalizedPath.length > 512)
        throw invalidIntent();
    const result = await client_1.prisma.uploadIntent.updateMany({
        where: { id: intent.databaseId, nonce: intent.nonce, consumed_at: { not: null }, stored_path: null },
        data: { stored_path: normalizedPath },
    });
    if (result.count !== 1)
        throw invalidIntent();
}
async function assertStoredUpload(params) {
    const relativePath = storage_service_1.StorageService.toRelativeStoragePath(params.rawPathOrUrl);
    if (!relativePath)
        throw invalidIntent();
    const intent = await client_1.prisma.uploadIntent.findFirst({
        where: {
            stored_path: relativePath,
            company_id: params.companyId,
            purpose: params.purpose,
            context_id: params.contextId ?? null,
            consumed_at: { not: null },
        },
    });
    if (!intent)
        throw invalidIntent(403);
    return { intent, relativePath };
}
function uploadIntentContextId(value) {
    if (value.type === 'EVENT' || value.type === 'CLASS') {
        if (!value.id || !Number.isInteger(value.id) || value.id <= 0)
            throw invalidIntent();
        return `${value.type}:${value.id}`;
    }
    if (!value.enrollmentId || !value.installmentId || !Number.isInteger(value.enrollmentId) || !Number.isInteger(value.installmentId))
        throw invalidIntent();
    return `INSTALLMENT:${value.enrollmentId}:${value.installmentId}`;
}
