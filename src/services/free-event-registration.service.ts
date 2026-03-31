import { prisma } from '../prisma/client';
import {
    Gender,
    FreeEventRegistrationStatus,
    GroupItemStatus,
    AccountVerificationStatus,
    CheckInMethod,
    Prisma,
} from '@prisma/client';
import { logger } from '../config/logger';
import { sendGenericEmail, isTemporaryEmailAddress } from '../utils/sendEmail';
import { sendWhatsappText } from '../utils/whatsappSender';
import { sendLoginOtpEmail, sendLoginOtpPhone } from './auth.service';
import { getAuth } from '../config/auth';
import crypto from 'crypto';
import { generateUniqueSixDigitCode } from './group-ticket.service';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface FreeEventRegistrationInput {
    firstName: string;
    lastName: string;
    gender: string;
    age: number;
    email: string;
    phonePrefix: string;
    phoneNumber: string;
    tosAccepted: boolean;
    createAccount?: boolean;
}

export interface FreeRegistrationResult {
    code: number;
    error: boolean;
    message: string;
    data?: {
        success: true;
        eventOutcome: 'REGISTERED' | 'INTERESTED' | 'ALREADY_REGISTERED';
        registrationStatus?: 'CONFIRMED' | 'PENDING' | 'INTERESTED';
        modalType: 'POSITIVE' | 'NEGATIVE';
        accountOutcome:
            | 'NOT_REQUESTED'
            | 'ACCOUNT_CREATED_PENDING_VERIFICATION'
            | 'ACCOUNT_FOUND_BY_EMAIL'
            | 'ACCOUNT_FOUND_BY_PHONE'
            | 'ACCOUNT_ALREADY_EXISTS'
            | 'ACCOUNT_CONFLICT_PHONE_EMAIL';
        createdUserId?: string | null;
        otpSection?: {
            show: boolean;
            mode: 'SIGN_UP_VERIFY' | 'SIGN_IN_OTP' | null;
            primaryChannel: 'email' | 'phone' | null;
            availableChannels?: Array<'email' | 'phone'>;
            maskedDestination?: string | null;
        };
        nextActions?: {
            canCompleteMissingPhoneLater?: boolean;
            canCompleteMissingEmailLater?: boolean;
            canManualSignIn?: boolean;
        };
        reservationCode?: string | null;
        messageKey: string;
        registrationId: number;
        soldOut: boolean;
        createAccountRequested: boolean;
    };
}

