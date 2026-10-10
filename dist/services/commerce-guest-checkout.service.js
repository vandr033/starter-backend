"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCommerceGuestCheckout = startCommerceGuestCheckout;
exports.resendCommerceGuestCheckoutCode = resendCommerceGuestCheckoutCode;
exports.verifyCommerceGuestCheckout = verifyCommerceGuestCheckout;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../prisma/client");
const logger_1 = require("../config/logger");
const auth_1 = require("../config/auth");
const verification_1 = require("../utils/verification");
const phoneNormalization_1 = require("../utils/phoneNormalization");
const sendEmail_1 = require("../utils/sendEmail");
const whatsappSender_1 = require("../utils/whatsappSender");
const outbound_message_repository_1 = require("./outbound-message.repository");
const customer_account_service_1 = require("./customer-account.service");
const CommerceRepo = __importStar(require("../repositories/commerce.repo"));
const UserRepo = __importStar(require("../repositories/user.repo"));
const OTP_MAX_ATTEMPTS = 5;
function normalizeEmail(value) {
    return value.trim().toLowerCase();
}
function splitFullName(fullName) {
    const cleaned = fullName.trim().replace(/\s+/g, ' ');
    if (!cleaned)
        return { fullName: '', firstName: null, lastName: null };
    const parts = cleaned.split(' ');
    return {
        fullName: cleaned,
        firstName: parts[0] || null,
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
    };
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function maskEmail(email) {
    if (!email.includes('@'))
        return null;
    const [local, domain] = email.split('@');
    if (!local || !domain)
        return null;
    if (local.length <= 2)
        return `${local[0] ?? '*'}*@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
}
function maskPhone(phoneDigits) {
    const digits = phoneDigits.replace(/\D/g, '');
    if (!digits)
        return null;
    if (digits.length <= 4)
        return `***${digits}`;
    return `***${digits.slice(-4)}`;
}
function buildPhoneCandidates(phonePrefix, phoneNumber) {
    const canonical = (0, phoneNormalization_1.canonicalizePhoneParts)({ phonePrefix, phoneNumber });
    if (!canonical.phoneNumber)
        return [];
    const values = new Set();
    values.add(canonical.phoneNumber);
    if (canonical.phonePrefix) {
        values.add(`${canonical.phonePrefix}${canonical.phoneNumber}`);
        values.add(`+${canonical.phonePrefix}${canonical.phoneNumber}`);
    }
    return Array.from(values);
}
function getResendCooldownSeconds() {
    const value = Number.isFinite(verification_1.OTP_RESEND_COOLDOWN_SECONDS) ? verification_1.OTP_RESEND_COOLDOWN_SECONDS : 60;
    return Math.max(1, Math.trunc(value));
}
function buildRetryAfterSeconds(date) {
    return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}
async function getPublicStore(slug) {
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(slug);
    if (!company) {
        return { error: true, result: { code: 404, error: true, message: 'No encontramos la tienda.' } };
    }
    const store = await CommerceRepo.findCommerceStoreByCompanyId(company.id);
    if (!store?.is_active) {
        return { error: true, result: { code: 404, error: true, message: 'La tienda no está disponible en este momento.' } };
    }
    return { error: false, company, store };
}
async function classifyAccount(params) {
    const phoneCandidates = buildPhoneCandidates(params.phonePrefix, params.phoneNumber);
    const [emailUserRaw, phoneUserRaw] = await Promise.all([
        client_1.prisma.user.findUnique({
            where: { email: params.email },
            select: {
                id: true,
                email: true,
                name: true,
                first_name: true,
                last_name: true,
                country_code: true,
                phone_prefix: true,
                phoneNumber: true,
            },
        }),
        phoneCandidates.length > 0
            ? client_1.prisma.user.findFirst({
                where: { phoneNumber: { in: phoneCandidates } },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    first_name: true,
                    last_name: true,
                    phone_prefix: true,
                    phoneNumber: true,
                },
            })
            : Promise.resolve(null),
    ]);
    const emailUser = emailUserRaw;
    const phoneUser = phoneUserRaw;
    if (emailUser && phoneUser && emailUser.id !== phoneUser.id) {
        return { outcome: 'ACCOUNT_CONFLICT_PHONE_EMAIL', emailUser, phoneUser, resolvedUserId: null };
    }
    if (!emailUser && !phoneUser) {
        return { outcome: 'NEW_ACCOUNT_PENDING_CREATION', emailUser: null, phoneUser: null, resolvedUserId: null };
    }
    if (emailUser && !phoneUser) {
        return { outcome: 'ACCOUNT_FOUND_BY_EMAIL', emailUser, phoneUser: null, resolvedUserId: emailUser.id };
    }
    if (!emailUser && phoneUser) {
        return { outcome: 'ACCOUNT_FOUND_BY_PHONE', emailUser: null, phoneUser, resolvedUserId: phoneUser.id };
    }
    return { outcome: 'ACCOUNT_ALREADY_EXISTS', emailUser, phoneUser, resolvedUserId: emailUser?.id ?? phoneUser?.id ?? null };
}
async function dispatchSharedCode(params) {
    const [emailResult, phoneResult] = await Promise.all([
        (0, sendEmail_1.sendEmailCode)(params.email, params.code, params.companyId).catch(() => -1),
        (0, whatsappSender_1.queueWhatsappCode)(params.phoneFull, params.code, {
            companyId: params.companyId,
            sourceType: 'COMMERCE_GUEST_CHECKOUT_OTP',
            sourceId: params.sourceId ?? params.phoneFull,
            expiresAt: params.expiresAt ?? new Date(Date.now() + verification_1.OTP_TTL_MINUTES * 60000),
        }).catch(() => null),
    ]);
    const phoneStatus = phoneResult
        ? (0, whatsappSender_1.getWhatsappEnqueueLifecycleStatus)(phoneResult)
        : 'FAILED';
    const phoneSent = phoneStatus === 'SENT';
    const phoneQueued = phoneStatus === 'PENDING' || phoneStatus === 'PROCESSING';
    return {
        emailSent: emailResult !== -1,
        phoneSent,
        phoneQueued,
        phoneStatus,
        phoneJobId: phoneResult?.jobId ?? null,
        maskedEmail: maskEmail(params.email),
        maskedPhone: maskPhone(params.phoneFull),
    };
}
function buildStartPayload(params) {
    return {
        code: 200,
        error: false,
        message: params.accountOutcome === 'ACCOUNT_CONFLICT_PHONE_EMAIL'
            ? 'Los datos ingresados pertenecen a cuentas distintas. Inicia sesión para continuar.'
            : 'Verificación de checkout iniciada.',
        data: {
            checkout_session_id: params.sessionId,
            accountOutcome: params.accountOutcome,
            otpDelivery: {
                emailSent: params.emailSent,
                phoneSent: params.phoneSent,
                phoneQueued: params.phoneQueued,
                phoneStatus: params.phoneStatus,
                phoneJobId: params.phoneJobId,
                maskedEmail: params.maskedEmail,
                maskedPhone: params.maskedPhone,
            },
            expiresAt: params.expiresAt?.toISOString() ?? null,
            resendCooldownSeconds: getResendCooldownSeconds(),
            canVerify: params.emailSent || params.phoneSent || params.phoneQueued,
        },
    };
}
async function getSessionOrError(companyId, storeId, sessionId) {
    const session = await client_1.prisma.commerceGuestCheckoutSession.findFirst({
        where: {
            id: sessionId,
            company_id: companyId,
            store_id: storeId,
        },
    });
    if (!session) {
        return { error: true, result: { code: 404, error: true, message: 'No encontramos la verificación del checkout.' } };
    }
    if (session.consumed_at) {
        return { error: true, result: { code: 400, error: true, message: 'Esta verificación ya fue utilizada.' } };
    }
    return { error: false, session };
}
async function signInCustomerWithEmail(params) {
    const auth = await (0, auth_1.getAuth)();
    const password = params.password ?? crypto_1.default.randomBytes(32).toString('hex');
    if (!params.password) {
        await UserRepo.updateUserPassword(params.userId, await bcryptjs_1.default.hash(password, 10));
    }
    const signInResponse = await auth.api.signInEmail({
        body: { email: params.email, password },
        headers: params.reqHeaders,
        asResponse: true,
    });
    if (!signInResponse.ok) {
        let message = 'No pudimos iniciar la sesión del checkout.';
        try {
            const payload = await signInResponse.json();
            if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
                message = payload.message;
            }
        }
        catch {
            // Keep default message.
        }
        throw new Error(message);
    }
    const cookies = signInResponse.headers.getSetCookie?.() || [];
    if (cookies.length === 0) {
        const singleCookie = signInResponse.headers.get('set-cookie');
        if (singleCookie)
            cookies.push(singleCookie);
    }
    const sessionHeaders = new Headers(params.reqHeaders);
    if (cookies.length > 0) {
        sessionHeaders.set('cookie', cookies.join('; '));
    }
    const session = await auth.api.getSession({ headers: sessionHeaders });
    if (!session?.user) {
        throw new Error('No pudimos recuperar la sesión del checkout.');
    }
    return { user: session.user, cookies };
}
async function startCommerceGuestCheckout(slug, input) {
    const storeResult = await getPublicStore(slug);
    if (storeResult.error)
        return storeResult.result;
    const { company, store } = storeResult;
    const name = splitFullName(input.customerName ?? '');
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
        phonePrefix: input.customerPhonePrefix,
        phoneNumber: input.customerPhone,
        defaultPrefix: company.phone_prefix || '591',
    });
    const normalizedCountryCode = input.customerCountryCode?.trim().toUpperCase() || null;
    const email = normalizeEmail(input.customerEmail ?? '');
    if (!name.fullName)
        return { code: 400, error: true, message: 'El nombre es obligatorio.' };
    if (!email || !isValidEmail(email))
        return { code: 400, error: true, message: 'Debes ingresar un correo válido.' };
    if (!canonicalPhone.phonePrefix)
        return { code: 400, error: true, message: 'El prefijo del teléfono es obligatorio.' };
    if (!canonicalPhone.phoneNumber)
        return { code: 400, error: true, message: 'El teléfono es obligatorio.' };
    const account = await classifyAccount({
        email,
        phonePrefix: canonicalPhone.phonePrefix,
        phoneNumber: canonicalPhone.phoneNumber,
    });
    if (account.outcome === 'ACCOUNT_CONFLICT_PHONE_EMAIL') {
        return buildStartPayload({
            sessionId: null,
            accountOutcome: account.outcome,
            emailSent: false,
            phoneSent: false,
            phoneQueued: false,
            phoneStatus: 'FAILED',
            phoneJobId: null,
            maskedEmail: maskEmail(email),
            maskedPhone: maskPhone(canonicalPhone.fullPhone ?? canonicalPhone.phoneNumber),
            expiresAt: null,
        });
    }
    const sharedCode = (0, verification_1.generateNumericCode)();
    const otpHash = await bcryptjs_1.default.hash(sharedCode, 10);
    const phoneFull = canonicalPhone.fullPhone ?? `${canonicalPhone.phonePrefix}${canonicalPhone.phoneNumber}`;
    const expiresAt = new Date(Date.now() + verification_1.OTP_TTL_MINUTES * 60000);
    const delivery = await dispatchSharedCode({ companyId: company.id, email, phoneFull, code: sharedCode, expiresAt, sourceId: `start:${phoneFull}` });
    const resendAvailableAt = new Date(Date.now() + getResendCooldownSeconds() * 1000);
    const session = await client_1.prisma.commerceGuestCheckoutSession.create({
        data: {
            company_id: company.id,
            store_id: store.id,
            resolved_user_id: account.resolvedUserId,
            full_name: name.fullName,
            first_name: name.firstName,
            last_name: name.lastName,
            email,
            country_code: normalizedCountryCode,
            phone_prefix: canonicalPhone.phonePrefix,
            phone_number: canonicalPhone.phoneNumber,
            account_outcome: account.outcome,
            otp_hash: otpHash,
            otp_attempts: 0,
            otp_max_attempts: OTP_MAX_ATTEMPTS,
            otp_expires_at: expiresAt,
            resend_available_at: resendAvailableAt,
            email_delivery_succeeded: delivery.emailSent,
            phone_delivery_succeeded: delivery.phoneSent,
            phone_delivery_status: delivery.phoneStatus,
            phone_delivery_job_id: delivery.phoneJobId,
            delivery_attempted_at: new Date(),
        },
    });
    await (0, outbound_message_repository_1.syncWhatsappOtpSessionDelivery)(delivery.phoneJobId, {
        kind: 'COMMERCE_GUEST_CHECKOUT',
        sessionId: session.id,
    });
    return buildStartPayload({
        sessionId: session.id,
        accountOutcome: account.outcome,
        emailSent: delivery.emailSent,
        phoneSent: delivery.phoneSent,
        phoneQueued: delivery.phoneQueued,
        phoneStatus: delivery.phoneStatus,
        phoneJobId: delivery.phoneJobId,
        maskedEmail: delivery.maskedEmail,
        maskedPhone: delivery.maskedPhone,
        expiresAt,
    });
}
async function resendCommerceGuestCheckoutCode(slug, sessionId) {
    const storeResult = await getPublicStore(slug);
    if (storeResult.error)
        return storeResult.result;
    const { company, store } = storeResult;
    const sessionResult = await getSessionOrError(company.id, store.id, sessionId);
    if (sessionResult.error)
        return sessionResult.result;
    const session = sessionResult.session;
    if (session.resend_available_at.getTime() > Date.now()) {
        const retryAfter = buildRetryAfterSeconds(session.resend_available_at);
        return {
            code: 429,
            error: true,
            message: `Debes esperar ${retryAfter} segundos para reenviar el código`,
            data: {
                retry_after_seconds: retryAfter,
                resend_cooldown_seconds: getResendCooldownSeconds(),
            },
        };
    }
    const sharedCode = (0, verification_1.generateNumericCode)();
    const otpHash = await bcryptjs_1.default.hash(sharedCode, 10);
    const phoneFull = `${session.phone_prefix}${session.phone_number}`;
    const expiresAt = new Date(Date.now() + verification_1.OTP_TTL_MINUTES * 60000);
    const delivery = await dispatchSharedCode({ companyId: company.id, email: session.email, phoneFull, code: sharedCode, expiresAt, sourceId: `resend:${session.id}` });
    const resendAvailableAt = new Date(Date.now() + getResendCooldownSeconds() * 1000);
    await client_1.prisma.commerceGuestCheckoutSession.update({
        where: { id: session.id },
        data: {
            otp_hash: otpHash,
            otp_attempts: 0,
            otp_expires_at: expiresAt,
            resend_available_at: resendAvailableAt,
            email_delivery_succeeded: delivery.emailSent,
            phone_delivery_succeeded: delivery.phoneSent,
            phone_delivery_status: delivery.phoneStatus,
            phone_delivery_job_id: delivery.phoneJobId,
            delivery_attempted_at: new Date(),
        },
    });
    await (0, outbound_message_repository_1.syncWhatsappOtpSessionDelivery)(delivery.phoneJobId, {
        kind: 'COMMERCE_GUEST_CHECKOUT',
        sessionId: session.id,
    });
    return buildStartPayload({
        sessionId: session.id,
        accountOutcome: session.account_outcome,
        emailSent: delivery.emailSent,
        phoneSent: delivery.phoneSent,
        phoneQueued: delivery.phoneQueued,
        phoneStatus: delivery.phoneStatus,
        phoneJobId: delivery.phoneJobId,
        maskedEmail: delivery.maskedEmail,
        maskedPhone: delivery.maskedPhone,
        expiresAt,
    });
}
async function verifyCommerceGuestCheckout(slug, sessionId, code, reqHeaders) {
    const normalizedCode = code.trim();
    if (!normalizedCode)
        return { code: 400, error: true, message: 'El código es obligatorio.' };
    const storeResult = await getPublicStore(slug);
    if (storeResult.error)
        return storeResult.result;
    const { company, store } = storeResult;
    const sessionResult = await getSessionOrError(company.id, store.id, sessionId);
    if (sessionResult.error)
        return sessionResult.result;
    const session = sessionResult.session;
    if (session.otp_attempts >= session.otp_max_attempts) {
        return { code: 400, error: true, message: 'Superaste la cantidad máxima de intentos. Solicita un código nuevo.' };
    }
    if (session.otp_expires_at.getTime() <= Date.now()) {
        return { code: 400, error: true, message: 'El código venció. Solicita uno nuevo.' };
    }
    const isValid = await bcryptjs_1.default.compare(normalizedCode, session.otp_hash);
    if (!isValid) {
        await client_1.prisma.commerceGuestCheckoutSession.update({
            where: { id: session.id },
            data: { otp_attempts: { increment: 1 } },
        });
        return { code: 400, error: true, message: 'El código ingresado no es válido.' };
    }
    const provisioned = await (0, customer_account_service_1.ensureCustomerProfileWithAccount)({
        companyId: company.id,
        fullName: session.full_name,
        email: session.email,
        phone: session.phone_number,
        phonePrefix: session.phone_prefix,
        countryCode: session.country_code,
    });
    if (provisioned.error) {
        return { code: provisioned.code, error: true, message: provisioned.message };
    }
    const userUpdateData = {};
    if (session.email_delivery_succeeded)
        userUpdateData.emailVerified = true;
    if (session.phone_delivery_succeeded)
        userUpdateData.phoneNumberVerified = true;
    if (Object.keys(userUpdateData).length > 0) {
        await client_1.prisma.user.update({ where: { id: provisioned.userId }, data: userUpdateData });
    }
    const signInEmail = provisioned.userEmail ?? session.email;
    if (!signInEmail) {
        return { code: 500, error: true, message: 'No pudimos determinar el correo de la sesión verificada.' };
    }
    try {
        const signInResult = await signInCustomerWithEmail({
            userId: provisioned.userId,
            email: signInEmail,
            password: provisioned.inviteContext?.mode === 'TEMP_PASSWORD'
                ? provisioned.inviteContext.temporaryPassword
                : undefined,
            reqHeaders,
        });
        await client_1.prisma.commerceGuestCheckoutSession.update({
            where: { id: session.id },
            data: {
                resolved_user_id: provisioned.userId,
                consumed_at: new Date(),
            },
        });
        const user = await client_1.prisma.user.findUnique({
            where: { id: provisioned.userId },
            select: {
                id: true,
                email: true,
                name: true,
                first_name: true,
                last_name: true,
                phone_prefix: true,
                phoneNumber: true,
                emailVerified: true,
                phoneNumberVerified: true,
                image: true,
            },
        });
        return {
            code: 200,
            error: false,
            message: 'Checkout verificado correctamente.',
            cookies: signInResult.cookies,
            data: {
                authenticated: true,
                user: user ?? signInResult.user,
                storefrontLinked: true,
            },
        };
    }
    catch (error) {
        logger_1.logger.error({ slug, companyId: company.id, storeId: store.id, sessionId, error }, 'Failed to sign in commerce guest checkout user');
        return {
            code: 500,
            error: true,
            message: error instanceof Error ? error.message : 'No pudimos iniciar tu sesión después de verificar el código.',
        };
    }
}
