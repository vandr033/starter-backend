import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { GroupItemStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../config/logger';
import { getAuth } from '../config/auth';
import { OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES, generateNumericCode } from '../utils/verification';
import { canonicalizePhoneParts } from '../utils/phoneNormalization';
import { sendEmailCode } from '../utils/sendEmail';
import { sendWhatsappCode } from '../utils/whatsappSender';
import { ensureCustomerProfileWithAccount } from './customer-account.service';
import * as UserRepo from '../repositories/user.repo';
import { MensajeApi } from '../types/MensajeApi';

type ServiceResult = MensajeApi & {
    data?: unknown;
    cookies?: string[];
};

type GuestCheckoutAccountOutcome =
    | 'NEW_ACCOUNT_PENDING_CREATION'
    | 'ACCOUNT_FOUND_BY_EMAIL'
    | 'ACCOUNT_FOUND_BY_PHONE'
    | 'ACCOUNT_ALREADY_EXISTS'
    | 'ACCOUNT_CONFLICT_PHONE_EMAIL';

type AccountLookupUser = {
    id: string;
    email: string;
    name: string;
    first_name: string | null;
    last_name: string | null;
    phone_prefix: string | null;
    phoneNumber: string | null;
};

type GuestCheckoutStartInput = {
    full_name: string;
    email: string;
    phonePrefix: string;
    phoneNumber: string;
    tosAccepted: boolean;
};

type GuestCheckoutSessionRow = Awaited<ReturnType<typeof prisma.paidEventGuestCheckoutSession.findUnique>>;
type PaidEventLookup = {
    id: number;
    title: string;
    end_at: Date;
    company_id: number;
    is_free: boolean;
    status: GroupItemStatus;
};

const OTP_MAX_ATTEMPTS = 5;

function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
}