export interface FreeRegistrationStateResult {
    code: number;
    error: boolean;
    message: string;
    data?: {
        hasRegistration: boolean;
        status: FreeEventRegistrationStatus | null;
        prefill: {
            firstName: string;
            lastName: string;
            gender: string;
            age: number | null;
            email: string;
            phonePrefix: string;
            phoneNumber: string;
        } | null;
    };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const VALID_GENDERS = new Set<string>(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']);
const TEMP_EMAIL_DOMAIN = '@tmppriconpri.com';
const DEFAULT_LANGUAGE_KEY = 'default_language';
const MAX_FREE_RESERVATION_CODE_INSERT_ATTEMPTS = 10;

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function normalizePhoneDigits(value?: string | null): string {
    return (value ?? '').replace(/\D/g, '');
}

function normalizePhonePrefix(prefix?: string | null): string {
    return normalizePhoneDigits(prefix);
}

function normalizePhoneNumber(number?: string | null): string {
    return normalizePhoneDigits(number);
}

function buildE164Phone(prefix?: string | null, number?: string | null): string | null {
    const prefixDigits = normalizePhonePrefix(prefix);
    const numberDigits = normalizePhoneNumber(number);
    if (!numberDigits) return null;
    if (!prefixDigits) return `+${numberDigits}`;
    if (numberDigits.startsWith(prefixDigits)) {
        return `+${numberDigits}`;
    }
    return `+${prefixDigits}${numberDigits}`;
}

function buildPhoneMatchVariants(phone?: string | null, prefix?: string | null): Array<{ number: string; prefix?: string }> {
    const phoneDigits = normalizePhoneDigits(phone);
    if (!phoneDigits) return [];

    const prefixDigits = normalizePhoneDigits(prefix);
    const variants = new Map<string, { number: string; prefix?: string }>();

    const addVariant = (numberValue: string, prefixValue?: string) => {
        const cleanNumber = normalizePhoneDigits(numberValue);
        if (!cleanNumber) return;
        const cleanPrefix = normalizePhoneDigits(prefixValue ?? '');
        const key = `${cleanPrefix}:${cleanNumber}`;
        if (!variants.has(key)) {
            variants.set(key, cleanPrefix ? { number: cleanNumber, prefix: cleanPrefix } : { number: cleanNumber });
        }
    };

    addVariant(phoneDigits, prefixDigits || undefined);
    addVariant(phoneDigits);

    if (prefixDigits && phoneDigits.startsWith(prefixDigits) && phoneDigits.length > prefixDigits.length) {
        const local = phoneDigits.slice(prefixDigits.length);
        addVariant(local, prefixDigits);
        addVariant(local);
    }

    if (!prefixDigits && phoneDigits.length === 11 && phoneDigits.startsWith('1')) {
        addVariant(phoneDigits.slice(1), '1');
        addVariant(phoneDigits.slice(1));
    }

    return Array.from(variants.values());
}

function buildUserPhoneCandidates(phone?: string | null, prefix?: string | null): string[] {
    const phoneDigits = normalizePhoneDigits(phone);
    if (!phoneDigits) return [];

    const prefixDigits = normalizePhoneDigits(prefix);
    const variants = new Set<string>();
    const add = (value?: string | null) => {
        const normalized = (value ?? '').trim();
        if (!normalized) return;
        variants.add(normalized);
    };

    add(phone?.trim());
    add(phoneDigits);

    if (prefixDigits) {
        add(`${prefixDigits}${phoneDigits}`);
        add(`+${prefixDigits}${phoneDigits}`);
        if (phoneDigits.startsWith(prefixDigits) && phoneDigits.length > prefixDigits.length) {
            const local = phoneDigits.slice(prefixDigits.length);
            add(local);
            add(`+${prefixDigits}${local}`);
        }
    }

    if (!prefixDigits && phoneDigits.length === 11 && phoneDigits.startsWith('1')) {
        add(`+${phoneDigits}`);
        add(phoneDigits.slice(1));
    }

    return Array.from(variants);
}

function maskEmail(email?: string | null): string | null {
    const value = (email ?? '').trim();
    if (!value || !value.includes('@')) return null;
    const [local, domain] = value.split('@');
    if (!local || !domain) return null;
    if (local.length <= 2) return `${local[0] ?? '*'}*@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone?: string | null): string | null {
    const digits = normalizePhoneDigits(phone);
    if (!digits) return null;
    if (digits.length <= 4) return `***${digits}`;
    return `***${digits.slice(-4)}`;
}

type AccountOutcome =
    | 'NOT_REQUESTED'
    | 'ACCOUNT_CREATED_PENDING_VERIFICATION'
    | 'ACCOUNT_FOUND_BY_EMAIL'
    | 'ACCOUNT_FOUND_BY_PHONE'
    | 'ACCOUNT_ALREADY_EXISTS'
    | 'ACCOUNT_CONFLICT_PHONE_EMAIL';

type OtpChannel = 'email' | 'phone';
type OtpMode = 'SIGN_UP_VERIFY' | 'SIGN_IN_OTP';

interface AccountResolutionResult {
    accountOutcome: AccountOutcome;
    createdUserId: string | null;
    resolvedUserId: string | null;
    otpSection: {
        show: boolean;
        mode: OtpMode | null;
        primaryChannel: OtpChannel | null;
        availableChannels?: Array<OtpChannel>;
        maskedDestination?: string | null;
    };
    nextActions: {
        canCompleteMissingPhoneLater?: boolean;
        canCompleteMissingEmailLater?: boolean;
        canManualSignIn?: boolean;
    };
    accountCreated: boolean;
    accountVerificationStatus: AccountVerificationStatus;
}

export type AccountMatchCase = 'NONE' | 'EMAIL_ONLY' | 'PHONE_ONLY' | 'SAME_USER' | 'CONFLICT';

export function classifyFreeEventAccountCase(emailUserId?: string | null, phoneUserId?: string | null): AccountMatchCase {
    const emailId = emailUserId ?? null;
    const phoneId = phoneUserId ?? null;
    if (!emailId && !phoneId) return 'NONE';
    if (emailId && !phoneId) return 'EMAIL_ONLY';
    if (!emailId && phoneId) return 'PHONE_ONLY';
    if (emailId && phoneId && emailId === phoneId) return 'SAME_USER';
    return 'CONFLICT';
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toGender(raw: string): Gender | null {
    const upper = raw?.trim().toUpperCase();
    return VALID_GENDERS.has(upper) ? (upper as Gender) : null;
}

/**
 * Count capacity already used for a free event.
 * Accounts for both legacy GroupEventBooking records and new FreeEventRegistration records.
 */
async function countUsedCapacity(groupEventId: number): Promise<number> {
    const [bookingResult, freeRegResult] = await Promise.all([
        prisma.groupEventBooking.aggregate({
            where: {
                group_event_id: groupEventId,
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
            _sum: { booked_spots: true },
        }),
        prisma.freeEventRegistration.count({
            where: {
                group_event_id: groupEventId,
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
        }),
    ]);

    return (bookingResult._sum.booked_spots ?? 0) + freeRegResult;
}

type AccountCandidateUser = {
    id: string;
    email: string;
    phoneNumber: string | null;
    phone_prefix: string | null;
    first_name: string | null;
    last_name: string | null;
};

async function dispatchEmailOtp(email: string): Promise<boolean> {
    const result = await sendLoginOtpEmail(email);
    return !result.error && result.code < 400;
}

async function dispatchPhoneOtp(phoneNumber: string): Promise<boolean> {
    const result = await sendLoginOtpPhone(phoneNumber);
    return !result.error && result.code < 400;
}

async function createAccountForFreeRegistration(input: {
    email: string;
    firstName: string;
    lastName: string;
    gender: string;
    age: number;
    phonePrefix: string;
    phoneNumber: string;
}): Promise<string> {
    const auth = await getAuth();
    const displayName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || input.email;
    const randomPassword = crypto.randomBytes(24).toString('hex');

    const signUpResult = await auth.api.signUpEmail({
        body: {
            email: input.email,
            password: randomPassword,
            name: displayName,
        },
        headers: {},
    });

    const createdUserId = signUpResult?.user?.id as string | undefined;
    if (!createdUserId) {
        throw new Error('Could not create account user');
    }

    const canonicalPhone = buildE164Phone(input.phonePrefix, input.phoneNumber);
    await prisma.user.update({
        where: { id: createdUserId },
        data: {
            first_name: input.firstName,
            last_name: input.lastName,
            gender: input.gender,
            age: input.age,
            phone_prefix: normalizePhonePrefix(input.phonePrefix) || null,
            phoneNumber: canonicalPhone ?? undefined,
            phoneNumberVerified: false,
        },
    });

    return createdUserId;
}

async function resolveAccountForFreeRegistration(input: {
    createAccount: boolean;
    userId?: string;
    email: string;
    phonePrefix: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
    gender: string;
    age: number;
}): Promise<AccountResolutionResult> {
    if (!input.createAccount) {
        return {
            accountOutcome: 'NOT_REQUESTED',
            createdUserId: null,
            resolvedUserId: input.userId ?? null,
            otpSection: { show: false, mode: null, primaryChannel: null, maskedDestination: null },
            nextActions: {},
            accountCreated: false,
            accountVerificationStatus: AccountVerificationStatus.NOT_REQUESTED,
        };
    }

    if (input.userId) {
        return {
            accountOutcome: 'ACCOUNT_ALREADY_EXISTS',
            createdUserId: null,
            resolvedUserId: input.userId,
            otpSection: { show: false, mode: null, primaryChannel: null, maskedDestination: null },
            nextActions: {},
            accountCreated: false,
            accountVerificationStatus: AccountVerificationStatus.VERIFIED,
        };
    }

    const phoneCandidates = buildUserPhoneCandidates(input.phoneNumber, input.phonePrefix);
    const [emailUser, phoneUser] = await Promise.all([
        prisma.user.findUnique({
            where: { email: input.email },
            select: {
                id: true,
                email: true,
                phoneNumber: true,
                phone_prefix: true,
                first_name: true,
                last_name: true,
            },
        }),
        phoneCandidates.length
            ? prisma.user.findFirst({
                where: { phoneNumber: { in: phoneCandidates } },
                select: {
                    id: true,
                    email: true,
                    phoneNumber: true,
                    phone_prefix: true,
                    first_name: true,
                    last_name: true,
                },
            })
            : Promise.resolve(null),
    ]);

    const emailMatch = emailUser as AccountCandidateUser | null;
    const phoneMatch = phoneUser as AccountCandidateUser | null;
    const accountMatchCase = classifyFreeEventAccountCase(emailMatch?.id, phoneMatch?.id);

    // CASE 5: email and phone belong to different users.
    if (accountMatchCase === 'CONFLICT') {
        return {
            accountOutcome: 'ACCOUNT_CONFLICT_PHONE_EMAIL',
            createdUserId: null,
            resolvedUserId: null,
            otpSection: { show: false, mode: null, primaryChannel: null, maskedDestination: null },
            nextActions: { canManualSignIn: true },
            accountCreated: false,
            accountVerificationStatus: AccountVerificationStatus.NOT_REQUESTED,
        };
    }

    // CASE 1: no email and no phone account.
    if (accountMatchCase === 'NONE') {
        try {
            const createdUserId = await createAccountForFreeRegistration({
                email: input.email,
                firstName: input.firstName,
                lastName: input.lastName,
                gender: input.gender,
                age: input.age,
                phonePrefix: input.phonePrefix,
                phoneNumber: input.phoneNumber,
            });

            const otpSent = await dispatchEmailOtp(input.email);
            if (!otpSent) {
                logger.warn({ email: input.email }, 'Free event: account created but email OTP dispatch failed');
            }

            return {
                accountOutcome: 'ACCOUNT_CREATED_PENDING_VERIFICATION',
                createdUserId,
                resolvedUserId: createdUserId,
                otpSection: {
                    show: true,
                    mode: 'SIGN_UP_VERIFY',
                    primaryChannel: 'email',
                    availableChannels: ['email'],
                    maskedDestination: maskEmail(input.email),
                },
                nextActions: {},
                accountCreated: true,
                accountVerificationStatus: AccountVerificationStatus.PENDING_VERIFICATION,
            };
        } catch (err) {
            logger.error({ err, email: input.email }, 'Free event: account creation failed');
            return {
                accountOutcome: 'NOT_REQUESTED',
                createdUserId: null,
                resolvedUserId: null,
                otpSection: { show: false, mode: null, primaryChannel: null, maskedDestination: null },
                nextActions: { canManualSignIn: true },
                accountCreated: false,
                accountVerificationStatus: AccountVerificationStatus.NOT_REQUESTED,
            };
        }
    }

    // CASE 2: account found by email only.
    if (accountMatchCase === 'EMAIL_ONLY' && emailMatch) {
        const otpSent = await dispatchEmailOtp(emailMatch.email);
        if (!otpSent) {
            logger.warn({ email: emailMatch.email, userId: emailMatch.id }, 'Free event: failed to dispatch OTP for existing email account');
        }

        return {
            accountOutcome: 'ACCOUNT_FOUND_BY_EMAIL',
            createdUserId: null,
            resolvedUserId: emailMatch.id,
            otpSection: {
                show: true,
                mode: 'SIGN_IN_OTP',
                primaryChannel: 'email',
                availableChannels: ['email'],
                maskedDestination: maskEmail(emailMatch.email),
            },
            nextActions: {
                canCompleteMissingPhoneLater: !emailMatch.phoneNumber,
            },
            accountCreated: false,
            accountVerificationStatus: AccountVerificationStatus.PENDING_VERIFICATION,
        };
    }

    // CASE 3: account found by phone only.
    if (accountMatchCase === 'PHONE_ONLY' && phoneMatch) {
        const fallbackPhone = buildE164Phone(input.phonePrefix, input.phoneNumber);
        const otpTarget = phoneMatch.phoneNumber ?? fallbackPhone;
        const otpSent = otpTarget ? await dispatchPhoneOtp(otpTarget) : false;
        if (!otpSent) {
            logger.warn({ userId: phoneMatch.id, phoneNumber: otpTarget }, 'Free event: failed to dispatch OTP for existing phone account');
        }

        const hasMissingEmail = !phoneMatch.email || isTemporaryEmailAddress(phoneMatch.email) || phoneMatch.email.endsWith(TEMP_EMAIL_DOMAIN);

        return {
            accountOutcome: 'ACCOUNT_FOUND_BY_PHONE',
            createdUserId: null,
            resolvedUserId: phoneMatch.id,
            otpSection: {
                show: true,
                mode: 'SIGN_IN_OTP',
                primaryChannel: 'phone',
                availableChannels: ['phone'],
                maskedDestination: maskPhone(otpTarget),
            },
            nextActions: {
                canCompleteMissingEmailLater: hasMissingEmail,
            },
            accountCreated: false,
            accountVerificationStatus: AccountVerificationStatus.PENDING_VERIFICATION,
        };
    }

    // CASE 4: both channels belong to same user.
    const unifiedUser = (emailMatch ?? phoneMatch) as AccountCandidateUser;
    const hasPhone = Boolean(unifiedUser.phoneNumber);
    const primaryChannel: OtpChannel = 'email';
    const fallbackPhone = unifiedUser.phoneNumber ?? buildE164Phone(input.phonePrefix, input.phoneNumber);

    let otpSent = await dispatchEmailOtp(unifiedUser.email);
    if (!otpSent && fallbackPhone) {
        otpSent = await dispatchPhoneOtp(fallbackPhone);
    }
    if (!otpSent) {
        logger.warn({ userId: unifiedUser.id, email: unifiedUser.email, phone: fallbackPhone }, 'Free event: failed to dispatch OTP for existing account');
    }

    return {
        accountOutcome: 'ACCOUNT_ALREADY_EXISTS',
        createdUserId: null,
        resolvedUserId: unifiedUser.id,
        otpSection: {
            show: true,
            mode: 'SIGN_IN_OTP',
            primaryChannel,
            availableChannels: hasPhone ? ['email', 'phone'] : ['email'],
            maskedDestination: maskEmail(unifiedUser.email),
        },
        nextActions: {},
        accountCreated: false,
        accountVerificationStatus: AccountVerificationStatus.PENDING_VERIFICATION,
    };
}

export function canSafelyAssociateRegistration(params: {
    registrationEmail: string;
    registrationPhonePrefix: string;
    registrationPhoneNumber: string;
    identityEmails: Set<string>;
    identityPhoneVariants: Array<{ number: string; prefix?: string }>;
}): boolean {
    const emailMatch = params.identityEmails.has(normalizeEmail(params.registrationEmail));
    const normalizedPrefix = normalizePhoneDigits(params.registrationPhonePrefix);
    const normalizedNumber = normalizePhoneDigits(params.registrationPhoneNumber);
    const phoneMatch = params.identityPhoneVariants.some((variant) => {
        if (normalizePhoneDigits(variant.number) !== normalizedNumber) return false;
        if (!variant.prefix) return true;
        return normalizePhoneDigits(variant.prefix) === normalizedPrefix;
    });

    const hasEmailIdentity = params.identityEmails.size > 0;
    const hasPhoneIdentity = params.identityPhoneVariants.length > 0;

    if (hasEmailIdentity && hasPhoneIdentity) {
        return emailMatch && phoneMatch;
    }
    if (hasEmailIdentity) return emailMatch;
    if (hasPhoneIdentity) return phoneMatch;
    return false;
}

export function buildFreeEventOutcomeMeta(soldOut: boolean): {
    eventOutcome: 'REGISTERED' | 'INTERESTED';
    modalType: 'POSITIVE' | 'NEGATIVE';
    messageKey: string;
} {
    if (soldOut) {
        return {
            eventOutcome: 'INTERESTED',
            modalType: 'NEGATIVE',
            messageKey: 'freeEventReg.response.interested',
        };
    }
    return {
        eventOutcome: 'REGISTERED',
        modalType: 'POSITIVE',
        messageKey: 'freeEventReg.response.registered',
    };
}

export function duplicateMessageForStatus(status: FreeEventRegistrationStatus): 'DUPLICATE_INTEREST' | 'DUPLICATE_REGISTRATION' {
    return status === FreeEventRegistrationStatus.INTERESTED ? 'DUPLICATE_INTEREST' : 'DUPLICATE_REGISTRATION';
}

export function shouldGenerateFreeEventReservationCode(status: FreeEventRegistrationStatus): boolean {
    return status === FreeEventRegistrationStatus.CONFIRMED || status === FreeEventRegistrationStatus.PENDING;
}

export function isFreeRegistrationEligibleForCodeCheckIn(status: FreeEventRegistrationStatus): boolean {
    return status === FreeEventRegistrationStatus.CONFIRMED || status === FreeEventRegistrationStatus.PENDING;
}

function isReservationCodeUniqueConstraint(error: unknown): boolean {
    const prismaError = error as { code?: string; meta?: { target?: string | string[] } };
    if (prismaError?.code !== 'P2002') return false;
    const target = prismaError.meta?.target;
    if (Array.isArray(target)) return target.some((item) => String(item).includes('reservation_code'));
    return String(target ?? '').includes('reservation_code');
}

async function generateUniqueFreeEventReservationCode(tx: Prisma.TransactionClient): Promise<string> {
    return generateUniqueSixDigitCode({
        exists: async (candidate) => {
            const [existingFree, existingTicket] = await Promise.all([
                tx.freeEventRegistration.findFirst({
                    where: { reservation_code: candidate },
                    select: { id: true },
                }),
                tx.groupTicket.findFirst({
                    where: { ticket_code: candidate },
                    select: { id: true },
                }),
            ]);
            return Boolean(existingFree || existingTicket);
        },
    });
}

export function buildFreeEventConfirmationContent(params: {
    locale: 'es' | 'en';
    eventTitle: string;
    firstName: string;
    reservationCode: string;
}) {
    const checkInHint = params.locale === 'en'
        ? 'Please present it at check-in.'
        : 'Preséntalo al momento del check-in.';
    const whatsappMessage = params.locale === 'en'
        ? `Congratulations! You have been successfully registered for ${params.eventTitle}. Your reservation code is: ${params.reservationCode}. ${checkInHint}`
        : `¡Felicitaciones! Has sido registrado exitosamente al evento ${params.eventTitle}. Tu código de reserva es: ${params.reservationCode}. ${checkInHint}`;
    const emailSubject = params.locale === 'en'
        ? `Registration confirmed: ${params.eventTitle}`
        : `Registro confirmado: ${params.eventTitle}`;
    const emailGreeting = params.locale === 'en' ? 'Hi' : 'Hola';
    const emailBodyLine = params.locale === 'en'
        ? `You have been successfully registered for <strong>${params.eventTitle}</strong>.`
        : `Tu registro al evento <strong>${params.eventTitle}</strong> fue confirmado exitosamente.`;
    const emailCodeLabel = params.locale === 'en' ? 'Reservation code' : 'Código de reserva';
    const emailCheckInLine = params.locale === 'en'
        ? 'Save this code and present it at event check-in.'
        : 'Guarda este código y preséntalo al momento del check-in del evento.';
    const emailHtml = `<p>${emailGreeting} ${params.firstName},</p><p>${emailBodyLine}</p><p><strong>${emailCodeLabel}:</strong> ${params.reservationCode}</p><p>${emailCheckInLine}</p>`;

    return {
        checkInHint,
        whatsappMessage,
        emailSubject,
        emailHtml,
    };
}

// ─────────────────────────────────────────────
// Public: get registration state
// ─────────────────────────────────────────────

export async function getFreeRegistrationState(
    companyId: number,
    eventId: number,
    userId: string | undefined,
    userEmail: string | undefined,
): Promise<FreeRegistrationStateResult> {
    const event = await prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
        select: { id: true, is_free: true, status: true },
    });

    if (!event || !event.is_free || event.status !== GroupItemStatus.PUBLISHED) {
        return { code: 404, error: true, message: 'Event not found' };
    }

    const user = userId
        ? await prisma.user.findUnique({
            where: { id: userId },
            select: { first_name: true, last_name: true, gender: true, age: true, email: true, phone_prefix: true, phoneNumber: true },
        })
        : null;

    // Check existing registration with safe identity matching (prevents cross-account leakage).
    const normalizedUserEmail = userEmail ? normalizeEmail(userEmail) : null;
    const profileEmail = user?.email ? normalizeEmail(user.email) : null;
    const profilePhonePrefix = user?.phone_prefix?.trim();
    const profilePhoneNumber = user?.phoneNumber?.trim();
    const profilePhoneVariants = buildPhoneMatchVariants(profilePhoneNumber, profilePhonePrefix);
    const identityEmails = new Set<string>([
        ...(normalizedUserEmail ? [normalizedUserEmail] : []),
        ...(profileEmail ? [profileEmail] : []),
    ]);

    let existing = null;
    if (userId) {
        const candidates = await prisma.freeEventRegistration.findMany({
            where: {
                group_event_id: eventId,
                OR: [
                    { user_id: userId },
                    ...(identityEmails.size > 0 ? [{ email: { in: Array.from(identityEmails) } }] : []),
                    ...profilePhoneVariants.map((variant) => ({
                        phone_number: variant.number,
                        ...(variant.prefix ? { phone_prefix: variant.prefix } : {}),
                        create_account_requested: true,
                    })),
                ],
            },
            orderBy: { created_at: 'desc' },
        });

        existing = candidates.find((row) => row.user_id === userId) ?? candidates.find((row) =>
            !row.user_id && canSafelyAssociateRegistration({
                registrationEmail: row.email,
                registrationPhonePrefix: row.phone_prefix,
                registrationPhoneNumber: row.phone_number,
                identityEmails,
                identityPhoneVariants: profilePhoneVariants,
            }),
        ) ?? null;

        if (existing && !existing.user_id) {
            existing = await prisma.freeEventRegistration.update({
                where: { id: existing.id },
                data: { user_id: userId },
            });
        }
    } else if (normalizedUserEmail) {
        existing = await prisma.freeEventRegistration.findFirst({
            where: { group_event_id: eventId, email: normalizedUserEmail },
            orderBy: { created_at: 'desc' },
        });
    }

    // Build prefill for signed-in users
    let prefill = null;
    if (user) {
        prefill = {
            firstName: user.first_name ?? '',
            lastName: user.last_name ?? '',
            gender: user.gender ?? '',
            age: user.age,
            email: user.email ?? '',
            phonePrefix: user.phone_prefix ?? '591',
            phoneNumber: user.phoneNumber ?? '',
        };
    }

    return {
        code: 200,
        error: false,
        message: 'OK',
        data: {
            hasRegistration: !!existing,
            status: existing?.status ?? null,
            prefill,
        },
    };
}

// ─────────────────────────────────────────────
// Public: submit free event registration
// ─────────────────────────────────────────────

export async function submitFreeRegistration(
    companyId: number,
    eventId: number,
    input: FreeEventRegistrationInput,
    userId: string | undefined,
): Promise<FreeRegistrationResult> {
    // Validate required fields
    const trimmed = {
        firstName: input.firstName?.trim() ?? '',
        lastName: input.lastName?.trim() ?? '',
        gender: input.gender?.trim().toUpperCase() ?? '',
        email: normalizeEmail(input.email ?? ''),
        phonePrefix: input.phonePrefix?.trim() ?? '',
        phoneNumber: input.phoneNumber?.trim() ?? '',
    };

    if (!trimmed.firstName) return { code: 400, error: true, message: 'firstName is required' };
    if (!trimmed.lastName) return { code: 400, error: true, message: 'lastName is required' };
    if (!toGender(trimmed.gender)) return { code: 400, error: true, message: 'Invalid gender value' };
    if (!input.age || input.age < 1 || input.age > 120) return { code: 400, error: true, message: 'Valid age is required' };
    if (!trimmed.email || !isValidEmail(trimmed.email)) return { code: 400, error: true, message: 'Valid email is required' };
    if (!trimmed.phonePrefix) return { code: 400, error: true, message: 'phonePrefix is required' };
    if (!trimmed.phoneNumber) return { code: 400, error: true, message: 'phoneNumber is required' };
    if (!input.tosAccepted) return { code: 400, error: true, message: 'TOS must be accepted' };

    const gender = toGender(trimmed.gender)!;

    // Duplicate check outside transaction for fast fail
    const existingByEmail = await prisma.freeEventRegistration.findUnique({
        where: { group_event_id_email: { group_event_id: eventId, email: trimmed.email } },
    });
    if (existingByEmail) {
        const msg = duplicateMessageForStatus(existingByEmail.status);
        return { code: 409, error: true, message: msg };
    }

    if (userId) {
        const existingByUser = await prisma.freeEventRegistration.findFirst({
            where: { group_event_id: eventId, user_id: userId },
        });
        if (existingByUser) {
            const msg = duplicateMessageForStatus(existingByUser.status);
            return { code: 409, error: true, message: msg };
        }
    }

    // Account resolution is secondary and must never block event registration.
    let accountResolution: AccountResolutionResult = {
        accountOutcome: 'NOT_REQUESTED',
        createdUserId: null,
        resolvedUserId: userId ?? null,
        otpSection: { show: false, mode: null, primaryChannel: null, maskedDestination: null },
        nextActions: {},
        accountCreated: false,
        accountVerificationStatus: AccountVerificationStatus.NOT_REQUESTED,
    };

    try {
        accountResolution = await resolveAccountForFreeRegistration({
            createAccount: Boolean(input.createAccount),
            userId,
            email: trimmed.email,
            phonePrefix: trimmed.phonePrefix,
            phoneNumber: trimmed.phoneNumber,
            firstName: trimmed.firstName,
            lastName: trimmed.lastName,
            gender: trimmed.gender,
            age: input.age,
        });
    } catch (err) {
        logger.error({ err, eventId, companyId }, 'Free event: account resolution failed unexpectedly');
    }

    const resolvedUserId = userId ?? accountResolution.resolvedUserId ?? null;
    if (resolvedUserId) {
        const existingByResolvedUser = await prisma.freeEventRegistration.findFirst({
            where: { group_event_id: eventId, user_id: resolvedUserId },
        });
        if (existingByResolvedUser) {
            const msg = duplicateMessageForStatus(existingByResolvedUser.status);
            return { code: 409, error: true, message: msg };
        }
    }

    // Main transaction: lock event row, check capacity, create record
    const result = await prisma.$transaction(async (tx) => {
        // Lock event row
        const event = await tx.$queryRaw<Array<{
            id: number;
            is_free: number;
            status: string;
            max_capacity: number;
            start_at: Date;
            end_at: Date;
            deleted_at: Date | null;
            company_id: number;
        }>>`
            SELECT id, is_free, status, max_capacity, start_at, end_at, deleted_at, company_id
            FROM group_event WHERE id = ${eventId} FOR UPDATE
        `;

        const ev = event[0];
        if (!ev || ev.deleted_at || ev.company_id !== companyId) {
            throw Object.assign(new Error('Event not found'), { statusCode: 404 });
        }
        if (!ev.is_free) {
            throw Object.assign(new Error('This form is only for free events'), { statusCode: 400 });
        }
        if (ev.status !== 'PUBLISHED') {
            throw Object.assign(new Error('Event is not available for registration'), { statusCode: 400 });
        }
        if (new Date(ev.end_at) < new Date()) {
            throw Object.assign(new Error('Event has already ended'), { statusCode: 400 });
        }

        // Count used capacity (both tables)
        const [bookingResult, freeCount] = await Promise.all([
            tx.groupEventBooking.aggregate({
                where: { group_event_id: eventId, status: { in: ['CONFIRMED', 'PENDING'] } },
                _sum: { booked_spots: true },
            }),
            tx.freeEventRegistration.count({
                where: { group_event_id: eventId, status: { in: ['CONFIRMED', 'PENDING'] } },
            }),
        ]);

        const usedCapacity = (bookingResult._sum.booked_spots ?? 0) + freeCount;
        const soldOut = usedCapacity >= ev.max_capacity;
        const status = soldOut ? FreeEventRegistrationStatus.INTERESTED : FreeEventRegistrationStatus.CONFIRMED;

        let registration: Awaited<ReturnType<typeof tx.freeEventRegistration.create>> | null = null;
        let reservationCode: string | null = null;

        for (let attempt = 0; attempt < MAX_FREE_RESERVATION_CODE_INSERT_ATTEMPTS; attempt += 1) {
            reservationCode = shouldGenerateFreeEventReservationCode(status)
                ? await generateUniqueFreeEventReservationCode(tx)
                : null;

            try {
                registration = await tx.freeEventRegistration.create({
                    data: {
                        group_event_id: eventId,
                        company_id: companyId,
                        user_id: resolvedUserId,
                        reservation_code: reservationCode,
                        first_name: trimmed.firstName,
                        last_name: trimmed.lastName,
                        gender,
                        age: input.age,
                        email: trimmed.email,
                        phone_prefix: trimmed.phonePrefix,
                        phone_number: trimmed.phoneNumber,
                        tos_accepted: input.tosAccepted,
                        source: 'free_event_form',
                        status,
                        create_account_requested: input.createAccount ?? false,
                        account_created: accountResolution.accountCreated,
                        account_verification_status: accountResolution.accountVerificationStatus,
                    },
                });
                break;
            } catch (error) {
                if (isReservationCodeUniqueConstraint(error) && shouldGenerateFreeEventReservationCode(status)) {
                    logger.warn({ eventId, companyId, reservationCode, attempt }, 'Free event: reservation code collision, retrying');
                    continue;
                }
                throw error;
            }
        }

        if (!registration) {
            throw Object.assign(new Error('Could not generate a unique free-event reservation code'), { statusCode: 500 });
        }

        return { registration, soldOut };
    });

    // Profile sync for signed-in users (fire-and-forget, don't fail registration)
    if (userId) {
        void syncUserProfile(userId, {
            first_name: trimmed.firstName,
            last_name: trimmed.lastName,
            gender: trimmed.gender,
            age: input.age,
            phonePrefix: trimmed.phonePrefix,
            phoneNumber: trimmed.phoneNumber,
        });
    }

    // Notifications (fire-and-forget)
    if (!result.soldOut && input.tosAccepted) {
        void sendRegistrationNotifications({
            firstName: trimmed.firstName,
            email: trimmed.email,
            phonePrefix: trimmed.phonePrefix,
            phoneNumber: trimmed.phoneNumber,
            reservationCode: result.registration.reservation_code,
            eventId,
            companyId,
        });
    }

    const { eventOutcome, modalType, messageKey } = buildFreeEventOutcomeMeta(result.soldOut);

    return {
        code: 200,
        error: false,
        message: eventOutcome,
        data: {
            success: true,
            eventOutcome,
            registrationStatus: result.registration.status,
            modalType,
            accountOutcome: accountResolution.accountOutcome,
            createdUserId: accountResolution.createdUserId,
            otpSection: accountResolution.otpSection,
            nextActions: accountResolution.nextActions,
            reservationCode: result.registration.reservation_code,
            messageKey,
            registrationId: result.registration.id,
            soldOut: result.soldOut,
            createAccountRequested: result.registration.create_account_requested,
        },
    };
}

// ─────────────────────────────────────────────
// Profile sync
// ─────────────────────────────────────────────

async function syncUserProfile(
    userId: string,
    fields: { first_name: string; last_name: string; gender: string; age: number; phonePrefix: string; phoneNumber: string },
): Promise<void> {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                first_name: fields.first_name || undefined,
                last_name: fields.last_name || undefined,
                gender: fields.gender || undefined,
                age: fields.age || undefined,
                phone_prefix: fields.phonePrefix || undefined,
                phoneNumber: fields.phoneNumber || undefined,
                name: [fields.first_name, fields.last_name].filter(Boolean).join(' ') || undefined,
            },
        });
    } catch (err) {
        logger.error({ err, userId }, 'Free event: failed to sync user profile');
    }
}

// ─────────────────────────────────────────────
// Notifications (placeholder hooks)
// ─────────────────────────────────────────────

async function sendRegistrationNotifications(opts: {
    firstName: string;
    email: string;
    phonePrefix: string;
    phoneNumber: string;
    reservationCode?: string | null;
    eventId: number;
    companyId: number;
}): Promise<void> {
    try {
        if (!opts.reservationCode) {
            logger.warn({ eventId: opts.eventId, companyId: opts.companyId }, 'Free event: skipping confirmation notification without reservation code');
            return;
        }

        const event = await prisma.groupEvent.findUnique({
            where: { id: opts.eventId },
            select: { title: true, start_at: true },
        });
        if (!event) return;

        const settings = await prisma.companySettings.findUnique({
            where: { company_id: opts.companyId },
            select: { send_email_notifications: true, send_whatsapp_notifications: true },
        });
        const sendEmailEnabled = settings?.send_email_notifications ?? true;
        const sendWhatsappEnabled = settings?.send_whatsapp_notifications ?? false;

        const languageConfig = await prisma.configMessage.findUnique({
            where: {
                company_id_key: {
                    company_id: opts.companyId,
                    key: DEFAULT_LANGUAGE_KEY,
                },
            },
            select: { value: true },
        });
        const locale: 'es' | 'en' = (languageConfig?.value || '').trim().toLowerCase() === 'en' ? 'en' : 'es';
        const content = buildFreeEventConfirmationContent({
            locale,
            eventTitle: event.title,
            firstName: opts.firstName,
            reservationCode: opts.reservationCode,
        });

        // ── Email notification (placeholder hook) ──
        // TODO: replace with branded HTML template when designed
        if (sendEmailEnabled) {
            try {
                await sendGenericEmail(
                    opts.email,
                    content.emailSubject,
                    content.emailHtml,
                );
            } catch (err) {
                logger.warn({ err, eventId: opts.eventId, email: opts.email }, 'Free event: email notification failed');
            }
        }

        // ── WhatsApp notification (placeholder hook) ──
        // TODO: replace with template message when WhatsApp business template is approved
        if (sendWhatsappEnabled) {
            try {
                const fullPhone = `${opts.phonePrefix}${opts.phoneNumber}`;
                await sendWhatsappText(fullPhone, content.whatsappMessage);
            } catch (err) {
                logger.warn(
                    { err, eventId: opts.eventId, phone: `${opts.phonePrefix}${opts.phoneNumber}` },
                    'Free event: WhatsApp notification failed',
                );
            }
        }
    } catch (err) {
        logger.error({ err, eventId: opts.eventId, companyId: opts.companyId }, 'Free event: notification pipeline failed');
    }
}

// ─────────────────────────────────────────────
// Admin/Staff: free-event reservation-code lookup and check-in
// ─────────────────────────────────────────────

export async function getFreeRegistrationByReservationCode(
    companyId: number,
    eventId: number,
    reservationCode: string,
) {
    const code = reservationCode.trim();
    if (!code) {
        return { code: 400, error: true, message: 'reservation_code is required' };
    }

    const registration = await prisma.freeEventRegistration.findFirst({
        where: {
            company_id: companyId,
            group_event_id: eventId,
            reservation_code: code,
            status: { in: ['CONFIRMED', 'PENDING'] },
        },
        include: {
            user: {
                select: { id: true, name: true, email: true, phoneNumber: true },
            },
            group_event: {
                select: { id: true, title: true, start_at: true, end_at: true },
            },
        },
    });

    if (!registration) {
        return { code: 404, error: true, message: 'Reservation code not found' };
    }

    return {
        code: 200,
        error: false,
        message: 'Reservation found',
        data: {
            id: registration.id,
            status: registration.status,
            reservation_code: registration.reservation_code,
            first_name: registration.first_name,
            last_name: registration.last_name,
            email: registration.email,
            phone_prefix: registration.phone_prefix,
            phone_number: registration.phone_number,
            checked_in_at: registration.checked_in_at,
            checked_in_method: registration.checked_in_method,
            user: registration.user,
            group_event: registration.group_event,
        },
    };
}

export async function checkInFreeEventByReservationCode(
    companyId: number,
    eventId: number,
    reservationCode: string,
    method: CheckInMethod = CheckInMethod.QR_SCAN,
) {
    const lookup = await getFreeRegistrationByReservationCode(companyId, eventId, reservationCode);
    if (lookup.error || !lookup.data) {
        return lookup;
    }

    const existingCheckInAt = lookup.data.checked_in_at ? new Date(lookup.data.checked_in_at) : null;
    if (existingCheckInAt) {
        return {
            code: 200,
            error: false,
            message: 'Already checked in',
            data: {
                scan_status: 'ALREADY_USED',
                registration: lookup.data,
            },
        };
    }

    const updated = await prisma.freeEventRegistration.update({
        where: { id: lookup.data.id },
        data: {
            checked_in_at: new Date(),
            checked_in_method: method,
        },
        select: {
            id: true,
            reservation_code: true,
            checked_in_at: true,
            checked_in_method: true,
            status: true,
            first_name: true,
            last_name: true,
            email: true,
            phone_prefix: true,
            phone_number: true,
            group_event_id: true,
        },
    });

    return {
        code: 200,
        error: false,
        message: 'Checked in',
        data: {
            scan_status: 'VALID',
            registration: updated,
        },
    };
}

// ─────────────────────────────────────────────
// Admin: list interested users
// ─────────────────────────────────────────────

export interface InterestedUsersFilter {
    companyId?: number;        // undefined = super admin (all shops)
    eventId?: number;
    ageGroup?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
}

function ageGroupToRange(ageGroup: string): { min: number; max: number } | null {
    const map: Record<string, { min: number; max: number }> = {
        '0-17':  { min: 0,  max: 17 },
        '18-24': { min: 18, max: 24 },
        '25-34': { min: 25, max: 34 },
        '35-44': { min: 35, max: 44 },
        '45-54': { min: 45, max: 54 },
        '55+':   { min: 55, max: 999 },
    };
    return map[ageGroup] ?? null;
}

export function deriveAgeGroup(age: number): string {
    if (age <= 17) return '0-17';
    if (age <= 24) return '18-24';
    if (age <= 34) return '25-34';
    if (age <= 44) return '35-44';
    if (age <= 54) return '45-54';
    return '55+';
}

export async function listInterestedUsers(filters: InterestedUsersFilter) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));

    const where: any = { status: FreeEventRegistrationStatus.INTERESTED };
    if (filters.companyId) where.company_id = filters.companyId;
    if (filters.eventId) where.group_event_id = filters.eventId;
    if (filters.dateFrom || filters.dateTo) {
        where.created_at = {};
        if (filters.dateFrom) where.created_at.gte = new Date(filters.dateFrom);
        if (filters.dateTo) where.created_at.lte = new Date(filters.dateTo);
    }
    if (filters.ageGroup) {
        const range = ageGroupToRange(filters.ageGroup);
        if (range) where.age = { gte: range.min, lte: range.max };
    }

    const [total, rows] = await Promise.all([
        prisma.freeEventRegistration.count({ where }),
        prisma.freeEventRegistration.findMany({
            where,
            orderBy: { created_at: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                group_event: { select: { id: true, title: true, start_at: true } },
                company: { select: { id: true, name: true, slug: true } },
            },
        }),
    ]);

    return {
        total,
        page,
        pageSize,
        rows: rows.map((r) => ({
            id: r.id,
            event: r.group_event,
            shop: r.company,
            firstName: r.first_name,
            lastName: r.last_name,
            gender: r.gender,
            age: r.age,
            ageGroup: deriveAgeGroup(r.age),
            email: r.email,
            phonePrefix: r.phone_prefix,
            phoneNumber: r.phone_number,
            isSignedIn: !!r.user_id,
            userId: r.user_id,
            status: r.status,
            createAccountRequested: r.create_account_requested,
            accountCreated: r.account_created,
            accountVerificationStatus: r.account_verification_status,
            createdAt: r.created_at,
        })),
    };
}

export async function exportInterestedUsersXlsx(filters: InterestedUsersFilter): Promise<Buffer> {
    // Fetch all (no pagination for export)
    const exportFilters = { ...filters, page: 1, pageSize: 10000 };
    const { rows } = await listInterestedUsers(exportFilters);

    // Lazy-load xlsx to avoid bundling overhead
    const XLSX = await import('xlsx');

    const wsData = [
        [
            'Evento', 'Tienda', 'Nombre', 'Apellido', 'Género', 'Edad', 'Grupo etario',
            'Email', 'Prefijo tel.', 'Teléfono', 'Usuario registrado', 'User ID',
            'Estado', 'Creó cuenta', 'Cuenta creada', 'Estado verificación', 'Fecha registro',
        ],
        ...rows.map((r) => [
            r.event.title,
            r.shop.name,
            r.firstName,
            r.lastName,
            r.gender,
            r.age,
            r.ageGroup,
            r.email,
            r.phonePrefix,
            r.phoneNumber,
            r.isSignedIn ? 'Sí' : 'No',
            r.userId ?? '',
            r.status,
            r.createAccountRequested ? 'Sí' : 'No',
            r.accountCreated ? 'Sí' : 'No',
            r.accountVerificationStatus,
            new Date(r.createdAt).toISOString(),
        ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Interesados');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
