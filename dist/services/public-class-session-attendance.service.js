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
exports.getPublicSessionAttendanceState = getPublicSessionAttendanceState;
exports.startPublicSessionAttendanceGuestVerification = startPublicSessionAttendanceGuestVerification;
exports.resendPublicSessionAttendanceGuestVerification = resendPublicSessionAttendanceGuestVerification;
exports.verifyPublicSessionAttendanceGuestVerification = verifyPublicSessionAttendanceGuestVerification;
exports.submitPublicSessionAttendance = submitPublicSessionAttendance;
exports.rotateSessionAttendanceLinkIfMissing = rotateSessionAttendanceLinkIfMissing;
exports.hashAttendanceAccessCode = hashAttendanceAccessCode;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const logger_1 = require("../config/logger");
const auth_1 = require("../config/auth");
const verification_1 = require("../utils/verification");
const phoneNormalization_1 = require("../utils/phoneNormalization");
const sendEmail_1 = require("../utils/sendEmail");
const whatsappSender_1 = require("../utils/whatsappSender");
const outbound_message_repository_1 = require("./outbound-message.repository");
const customer_account_service_1 = require("./customer-account.service");
const group_ticket_service_1 = require("./group-ticket.service");
const UserRepo = __importStar(require("../repositories/user.repo"));
const hash_1 = require("../utils/hash");
const demo_session_service_1 = require("./demo-session.service");
const demo_request_context_1 = require("./demo-request-context");
const OTP_MAX_ATTEMPTS = 5;
const ACCESS_CODE_MAX_FAILURES = 5;
const ACCESS_CODE_WINDOW_MS = 15 * 60 * 1000;
const ACCESS_CODE_BLOCK_MS = 15 * 60 * 1000;
const SPONSORSHIP_REASON = 'PUBLIC_SESSION_ATTENDANCE_LINK';
function normalizeEmail(value) {
    const email = (value ?? '').trim().toLowerCase();
    return email || null;
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
function getResendCooldownSeconds() {
    const value = Number.isFinite(verification_1.OTP_RESEND_COOLDOWN_SECONDS) ? verification_1.OTP_RESEND_COOLDOWN_SECONDS : 60;
    return Math.max(1, Math.trunc(value));
}
function buildRetryAfterSeconds(date) {
    return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
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
function buildTokenFingerprint(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
function buildIpFingerprint(ip) {
    return crypto_1.default.createHash('sha256').update(ip.trim().toLowerCase() || 'unknown').digest('hex');
}
function resolveRequestIp(raw) {
    const value = raw?.split(',')[0]?.trim();
    return value || 'unknown';
}
function buildStartPayload(params) {
    return {
        code: 200,
        error: false,
        message: params.accountOutcome === 'ACCOUNT_CONFLICT_PHONE_EMAIL'
            ? 'Email and phone belong to different accounts'
            : 'Attendance verification started',
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
async function dispatchSharedCode(params) {
    const [emailResult, phoneResult] = await Promise.all([
        (0, sendEmail_1.sendEmailCode)(params.email, params.code, params.companyId).catch(() => -1),
        (0, whatsappSender_1.queueWhatsappCode)(params.phoneFull, params.code, {
            companyId: params.companyId,
            sourceType: 'PUBLIC_CLASS_ATTENDANCE_OTP',
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
async function classifyAccount(params) {
    const phoneCandidates = buildPhoneCandidates(params.phonePrefix, params.phoneNumber);
    const [emailUserRaw, phoneUserRaw] = await Promise.all([
        client_2.prisma.user.findUnique({
            where: { email: params.email },
            select: {
                id: true,
                email: true,
                name: true,
                first_name: true,
                last_name: true,
                phone_prefix: true,
                phoneNumber: true,
            },
        }),
        phoneCandidates.length > 0
            ? client_2.prisma.user.findFirst({
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
    return {
        outcome: 'ACCOUNT_ALREADY_EXISTS',
        emailUser,
        phoneUser,
        resolvedUserId: emailUser?.id ?? phoneUser?.id ?? null,
    };
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
        let message = 'Could not sign in attendance user';
        try {
            const payload = await signInResponse.json();
            if (typeof payload?.message === 'string' && payload.message.trim()) {
                message = payload.message;
            }
        }
        catch {
            // Keep the default message.
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
        throw new Error('Could not retrieve attendance session');
    }
    return { user: session.user, cookies };
}
async function getAttendanceContextByToken(token) {
    return client_2.prisma.groupClassSession.findFirst({
        where: {
            attendance_public_token: token,
            public_attendance_enabled: true,
            group_class: {
                deleted_at: null,
            },
        },
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    timezone: true,
                    currency: true,
                },
            },
            group_class: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    description: true,
                    status: true,
                    pricing_mode: true,
                    price_cents: true,
                    monthly_price_cents: true,
                    recurrence_start_date: true,
                    recurrence_end_date: true,
                    start_time: true,
                    location_text: true,
                    max_capacity_per_session: true,
                    cover_image_url: true,
                    thumbnail_url: true,
                },
            },
        },
    });
}
async function requireAttendanceContext(token) {
    const context = await getAttendanceContextByToken(token);
    if (!context) {
        return { ok: false, result: { code: 404, error: true, message: 'Attendance link not found' } };
    }
    if (context.cancelled_at) {
        return { ok: false, result: { code: 400, error: true, message: 'This session was cancelled' } };
    }
    return { ok: true, context };
}
async function recordAttempt(params) {
    if ((0, demo_request_context_1.isDemoRequest)() || await (0, demo_session_service_1.isDemoCompanyId)(params.companyId))
        return;
    await client_2.prisma.groupSessionPublicAttendanceAttempt.create({
        data: {
            company_id: params.companyId,
            group_class_session_id: params.sessionId,
            resolved_user_id: params.resolvedUserId ?? null,
            attempt_type: params.attemptType,
            token_fingerprint: buildTokenFingerprint(params.token),
            ip_fingerprint: buildIpFingerprint(params.ip),
            success: params.success,
            detail_code: params.detailCode ?? null,
        },
    });
}
async function getAccessCodeBlockState(params) {
    const since = new Date(Date.now() - ACCESS_CODE_WINDOW_MS);
    const attempts = await client_2.prisma.groupSessionPublicAttendanceAttempt.findMany({
        where: {
            company_id: params.companyId,
            group_class_session_id: params.sessionId,
            attempt_type: client_1.PublicAttendanceAttemptType.ACCESS_CODE_SUBMIT,
            success: false,
            token_fingerprint: buildTokenFingerprint(params.token),
            ip_fingerprint: buildIpFingerprint(params.ip),
            created_at: { gte: since },
        },
        orderBy: { created_at: 'desc' },
        take: ACCESS_CODE_MAX_FAILURES,
        select: {
            created_at: true,
        },
    });
    if (attempts.length < ACCESS_CODE_MAX_FAILURES) {
        return { blocked: false };
    }
    const oldestBlockingAttempt = attempts[attempts.length - 1];
    const unblockAt = new Date(oldestBlockingAttempt.created_at.getTime() + ACCESS_CODE_BLOCK_MS);
    if (unblockAt.getTime() <= Date.now()) {
        return { blocked: false };
    }
    return {
        blocked: true,
        retryAfterSeconds: buildRetryAfterSeconds(unblockAt),
    };
}
function buildProfileView(user) {
    if (!user) {
        return {
            full_name: null,
            email: null,
            country_code: null,
            phone_prefix: null,
            phone_number: null,
            profile_locked: false,
            missing_profile_fields: ['full_name', 'email', 'phone'],
        };
    }
    const fullName = user.name?.trim()
        || [user.first_name, user.last_name].map((value) => value?.trim() ?? '').filter(Boolean).join(' ')
        || null;
    const hasPhone = Boolean((user.phone_prefix ?? '').trim() && (user.phoneNumber ?? '').trim());
    const missingProfileFields = [];
    if (!fullName)
        missingProfileFields.push('full_name');
    if (!normalizeEmail(user.email))
        missingProfileFields.push('email');
    if (!hasPhone)
        missingProfileFields.push('phone');
    return {
        full_name: fullName,
        email: normalizeEmail(user.email),
        country_code: user.country_code ?? null,
        phone_prefix: user.phone_prefix ?? null,
        phone_number: user.phoneNumber ?? null,
        profile_locked: true,
        missing_profile_fields: missingProfileFields,
    };
}
async function maybeAlreadyCheckedIn(companyId, sessionId, userId) {
    if (!userId)
        return null;
    return client_2.prisma.groupSessionAttendance.findFirst({
        where: {
            company_id: companyId,
            group_class_session_id: sessionId,
            user_id: userId,
        },
        select: {
            id: true,
            checked_in_at: true,
            checked_in_method: true,
            enrollment_id: true,
            created_at: true,
        },
    });
}
async function getGuestSessionForAttendance(params) {
    return client_2.prisma.groupClassGuestEnrollmentSession.findFirst({
        where: {
            id: params.checkoutSessionId,
            company_id: params.companyId,
            group_class_id: params.classId,
            group_class_session_id: params.sessionId,
        },
    });
}
async function updateSignedInUserIfAllowed(user, input) {
    const updateData = {};
    if (input.full_name?.trim()) {
        const nextName = splitFullName(input.full_name);
        const existingName = user.name?.trim()
            || [user.first_name, user.last_name].map((value) => value?.trim() ?? '').filter(Boolean).join(' ');
        if (existingName && existingName !== nextName.fullName) {
            throw new Error('Signed-in users cannot switch identity');
        }
        if (!existingName) {
            updateData.name = nextName.fullName;
            updateData.first_name = nextName.firstName;
            updateData.last_name = nextName.lastName;
        }
    }
    if (input.email?.trim()) {
        const nextEmail = normalizeEmail(input.email);
        const existingEmail = normalizeEmail(user.email);
        if (existingEmail && existingEmail !== nextEmail) {
            throw new Error('Signed-in users cannot switch identity');
        }
        if (!existingEmail && nextEmail) {
            updateData.email = nextEmail;
        }
    }
    if (input.phonePrefix?.trim() || input.phoneNumber?.trim() || input.countryCode?.trim()) {
        const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
            phonePrefix: input.phonePrefix,
            phoneNumber: input.phoneNumber,
        });
        const existingPrefix = (user.phone_prefix ?? '').trim();
        const existingPhone = (user.phoneNumber ?? '').trim();
        const hasExistingPhone = Boolean(existingPrefix && existingPhone);
        if (hasExistingPhone) {
            const samePrefix = existingPrefix === canonicalPhone.phonePrefix;
            const samePhone = existingPhone === canonicalPhone.phoneNumber;
            if ((!samePrefix || !samePhone) && (canonicalPhone.phonePrefix || canonicalPhone.phoneNumber)) {
                throw new Error('Signed-in users cannot switch identity');
            }
        }
        else {
            if (!canonicalPhone.phonePrefix || !canonicalPhone.phoneNumber) {
                throw new Error('phonePrefix and phoneNumber are required together');
            }
            updateData.phone_prefix = canonicalPhone.phonePrefix;
            updateData.phoneNumber = canonicalPhone.phoneNumber;
            if (input.countryCode?.trim()) {
                updateData.country_code = input.countryCode.trim().toUpperCase();
            }
        }
    }
    if (Object.keys(updateData).length === 0) {
        return user;
    }
    const updated = await client_2.prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            name: true,
            country_code: true,
            phone_prefix: true,
            phoneNumber: true,
            emailVerified: true,
            phoneNumberVerified: true,
            image: true,
        },
    });
    return updated;
}
async function lockClassAndSession(tx, companyId, classId, sessionId) {
    await tx.$queryRaw `
        SELECT id
        FROM group_class
        WHERE id = ${classId} AND company_id = ${companyId}
        FOR UPDATE
    `;
    await tx.$queryRaw `
        SELECT id
        FROM group_class_session
        WHERE id = ${sessionId} AND company_id = ${companyId}
        FOR UPDATE
    `;
}
function resolveSponsoredWindow(params) {
    if (params.pricingMode === client_1.ClassPricingMode.PER_SESSION) {
        return {
            validFrom: params.sessionStartAt,
            validUntil: params.sessionEndAt,
        };
    }
    if (params.pricingMode === client_1.ClassPricingMode.WEEKLY_PASS) {
        return {
            validFrom: params.sessionStartAt,
            validUntil: new Date(params.sessionStartAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        };
    }
    if (params.pricingMode === client_1.ClassPricingMode.MONTHLY_PASS) {
        const validUntil = new Date(params.sessionStartAt);
        validUntil.setMonth(validUntil.getMonth() + 1);
        return {
            validFrom: params.sessionStartAt,
            validUntil,
        };
    }
    if (!params.recurrenceEndDate) {
        throw new Error('This class does not have an end date configured');
    }
    return {
        validFrom: params.recurrenceStartDate,
        validUntil: new Date(params.recurrenceEndDate),
    };
}
async function ensureAttendanceUpsert(params) {
    const existing = await params.tx.groupSessionAttendance.findFirst({
        where: {
            company_id: params.companyId,
            group_class_session_id: params.sessionId,
            user_id: params.userId,
        },
    });
    if (existing?.checked_in_at) {
        return { attendance: existing, alreadyCheckedIn: true };
    }
    if (existing) {
        const updated = await params.tx.groupSessionAttendance.update({
            where: { id: existing.id },
            data: {
                enrollment_id: params.enrollmentId,
                customer_profile_id: params.customerProfileId,
                checked_in_at: new Date(),
                checked_in_method: client_1.CheckInMethod.PUBLIC_LINK,
            },
        });
        return { attendance: updated, alreadyCheckedIn: false };
    }
    try {
        const created = await params.tx.groupSessionAttendance.create({
            data: {
                company_id: params.companyId,
                group_class_session_id: params.sessionId,
                user_id: params.userId,
                enrollment_id: params.enrollmentId,
                customer_profile_id: params.customerProfileId,
                checked_in_at: new Date(),
                checked_in_method: client_1.CheckInMethod.PUBLIC_LINK,
            },
        });
        return { attendance: created, alreadyCheckedIn: false };
    }
    catch (error) {
        if (error?.code === 'P2002') {
            const concurrent = await params.tx.groupSessionAttendance.findFirst({
                where: {
                    company_id: params.companyId,
                    group_class_session_id: params.sessionId,
                    user_id: params.userId,
                },
            });
            if (concurrent) {
                return { attendance: concurrent, alreadyCheckedIn: Boolean(concurrent.checked_in_at) };
            }
        }
        throw error;
    }
}
function mapEnrollmentForResponse(enrollment) {
    return {
        id: enrollment.id,
        group_class_id: enrollment.group_class_id,
        pricing_mode: enrollment.pricing_mode,
        price_cents_snapshot: enrollment.price_cents_snapshot,
        status: enrollment.status,
        payment_method: enrollment.payment_method,
        payment_status: enrollment.payment_status,
        valid_from: enrollment.valid_from,
        valid_until: enrollment.valid_until,
        is_admin_sponsored: enrollment.is_admin_sponsored,
        source: enrollment.source,
        sponsorship_reason: enrollment.sponsorship_reason,
    };
}
async function getPublicSessionAttendanceState(token, authUser, requestIp) {
    const contextResult = await requireAttendanceContext(token);
    if (!contextResult.ok)
        return contextResult.result;
    const context = contextResult.context;
    const alreadyCheckedIn = authUser?.id
        ? await maybeAlreadyCheckedIn(context.company_id, context.id, authUser.id)
        : null;
    if (requestIp) {
        void recordAttempt({
            companyId: context.company_id,
            sessionId: context.id,
            token,
            ip: resolveRequestIp(requestIp),
            attemptType: client_1.PublicAttendanceAttemptType.TOKEN_LOOKUP,
            success: true,
            resolvedUserId: authUser?.id ?? null,
            detailCode: authUser?.id ? 'AUTHENTICATED_LOOKUP' : 'GUEST_LOOKUP',
        }).catch((error) => {
            logger_1.logger.warn({ token, sessionId: context.id, error }, 'Failed to audit attendance token lookup');
        });
    }
    return {
        code: 200,
        error: false,
        message: 'Attendance link resolved',
        data: {
            token,
            company: context.company,
            group_class: context.group_class,
            session: {
                id: context.id,
                start_at: context.start_at,
                end_at: context.end_at,
                status: context.status,
                cancelled_at: context.cancelled_at,
                cancel_reason: context.cancel_reason,
                public_attendance_enabled: context.public_attendance_enabled,
                requires_access_code: context.attendance_access_code_enabled,
            },
            is_authenticated: Boolean(authUser?.id),
            already_checked_in: Boolean(alreadyCheckedIn?.checked_in_at),
            attendance: alreadyCheckedIn ?? null,
            profile: buildProfileView(authUser),
        },
    };
}
async function startPublicSessionAttendanceGuestVerification(token, input, requestIp) {
    const contextResult = await requireAttendanceContext(token);
    if (!contextResult.ok)
        return contextResult.result;
    const context = contextResult.context;
    const name = splitFullName(input.full_name ?? '');
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
        phonePrefix: input.phonePrefix,
        phoneNumber: input.phoneNumber,
    });
    const normalizedCountryCode = input.countryCode?.trim().toUpperCase() || null;
    const email = normalizeEmail(input.email ?? '');
    if (!name.fullName)
        return { code: 400, error: true, message: 'full_name is required' };
    if (!email || !isValidEmail(email))
        return { code: 400, error: true, message: 'Valid email is required' };
    if (!canonicalPhone.phonePrefix)
        return { code: 400, error: true, message: 'phonePrefix is required' };
    if (!canonicalPhone.phoneNumber)
        return { code: 400, error: true, message: 'phoneNumber is required' };
    const account = await classifyAccount({
        email,
        phonePrefix: canonicalPhone.phonePrefix,
        phoneNumber: canonicalPhone.phoneNumber,
    });
    if (requestIp) {
        await recordAttempt({
            companyId: context.company_id,
            sessionId: context.id,
            token,
            ip: resolveRequestIp(requestIp),
            attemptType: client_1.PublicAttendanceAttemptType.OTP_START,
            success: account.outcome !== 'ACCOUNT_CONFLICT_PHONE_EMAIL',
            resolvedUserId: account.resolvedUserId,
            detailCode: account.outcome,
        });
    }
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
    const delivery = await dispatchSharedCode({ companyId: context.company_id, email, phoneFull, code: sharedCode, expiresAt, sourceId: `start:${phoneFull}` });
    const resendAvailableAt = new Date(Date.now() + getResendCooldownSeconds() * 1000);
    const guestSession = await client_2.prisma.groupClassGuestEnrollmentSession.create({
        data: {
            company_id: context.company_id,
            group_class_id: context.group_class_id,
            group_class_session_id: context.id,
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
        kind: 'GROUP_CLASS_GUEST_ENROLLMENT',
        sessionId: guestSession.id,
    });
    return buildStartPayload({
        sessionId: guestSession.id,
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
async function resendPublicSessionAttendanceGuestVerification(token, checkoutSessionId, requestIp) {
    const contextResult = await requireAttendanceContext(token);
    if (!contextResult.ok)
        return contextResult.result;
    const context = contextResult.context;
    const guestSession = await getGuestSessionForAttendance({
        companyId: context.company_id,
        classId: context.group_class_id,
        sessionId: context.id,
        checkoutSessionId,
    });
    if (!guestSession) {
        return { code: 404, error: true, message: 'Attendance verification session not found' };
    }
    if (guestSession.consumed_at) {
        return { code: 400, error: true, message: 'Attendance verification session has already been used' };
    }
    if (guestSession.resend_available_at.getTime() > Date.now()) {
        const retryAfter = buildRetryAfterSeconds(guestSession.resend_available_at);
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
    const phoneFull = `${guestSession.phone_prefix}${guestSession.phone_number}`;
    const expiresAt = new Date(Date.now() + verification_1.OTP_TTL_MINUTES * 60000);
    const delivery = await dispatchSharedCode({ companyId: context.company_id, email: guestSession.email, phoneFull, code: sharedCode, expiresAt, sourceId: `resend:${guestSession.id}` });
    const resendAvailableAt = new Date(Date.now() + getResendCooldownSeconds() * 1000);
    await client_2.prisma.groupClassGuestEnrollmentSession.update({
        where: { id: guestSession.id },
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
        kind: 'GROUP_CLASS_GUEST_ENROLLMENT',
        sessionId: guestSession.id,
    });
    if (requestIp) {
        await recordAttempt({
            companyId: context.company_id,
            sessionId: context.id,
            token,
            ip: resolveRequestIp(requestIp),
            attemptType: client_1.PublicAttendanceAttemptType.OTP_RESEND,
            success: true,
            resolvedUserId: guestSession.resolved_user_id,
            detailCode: 'OTP_RESENT',
        });
    }
    return buildStartPayload({
        sessionId: guestSession.id,
        accountOutcome: guestSession.account_outcome,
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
async function verifyPublicSessionAttendanceGuestVerification(token, checkoutSessionId, code, reqHeaders, requestIp) {
    const normalizedCode = code.trim();
    if (!normalizedCode)
        return { code: 400, error: true, message: 'code is required' };
    const contextResult = await requireAttendanceContext(token);
    if (!contextResult.ok)
        return contextResult.result;
    const context = contextResult.context;
    const guestSession = await getGuestSessionForAttendance({
        companyId: context.company_id,
        classId: context.group_class_id,
        sessionId: context.id,
        checkoutSessionId,
    });
    if (!guestSession) {
        return { code: 404, error: true, message: 'Attendance verification session not found' };
    }
    if (guestSession.consumed_at) {
        return { code: 400, error: true, message: 'Attendance verification session has already been used' };
    }
    if (guestSession.otp_attempts >= guestSession.otp_max_attempts) {
        return { code: 400, error: true, message: 'Too many attempts. Request a new code.' };
    }
    if (guestSession.otp_expires_at.getTime() <= Date.now()) {
        return { code: 400, error: true, message: 'Verification code expired. Request a new one.' };
    }
    const isValid = await bcryptjs_1.default.compare(normalizedCode, guestSession.otp_hash);
    if (!isValid) {
        await client_2.prisma.groupClassGuestEnrollmentSession.update({
            where: { id: guestSession.id },
            data: { otp_attempts: { increment: 1 } },
        });
        if (requestIp) {
            await recordAttempt({
                companyId: context.company_id,
                sessionId: context.id,
                token,
                ip: resolveRequestIp(requestIp),
                attemptType: client_1.PublicAttendanceAttemptType.OTP_VERIFY,
                success: false,
                resolvedUserId: guestSession.resolved_user_id,
                detailCode: 'INVALID_OTP',
            });
        }
        return { code: 400, error: true, message: 'Invalid verification code' };
    }
    const provisioned = await (0, customer_account_service_1.ensureCustomerProfileWithAccount)({
        companyId: context.company_id,
        fullName: guestSession.full_name,
        email: guestSession.email,
        phone: guestSession.phone_number,
        phonePrefix: guestSession.phone_prefix,
        countryCode: guestSession.country_code,
    });
    if ('error' in provisioned && provisioned.error) {
        return { code: provisioned.code, error: true, message: provisioned.message };
    }
    const userUpdateData = {};
    if (guestSession.email_delivery_succeeded)
        userUpdateData.emailVerified = true;
    if (guestSession.phone_delivery_succeeded)
        userUpdateData.phoneNumberVerified = true;
    if (Object.keys(userUpdateData).length > 0) {
        await client_2.prisma.user.update({
            where: { id: provisioned.userId },
            data: userUpdateData,
        });
    }
    const signInEmail = provisioned.userEmail ?? guestSession.email;
    if (!signInEmail) {
        return { code: 500, error: true, message: 'Could not determine sign-in email for attendance verification' };
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
        await client_2.prisma.groupClassGuestEnrollmentSession.update({
            where: { id: guestSession.id },
            data: {
                resolved_user_id: provisioned.userId,
                consumed_at: new Date(),
            },
        });
        const user = await client_2.prisma.user.findUnique({
            where: { id: provisioned.userId },
            select: {
                id: true,
                email: true,
                name: true,
                first_name: true,
                last_name: true,
                country_code: true,
                phone_prefix: true,
                phoneNumber: true,
                emailVerified: true,
                phoneNumberVerified: true,
                image: true,
            },
        });
        if (requestIp) {
            await recordAttempt({
                companyId: context.company_id,
                sessionId: context.id,
                token,
                ip: resolveRequestIp(requestIp),
                attemptType: client_1.PublicAttendanceAttemptType.OTP_VERIFY,
                success: true,
                resolvedUserId: provisioned.userId,
                detailCode: 'OTP_VERIFIED',
            });
        }
        return {
            code: 200,
            error: false,
            message: 'Attendance verification completed',
            cookies: signInResult.cookies,
            data: {
                authenticated: true,
                storefrontLinked: true,
                user: user ?? signInResult.user,
            },
        };
    }
    catch (error) {
        logger_1.logger.error({ token, checkoutSessionId, error }, 'Failed to sign in attendance user');
        return {
            code: 500,
            error: true,
            message: error instanceof Error ? error.message : 'Failed to sign in attendance user',
        };
    }
}
async function resolveSubmitUser(params) {
    if (params.authUser?.id) {
        const updatedUser = await updateSignedInUserIfAllowed(params.authUser, params.input);
        return { user: updatedUser, source: 'AUTH' };
    }
    const checkoutSessionId = params.input.checkout_session_id?.trim();
    if (!checkoutSessionId) {
        throw new Error('Authentication is required before submitting attendance');
    }
    const guestSession = await getGuestSessionForAttendance({
        companyId: params.companyId,
        classId: params.classId,
        sessionId: params.sessionId,
        checkoutSessionId,
    });
    if (!guestSession || !guestSession.resolved_user_id || !guestSession.consumed_at) {
        throw new Error('Attendance verification is required before submitting');
    }
    const user = await client_2.prisma.user.findUnique({
        where: { id: guestSession.resolved_user_id },
        select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            name: true,
            country_code: true,
            phone_prefix: true,
            phoneNumber: true,
            emailVerified: true,
            phoneNumberVerified: true,
            image: true,
        },
    });
    if (!user) {
        throw new Error('Verified attendance user not found');
    }
    return { user: user, source: 'GUEST_SESSION' };
}
async function submitPublicSessionAttendance(token, input, authUser, requestIp) {
    const contextResult = await requireAttendanceContext(token);
    if (!contextResult.ok)
        return contextResult.result;
    const context = contextResult.context;
    const ip = resolveRequestIp(requestIp);
    const accessCodeBlockState = await getAccessCodeBlockState({
        companyId: context.company_id,
        sessionId: context.id,
        token,
        ip,
    });
    if (accessCodeBlockState.blocked) {
        return {
            code: 429,
            error: true,
            message: 'Too many invalid access code attempts. Try again later.',
            data: {
                retry_after_seconds: accessCodeBlockState.retryAfterSeconds ?? 60,
            },
        };
    }
    let resolvedUser;
    try {
        const resolved = await resolveSubmitUser({
            companyId: context.company_id,
            classId: context.group_class_id,
            sessionId: context.id,
            authUser,
            input,
        });
        resolvedUser = resolved.user;
    }
    catch (error) {
        return {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Could not resolve attendance user',
        };
    }
    if (context.attendance_access_code_enabled) {
        const providedAccessCode = input.access_code?.trim();
        if (!providedAccessCode) {
            return { code: 400, error: true, message: 'codigo de acceso is required' };
        }
        if (!context.attendance_access_code_hash) {
            return { code: 400, error: true, message: 'Access code is not configured for this session' };
        }
        const codeMatches = await (0, hash_1.verifyCode)(providedAccessCode, context.attendance_access_code_hash);
        await recordAttempt({
            companyId: context.company_id,
            sessionId: context.id,
            token,
            ip,
            attemptType: client_1.PublicAttendanceAttemptType.ACCESS_CODE_SUBMIT,
            success: codeMatches,
            resolvedUserId: resolvedUser.id,
            detailCode: codeMatches ? 'ACCESS_CODE_VALID' : 'ACCESS_CODE_INVALID',
        });
        if (!codeMatches) {
            const blockState = await getAccessCodeBlockState({
                companyId: context.company_id,
                sessionId: context.id,
                token,
                ip,
            });
            return {
                code: blockState.blocked ? 429 : 400,
                error: true,
                message: blockState.blocked
                    ? 'Too many invalid access code attempts. Try again later.'
                    : 'Invalid access code',
                data: blockState.blocked
                    ? { retry_after_seconds: blockState.retryAfterSeconds ?? 60 }
                    : undefined,
            };
        }
    }
    const attendanceResult = await client_2.prisma.$transaction(async (tx) => {
        await lockClassAndSession(tx, context.company_id, context.group_class_id, context.id);
        const sessionSnapshot = await tx.groupClassSession.findFirst({
            where: {
                id: context.id,
                company_id: context.company_id,
                attendance_public_token: token,
                public_attendance_enabled: true,
                cancelled_at: null,
            },
            include: {
                group_class: {
                    select: {
                        id: true,
                        pricing_mode: true,
                        price_cents: true,
                        monthly_price_cents: true,
                        recurrence_start_date: true,
                        recurrence_end_date: true,
                    },
                },
            },
        });
        if (!sessionSnapshot) {
            return { code: 404, error: true, message: 'Attendance link is no longer valid' };
        }
        const customerProfile = await tx.customerProfile.upsert({
            where: {
                company_id_user_id: {
                    company_id: context.company_id,
                    user_id: resolvedUser.id,
                },
            },
            update: {},
            create: {
                company_id: context.company_id,
                user_id: resolvedUser.id,
            },
        });
        const currentAttendance = await tx.groupSessionAttendance.findFirst({
            where: {
                company_id: context.company_id,
                group_class_session_id: context.id,
                user_id: resolvedUser.id,
            },
        });
        if (currentAttendance?.checked_in_at) {
            return {
                code: 200,
                error: false,
                message: 'Already checked in',
                data: {
                    outcome: 'already_checked_in',
                    attendance: currentAttendance,
                    enrollment: null,
                    ticket_queued: false,
                    sponsored_enrollment_created: false,
                },
            };
        }
        const confirmedEnrollment = await tx.groupClassEnrollment.findFirst({
            where: {
                company_id: context.company_id,
                group_class_id: context.group_class_id,
                user_id: resolvedUser.id,
                status: client_1.GroupBookingStatus.CONFIRMED,
                valid_from: { lte: sessionSnapshot.start_at },
                valid_until: { gte: sessionSnapshot.start_at },
            },
            orderBy: { created_at: 'desc' },
        });
        const { validFrom, validUntil } = resolveSponsoredWindow({
            pricingMode: sessionSnapshot.group_class.pricing_mode,
            sessionStartAt: sessionSnapshot.start_at,
            sessionEndAt: sessionSnapshot.end_at,
            recurrenceStartDate: sessionSnapshot.group_class.recurrence_start_date,
            recurrenceEndDate: sessionSnapshot.group_class.recurrence_end_date,
        });
        let enrollment = confirmedEnrollment;
        let sponsoredEnrollmentCreated = false;
        let outcome = 'checked_in_existing_enrollment';
        if (!enrollment) {
            const pendingEnrollment = await tx.groupClassEnrollment.findFirst({
                where: {
                    company_id: context.company_id,
                    group_class_id: context.group_class_id,
                    user_id: resolvedUser.id,
                    status: client_1.GroupBookingStatus.PENDING,
                    valid_until: { gte: new Date(Math.min(Date.now(), sessionSnapshot.start_at.getTime())) },
                },
                orderBy: { created_at: 'desc' },
            });
            if (pendingEnrollment) {
                enrollment = await tx.groupClassEnrollment.update({
                    where: { id: pendingEnrollment.id },
                    data: {
                        customer_profile_id: customerProfile.id,
                        pricing_mode: sessionSnapshot.group_class.pricing_mode,
                        price_cents_snapshot: sessionSnapshot.group_class.pricing_mode === client_1.ClassPricingMode.FULL_COURSE
                            ? (sessionSnapshot.group_class.monthly_price_cents ?? 0)
                            : sessionSnapshot.group_class.price_cents,
                        status: client_1.GroupBookingStatus.CONFIRMED,
                        payment_method: client_1.PaymentMethod.NONE,
                        payment_status: client_1.PaymentStatus.PAID,
                        qr_proof_image_url: null,
                        source: client_1.ClassEnrollmentSource.PUBLIC_ATTENDANCE_LINK,
                        is_admin_sponsored: true,
                        sponsorship_reason: SPONSORSHIP_REASON,
                        sponsored_by_group_class_session_id: context.id,
                        sponsored_by_admin_user_id: null,
                        valid_from: validFrom,
                        valid_until: validUntil,
                        cancelled_at: null,
                    },
                });
            }
            else {
                enrollment = await tx.groupClassEnrollment.create({
                    data: {
                        company_id: context.company_id,
                        group_class_id: context.group_class_id,
                        customer_profile_id: customerProfile.id,
                        user_id: resolvedUser.id,
                        pricing_mode: sessionSnapshot.group_class.pricing_mode,
                        price_cents_snapshot: sessionSnapshot.group_class.pricing_mode === client_1.ClassPricingMode.FULL_COURSE
                            ? (sessionSnapshot.group_class.monthly_price_cents ?? 0)
                            : sessionSnapshot.group_class.price_cents,
                        status: client_1.GroupBookingStatus.CONFIRMED,
                        payment_method: client_1.PaymentMethod.NONE,
                        payment_status: client_1.PaymentStatus.PAID,
                        qr_proof_image_url: null,
                        source: client_1.ClassEnrollmentSource.PUBLIC_ATTENDANCE_LINK,
                        is_admin_sponsored: true,
                        sponsorship_reason: SPONSORSHIP_REASON,
                        sponsored_by_group_class_session_id: context.id,
                        sponsored_by_admin_user_id: null,
                        valid_from: validFrom,
                        valid_until: validUntil,
                    },
                });
            }
            sponsoredEnrollmentCreated = true;
            outcome = 'sponsored_enrollment_created_and_checked_in';
        }
        const attendanceUpsert = await ensureAttendanceUpsert({
            tx,
            companyId: context.company_id,
            sessionId: context.id,
            userId: resolvedUser.id,
            customerProfileId: customerProfile.id,
            enrollmentId: enrollment.id,
        });
        if (attendanceUpsert.alreadyCheckedIn) {
            outcome = 'already_checked_in';
        }
        return {
            code: attendanceUpsert.alreadyCheckedIn ? 200 : 201,
            error: false,
            message: attendanceUpsert.alreadyCheckedIn ? 'Already checked in' : 'Attendance recorded',
            data: {
                outcome,
                attendance: attendanceUpsert.attendance,
                enrollment: mapEnrollmentForResponse(enrollment),
                ticket_queued: true,
                sponsored_enrollment_created: sponsoredEnrollmentCreated,
            },
        };
    });
    await recordAttempt({
        companyId: context.company_id,
        sessionId: context.id,
        token,
        ip,
        attemptType: client_1.PublicAttendanceAttemptType.SUBMIT,
        success: !attendanceResult.error,
        resolvedUserId: resolvedUser.id,
        detailCode: attendanceResult.error ? 'SUBMIT_FAILED' : 'SUBMIT_SUCCEEDED',
    });
    if (!attendanceResult.error && attendanceResult.data) {
        const enrollmentId = attendanceResult.data?.enrollment?.id;
        if (enrollmentId) {
            void (0, group_ticket_service_1.issueClassTicketForEnrollment)(context.company_id, enrollmentId).catch((error) => {
                logger_1.logger.error({ companyId: context.company_id, enrollmentId, error }, 'Failed to issue class ticket after public attendance submission');
            });
        }
    }
    return attendanceResult;
}
async function rotateSessionAttendanceLinkIfMissing(companyId, sessionId) {
    const session = await client_2.prisma.groupClassSession.findFirst({
        where: { id: sessionId, company_id: companyId },
        select: { id: true, attendance_public_token: true, attendance_public_token_created_at: true },
    });
    if (!session || session.attendance_public_token)
        return;
    await client_2.prisma.groupClassSession.update({
        where: { id: sessionId },
        data: {
            attendance_public_token: crypto_1.default.randomBytes(24).toString('hex'),
            attendance_public_token_created_at: session.attendance_public_token_created_at ?? new Date(),
        },
    });
}
async function hashAttendanceAccessCode(code) {
    return (0, hash_1.hashCode)(code);
}