function splitFullName(fullName: string): { fullName: string; firstName: string | null; lastName: string | null } {
    const cleaned = fullName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
        return { fullName: '', firstName: null, lastName: null };
    }

    const parts = cleaned.split(' ');
    return {
        fullName: cleaned,
        firstName: parts[0] || null,
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
    };
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskEmail(email: string): string | null {
    if (!email.includes('@')) return null;
    const [local, domain] = email.split('@');
    if (!local || !domain) return null;
    if (local.length <= 2) return `${local[0] ?? '*'}*@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(phoneDigits: string): string | null {
    const digits = phoneDigits.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length <= 4) return `***${digits}`;
    return `***${digits.slice(-4)}`;
}

function buildPhoneCandidates(phonePrefix?: string | null, phoneNumber?: string | null): string[] {
    const canonical = canonicalizePhoneParts({ phonePrefix, phoneNumber });
    if (!canonical.phoneNumber) return [];

    const values = new Set<string>();
    values.add(canonical.phoneNumber);
    if (canonical.phonePrefix) {
        values.add(`${canonical.phonePrefix}${canonical.phoneNumber}`);
        values.add(`+${canonical.phonePrefix}${canonical.phoneNumber}`);
    }

    return Array.from(values);
}

function getResendCooldownSeconds(): number {
    const value = Number.isFinite(OTP_RESEND_COOLDOWN_SECONDS) ? OTP_RESEND_COOLDOWN_SECONDS : 60;
    return Math.max(1, Math.trunc(value));
}

function buildRetryAfterSeconds(date: Date): number {
    return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

async function getPaidEvent(
    companyId: number,
    eventId: number,
): Promise<
    | { error: false; event: PaidEventLookup }
    | { error: true; result: ServiceResult }
> {
    const event = await prisma.groupEvent.findFirst({
        where: {
            id: eventId,
            company_id: companyId,
            status: GroupItemStatus.PUBLISHED,
            deleted_at: null,
            is_free: false,
        },
        select: {
            id: true,
            title: true,
            end_at: true,
            company_id: true,
            is_free: true,
            status: true,
        },
    });

    if (!event) {
        return { error: true, result: { code: 404, error: true, message: 'Paid event not found' } as ServiceResult };
    }

    if (new Date() > event.end_at) {
        return { error: true, result: { code: 400, error: true, message: 'This event has already ended' } as ServiceResult };
    }

    return { error: false, event };
}

async function classifyAccount(params: {
    email: string;
    phonePrefix: string;
    phoneNumber: string;
}): Promise<{
    outcome: GuestCheckoutAccountOutcome;
    emailUser: AccountLookupUser | null;
    phoneUser: AccountLookupUser | null;
    resolvedUserId: string | null;
}> {
    const phoneCandidates = buildPhoneCandidates(params.phonePrefix, params.phoneNumber);

    const [emailUserRaw, phoneUserRaw] = await Promise.all([
        prisma.user.findUnique({
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
            ? prisma.user.findFirst({
                where: {
                    phoneNumber: {
                        in: phoneCandidates,
                    },
                },
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

    const emailUser = emailUserRaw as AccountLookupUser | null;
    const phoneUser = phoneUserRaw as AccountLookupUser | null;

    if (emailUser && phoneUser && emailUser.id !== phoneUser.id) {
        return {
            outcome: 'ACCOUNT_CONFLICT_PHONE_EMAIL',
            emailUser,
            phoneUser,
            resolvedUserId: null,
        };
    }

    if (!emailUser && !phoneUser) {
        return {
            outcome: 'NEW_ACCOUNT_PENDING_CREATION',
            emailUser: null,
            phoneUser: null,
            resolvedUserId: null,
        };
    }

    if (emailUser && !phoneUser) {
        return {
            outcome: 'ACCOUNT_FOUND_BY_EMAIL',
            emailUser,
            phoneUser: null,
            resolvedUserId: emailUser.id,
        };
    }

    if (!emailUser && phoneUser) {
        return {
            outcome: 'ACCOUNT_FOUND_BY_PHONE',
            emailUser: null,
            phoneUser,
            resolvedUserId: phoneUser.id,
        };
    }

    return {
        outcome: 'ACCOUNT_ALREADY_EXISTS',
        emailUser,
        phoneUser,
        resolvedUserId: emailUser?.id ?? phoneUser?.id ?? null,
    };
}

async function dispatchSharedCode(params: {
    email: string;
    phoneFull: string;
    code: string;
}): Promise<{
    emailSent: boolean;
    phoneSent: boolean;
    maskedEmail: string | null;
    maskedPhone: string | null;
}> {
    const [emailResult, phoneResult] = await Promise.all([
        sendEmailCode(params.email, params.code).catch(() => -1),
        sendWhatsappCode(params.phoneFull, params.code).catch(() => -1),
    ]);

    return {
        emailSent: emailResult !== -1,
        phoneSent: phoneResult !== -1,
        maskedEmail: maskEmail(params.email),
        maskedPhone: maskPhone(params.phoneFull),
    };
}

function buildGuestCheckoutStartPayload(params: {
    sessionId: string | null;
    accountOutcome: GuestCheckoutAccountOutcome;
    emailSent: boolean;
    phoneSent: boolean;
    maskedEmail: string | null;
    maskedPhone: string | null;
    expiresAt: Date | null;
}): ServiceResult {
    const resendCooldownSeconds = getResendCooldownSeconds();
    return {
        code: 200,
        error: false,
        message: params.accountOutcome === 'ACCOUNT_CONFLICT_PHONE_EMAIL'
            ? 'Email and phone belong to different accounts'
            : 'Guest checkout started',
        data: {
            checkout_session_id: params.sessionId,
            accountOutcome: params.accountOutcome,
            otpDelivery: {
                emailSent: params.emailSent,
                phoneSent: params.phoneSent,
                maskedEmail: params.maskedEmail,
                maskedPhone: params.maskedPhone,
            },
            expiresAt: params.expiresAt?.toISOString() ?? null,
            resendCooldownSeconds,
            canVerify: params.emailSent || params.phoneSent,
        },
    };
}

async function getCheckoutSessionOrError(
    companyId: number,
    eventId: number,
    sessionId: string,
): Promise<
    | { error: false; session: NonNullable<GuestCheckoutSessionRow> }
    | { error: true; result: ServiceResult }
> {
    const session = await prisma.paidEventGuestCheckoutSession.findFirst({
        where: {
            id: sessionId,
            company_id: companyId,
            group_event_id: eventId,
        },
    });

    if (!session) {
        return { error: true, result: { code: 404, error: true, message: 'Guest checkout session not found' } as ServiceResult };
    }

    if (session.consumed_at) {
        return { error: true, result: { code: 400, error: true, message: 'Guest checkout session has already been used' } as ServiceResult };
    }

    return { error: false, session };
}

async function signInCustomerWithEmail(params: {
    userId: string;
    email: string;
    password?: string;
    reqHeaders: HeadersInit | undefined;
}): Promise<{ user: Record<string, unknown>; cookies: string[] }> {
    const auth = await getAuth();
    const password = params.password ?? crypto.randomBytes(32).toString('hex');

    if (!params.password) {
        await UserRepo.updateUserPassword(params.userId, await bcrypt.hash(password, 10));
    }

    const signInResponse = await auth.api.signInEmail({
        body: {
            email: params.email,
            password,
        },
        headers: params.reqHeaders,
        asResponse: true,
    });

    if (!signInResponse.ok) {
        let message = 'Could not sign in guest checkout user';
        try {
            const payload = await signInResponse.json();
            if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
                message = payload.message;
            }
        } catch {
            // Keep default message.
        }
        throw new Error(message);
    }

    const cookies = signInResponse.headers.getSetCookie?.() || [];
    if (cookies.length === 0) {
        const singleCookie = signInResponse.headers.get('set-cookie');
        if (singleCookie) cookies.push(singleCookie);
    }

    const sessionHeaders = new Headers(params.reqHeaders);
    if (cookies.length > 0) {
        sessionHeaders.set('cookie', cookies.join('; '));
    }

    const session = await auth.api.getSession({
        headers: sessionHeaders,
    });

    if (!session?.user) {
        throw new Error('Could not retrieve guest checkout session');
    }

    return {
        user: session.user as Record<string, unknown>,
        cookies,
    };
}

export async function startPaidEventGuestCheckout(
    companyId: number,
    eventId: number,
    input: GuestCheckoutStartInput,
): Promise<ServiceResult> {
    const name = splitFullName(input.full_name ?? '');
    const canonicalPhone = canonicalizePhoneParts({
        phonePrefix: input.phonePrefix,
        phoneNumber: input.phoneNumber,
    });
    const email = normalizeEmail(input.email ?? '');

    if (!name.fullName) {
        return { code: 400, error: true, message: 'full_name is required' };
    }
    if (!email || !isValidEmail(email)) {
        return { code: 400, error: true, message: 'Valid email is required' };
    }
    if (!canonicalPhone.phonePrefix) {
        return { code: 400, error: true, message: 'phonePrefix is required' };
    }
    if (!canonicalPhone.phoneNumber) {
        return { code: 400, error: true, message: 'phoneNumber is required' };
    }
    if (!input.tosAccepted) {
        return { code: 400, error: true, message: 'TOS must be accepted' };
    }

    const eventResult = await getPaidEvent(companyId, eventId);
    if (eventResult.error) return eventResult.result;

    const account = await classifyAccount({
        email,
        phonePrefix: canonicalPhone.phonePrefix,
        phoneNumber: canonicalPhone.phoneNumber,
    });

    if (account.outcome === 'ACCOUNT_CONFLICT_PHONE_EMAIL') {
        return buildGuestCheckoutStartPayload({
            sessionId: null,
            accountOutcome: account.outcome,
            emailSent: false,
            phoneSent: false,
            maskedEmail: maskEmail(email),
            maskedPhone: maskPhone(canonicalPhone.fullPhone ?? canonicalPhone.phoneNumber),
            expiresAt: null,
        });
    }

    const sharedCode = generateNumericCode();
    const otpHash = await bcrypt.hash(sharedCode, 10);
    const phoneFull = canonicalPhone.fullPhone ?? `${canonicalPhone.phonePrefix}${canonicalPhone.phoneNumber}`;
    const delivery = await dispatchSharedCode({
        email,
        phoneFull,
        code: sharedCode,
    });

    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
    const resendAvailableAt = new Date(Date.now() + getResendCooldownSeconds() * 1000);

    const session = await prisma.paidEventGuestCheckoutSession.create({
        data: {
            company_id: companyId,
            group_event_id: eventId,
            resolved_user_id: account.resolvedUserId,
            full_name: name.fullName,
            first_name: name.firstName,
            last_name: name.lastName,
            email,
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
            delivery_attempted_at: new Date(),
        },
    });

    return buildGuestCheckoutStartPayload({
        sessionId: session.id,
        accountOutcome: account.outcome,
        emailSent: delivery.emailSent,
        phoneSent: delivery.phoneSent,
        maskedEmail: delivery.maskedEmail,
        maskedPhone: delivery.maskedPhone,
        expiresAt,
    });
}

export async function resendPaidEventGuestCheckoutCode(
    companyId: number,
    eventId: number,
    sessionId: string,
): Promise<ServiceResult> {
    const eventResult = await getPaidEvent(companyId, eventId);
    if (eventResult.error) return eventResult.result;

    const sessionResult = await getCheckoutSessionOrError(companyId, eventId, sessionId);
    if (sessionResult.error) return sessionResult.result;

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

    const sharedCode = generateNumericCode();
    const otpHash = await bcrypt.hash(sharedCode, 10);
    const phoneFull = `${session.phone_prefix}${session.phone_number}`;
    const delivery = await dispatchSharedCode({
        email: session.email,
        phoneFull,
        code: sharedCode,
    });
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
    const resendAvailableAt = new Date(Date.now() + getResendCooldownSeconds() * 1000);

    await prisma.paidEventGuestCheckoutSession.update({
        where: { id: session.id },
        data: {
            otp_hash: otpHash,
            otp_attempts: 0,
            otp_expires_at: expiresAt,
            resend_available_at: resendAvailableAt,
            email_delivery_succeeded: delivery.emailSent,
            phone_delivery_succeeded: delivery.phoneSent,
            delivery_attempted_at: new Date(),
        },
    });

    return buildGuestCheckoutStartPayload({
        sessionId: session.id,
        accountOutcome: session.account_outcome as GuestCheckoutAccountOutcome,
        emailSent: delivery.emailSent,
        phoneSent: delivery.phoneSent,
        maskedEmail: delivery.maskedEmail,
        maskedPhone: delivery.maskedPhone,
        expiresAt,
    });
}

export async function verifyPaidEventGuestCheckout(
    companyId: number,
    eventId: number,
    sessionId: string,
    code: string,
    reqHeaders: HeadersInit | undefined,
): Promise<ServiceResult> {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
        return { code: 400, error: true, message: 'code is required' };
    }

    const eventResult = await getPaidEvent(companyId, eventId);
    if (eventResult.error) return eventResult.result;

    const sessionResult = await getCheckoutSessionOrError(companyId, eventId, sessionId);
    if (sessionResult.error) return sessionResult.result;

    const session = sessionResult.session;

    if (session.otp_attempts >= session.otp_max_attempts) {
        return { code: 400, error: true, message: 'Too many attempts. Request a new code.' };
    }

    if (session.otp_expires_at.getTime() <= Date.now()) {
        return { code: 400, error: true, message: 'Verification code expired. Request a new one.' };
    }

    const isValid = await bcrypt.compare(normalizedCode, session.otp_hash);

    if (!isValid) {
        await prisma.paidEventGuestCheckoutSession.update({
            where: { id: session.id },
            data: {
                otp_attempts: {
                    increment: 1,
                },
            },
        });

        return { code: 400, error: true, message: 'Invalid verification code' };
    }

    const provisioned = await ensureCustomerProfileWithAccount({
        companyId,
        fullName: session.full_name,
        email: session.email,
        phone: session.phone_number,
        phonePrefix: session.phone_prefix,
    });

    if (provisioned.error) {
        return {
            code: provisioned.code,
            error: true,
            message: provisioned.message,
        };
    }

    const userUpdateData: Record<string, unknown> = {};
    if (session.email_delivery_succeeded) {
        userUpdateData.emailVerified = true;
    }
    if (session.phone_delivery_succeeded) {
        userUpdateData.phoneNumberVerified = true;
    }
    if (Object.keys(userUpdateData).length > 0) {
        await prisma.user.update({
            where: { id: provisioned.userId },
            data: userUpdateData,
        });
    }

    const signInEmail = provisioned.userEmail ?? session.email;
    if (!signInEmail) {
        return { code: 500, error: true, message: 'Could not determine sign-in email for guest checkout' };
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

        await prisma.paidEventGuestCheckoutSession.update({
            where: { id: session.id },
            data: {
                resolved_user_id: provisioned.userId,
                consumed_at: new Date(),
            },
        });

        const user = await prisma.user.findUnique({
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
            message: 'Guest checkout verified successfully',
            cookies: signInResult.cookies,
            data: {
                authenticated: true,
                user: user ?? signInResult.user,
                storefrontLinked: true,
            },
        };
    } catch (error) {
        logger.error({ companyId, eventId, sessionId, error }, 'Failed to sign in guest checkout user');
        return {
            code: 500,
            error: true,
            message: error instanceof Error ? error.message : 'Failed to sign in guest checkout user',
        };
    }
}
