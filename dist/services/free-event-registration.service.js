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
exports.classifyFreeEventAccountCase = classifyFreeEventAccountCase;
exports.canSafelyAssociateRegistration = canSafelyAssociateRegistration;
exports.buildFreeEventOutcomeMeta = buildFreeEventOutcomeMeta;
exports.duplicateMessageForStatus = duplicateMessageForStatus;
exports.shouldGenerateFreeEventReservationCode = shouldGenerateFreeEventReservationCode;
exports.isFreeRegistrationEligibleForCodeCheckIn = isFreeRegistrationEligibleForCodeCheckIn;
exports.buildFreeEventConfirmationContent = buildFreeEventConfirmationContent;
exports.getFreeRegistrationState = getFreeRegistrationState;
exports.submitFreeRegistration = submitFreeRegistration;
exports.getFreeRegistrationByReservationCode = getFreeRegistrationByReservationCode;
exports.checkInFreeEventByReservationCode = checkInFreeEventByReservationCode;
exports.deriveAgeGroup = deriveAgeGroup;
exports.listInterestedUsers = listInterestedUsers;
exports.listFreeEventRegistrations = listFreeEventRegistrations;
exports.cancelFreeEventRegistration = cancelFreeEventRegistration;
exports.listEventInterestedUsers = listEventInterestedUsers;
exports.inviteInterestedRegistration = inviteInterestedRegistration;
exports.exportInterestedUsersXlsx = exportInterestedUsersXlsx;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const logger_1 = require("../config/logger");
const sendEmail_1 = require("../utils/sendEmail");
const whatsappSender_1 = require("../utils/whatsappSender");
const notification_provider_service_1 = require("./notification-provider.service");
const auth_service_1 = require("./auth.service");
const auth_1 = require("../config/auth");
const crypto_1 = __importDefault(require("crypto"));
const group_ticket_service_1 = require("./group-ticket.service");
const phoneNormalization_1 = require("../utils/phoneNormalization");
// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const VALID_GENDERS = new Set(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']);
const TEMP_EMAIL_DOMAIN = '@tmppriconpri.com';
const DEFAULT_LANGUAGE_KEY = 'default_language';
const MAX_FREE_RESERVATION_CODE_INSERT_ATTEMPTS = 10;
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function normalizePhoneDigits(value) {
    return (0, phoneNormalization_1.normalizePhoneDigits)(value);
}
function normalizePhonePrefix(prefix) {
    return (0, phoneNormalization_1.canonicalizePhoneParts)({ phonePrefix: prefix, phoneNumber: '1' }).phonePrefix ?? '';
}
function normalizePhoneNumber(number) {
    return (0, phoneNormalization_1.canonicalizePhoneParts)({ phoneNumber: number }).phoneNumber ?? '';
}
function buildE164Phone(prefix, number) {
    const canonical = (0, phoneNormalization_1.canonicalizePhoneParts)({ phonePrefix: prefix, phoneNumber: number });
    return canonical.fullPhone ? `+${canonical.fullPhone}` : null;
}
function buildPhoneMatchVariants(phone, prefix) {
    const phoneDigits = normalizePhoneDigits(phone);
    if (!phoneDigits)
        return [];
    const prefixDigits = normalizePhoneDigits(prefix);
    const variants = new Map();
    const addVariant = (numberValue, prefixValue) => {
        const cleanNumber = normalizePhoneDigits(numberValue);
        if (!cleanNumber)
            return;
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
function buildUserPhoneCandidates(phone, prefix) {
    const phoneDigits = normalizePhoneDigits(phone);
    if (!phoneDigits)
        return [];
    const prefixDigits = normalizePhoneDigits(prefix);
    const variants = new Set();
    const add = (value) => {
        const normalized = (value ?? '').trim();
        if (!normalized)
            return;
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
function maskEmail(email) {
    const value = (email ?? '').trim();
    if (!value || !value.includes('@'))
        return null;
    const [local, domain] = value.split('@');
    if (!local || !domain)
        return null;
    if (local.length <= 2)
        return `${local[0] ?? '*'}*@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
}
function maskPhone(phone) {
    const digits = normalizePhoneDigits(phone);
    if (!digits)
        return null;
    if (digits.length <= 4)
        return `***${digits}`;
    return `***${digits.slice(-4)}`;
}
function classifyFreeEventAccountCase(emailUserId, phoneUserId) {
    const emailId = emailUserId ?? null;
    const phoneId = phoneUserId ?? null;
    if (!emailId && !phoneId)
        return 'NONE';
    if (emailId && !phoneId)
        return 'EMAIL_ONLY';
    if (!emailId && phoneId)
        return 'PHONE_ONLY';
    if (emailId && phoneId && emailId === phoneId)
        return 'SAME_USER';
    return 'CONFLICT';
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function toGender(raw) {
    const upper = raw?.trim().toUpperCase();
    return VALID_GENDERS.has(upper) ? upper : null;
}
/**
 * Count capacity already used for a free event.
 * Accounts for both legacy GroupEventBooking records and new FreeEventRegistration records.
 */
async function countUsedCapacity(groupEventId) {
    const [bookingResult, freeRegResult] = await Promise.all([
        client_1.prisma.groupEventBooking.aggregate({
            where: {
                group_event_id: groupEventId,
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
            _sum: { booked_spots: true },
        }),
        client_1.prisma.freeEventRegistration.count({
            where: {
                group_event_id: groupEventId,
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
        }),
    ]);
    return (bookingResult._sum.booked_spots ?? 0) + freeRegResult;
}
async function dispatchEmailOtp(email) {
    const result = await (0, auth_service_1.sendLoginOtpEmail)(email);
    return {
        accepted: !result.error && result.code < 400,
        status: !result.error && result.code < 400 ? 'SENT' : 'FAILED',
    };
}
async function dispatchPhoneOtp(phoneNumber, phonePrefix) {
    const result = await (0, auth_service_1.sendLoginOtpPhone)({ phoneNumber, phonePrefix });
    const accepted = !result.error && result.code < 400;
    const rawStatus = result.data?.status;
    const status = rawStatus === 'PROCESSING' || rawStatus === 'SENT' || rawStatus === 'EXPIRED' || rawStatus === 'CANCELLED'
        ? rawStatus
        : accepted ? 'PENDING' : 'FAILED';
    return { accepted, status };
}
async function dispatchPreferredOtp(params) {
    const email = params.email?.trim() || null;
    const canonicalPhone = params.phone
        ? (0, phoneNormalization_1.canonicalizePhoneParts)({ phonePrefix: params.phonePrefix, phoneNumber: params.phone })
        : { phoneNumber: null, phonePrefix: null, fullPhone: null };
    const phone = canonicalPhone.phoneNumber;
    const phonePrefix = canonicalPhone.phonePrefix;
    const fullPhone = canonicalPhone.fullPhone ? `+${canonicalPhone.fullPhone}` : null;
    const availableChannels = [
        ...(email ? ['email'] : []),
        ...(phone && phonePrefix ? ['phone'] : []),
    ];
    if (availableChannels.length === 0) {
        return {
            accepted: false,
            deliveryStatus: 'FAILED',
            channel: null,
            availableChannels: [],
            maskedDestination: null,
        };
    }
    const preferred = params.preferredChannel;
    const orderedChannels = preferred && availableChannels.includes(preferred)
        ? [preferred, ...availableChannels.filter((channel) => channel !== preferred)]
        : availableChannels;
    for (const channel of orderedChannels) {
        if (channel === 'email' && email) {
            const delivery = await dispatchEmailOtp(email);
            if (delivery.accepted) {
                return {
                    accepted: true,
                    deliveryStatus: delivery.status,
                    channel: 'email',
                    availableChannels,
                    maskedDestination: maskEmail(email),
                };
            }
            continue;
        }
        if (channel === 'phone' && phone && phonePrefix) {
            const delivery = await dispatchPhoneOtp(phone, phonePrefix);
            if (delivery.accepted) {
                return {
                    accepted: true,
                    deliveryStatus: delivery.status,
                    channel: 'phone',
                    availableChannels,
                    maskedDestination: maskPhone(fullPhone),
                };
            }
        }
    }
    const fallbackChannel = orderedChannels[0] ?? null;
    return {
        accepted: false,
        deliveryStatus: 'FAILED',
        channel: fallbackChannel,
        availableChannels,
        maskedDestination: fallbackChannel === 'phone' ? maskPhone(fullPhone) : maskEmail(email),
    };
}
async function createAccountForFreeRegistration(input) {
    const auth = await (0, auth_1.getAuth)();
    const displayName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || input.email;
    const randomPassword = crypto_1.default.randomBytes(24).toString('hex');
    const signUpResult = await auth.api.signUpEmail({
        body: {
            email: input.email,
            password: randomPassword,
            name: displayName,
        },
        headers: {},
    });
    const createdUserId = signUpResult?.user?.id;
    if (!createdUserId) {
        throw new Error('Could not create account user');
    }
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
        phonePrefix: input.phonePrefix,
        phoneNumber: input.phoneNumber,
    });
    await client_1.prisma.user.update({
        where: { id: createdUserId },
        data: {
            first_name: input.firstName,
            last_name: input.lastName,
            gender: input.gender,
            age: input.age,
            country_code: input.countryCode?.trim().toUpperCase() || null,
            phone_prefix: canonicalPhone.phonePrefix ?? null,
            phoneNumber: canonicalPhone.phoneNumber ?? undefined,
            phoneNumberVerified: false,
        },
    });
    return createdUserId;
}
async function resolveAccountForFreeRegistration(input) {
    if (!input.createAccount) {
        return {
            accountOutcome: 'NOT_REQUESTED',
            createdUserId: null,
            resolvedUserId: input.userId ?? null,
            otpSection: { show: false, mode: null, primaryChannel: null, maskedDestination: null },
            nextActions: {},
            accountCreated: false,
            accountVerificationStatus: client_2.AccountVerificationStatus.NOT_REQUESTED,
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
            accountVerificationStatus: client_2.AccountVerificationStatus.VERIFIED,
        };
    }
    const phoneCandidates = buildUserPhoneCandidates(input.phoneNumber, input.phonePrefix);
    const [emailUser, phoneUser] = await Promise.all([
        client_1.prisma.user.findUnique({
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
            ? client_1.prisma.user.findFirst({
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
    const emailMatch = emailUser;
    const phoneMatch = phoneUser;
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
            accountVerificationStatus: client_2.AccountVerificationStatus.NOT_REQUESTED,
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
                countryCode: input.countryCode,
                phonePrefix: input.phonePrefix,
                phoneNumber: input.phoneNumber,
            });
            const preferredChannel = input.otpChannelPreference;
            const otpDispatch = await dispatchPreferredOtp({
                preferredChannel,
                email: input.email,
                phone: input.phoneNumber,
                phonePrefix: input.phonePrefix,
            });
            if (!otpDispatch.accepted) {
                logger_1.logger.warn({ email: input.email, phone: buildE164Phone(input.phonePrefix, input.phoneNumber), preferredChannel }, 'Free event: account created but OTP dispatch failed');
            }
            return {
                accountOutcome: 'ACCOUNT_CREATED_PENDING_VERIFICATION',
                createdUserId,
                resolvedUserId: createdUserId,
                otpSection: {
                    show: true,
                    mode: 'SIGN_UP_VERIFY',
                    primaryChannel: otpDispatch.channel ?? preferredChannel ?? 'email',
                    availableChannels: otpDispatch.availableChannels,
                    maskedDestination: otpDispatch.maskedDestination,
                    deliveryStatus: otpDispatch.deliveryStatus,
                },
                nextActions: {},
                accountCreated: true,
                accountVerificationStatus: client_2.AccountVerificationStatus.PENDING_VERIFICATION,
            };
        }
        catch (err) {
            logger_1.logger.error({ err, email: input.email }, 'Free event: account creation failed');
            return {
                accountOutcome: 'NOT_REQUESTED',
                createdUserId: null,
                resolvedUserId: null,
                otpSection: { show: false, mode: null, primaryChannel: null, maskedDestination: null },
                nextActions: { canManualSignIn: true },
                accountCreated: false,
                accountVerificationStatus: client_2.AccountVerificationStatus.NOT_REQUESTED,
            };
        }
    }
    // CASE 2: account found by email only.
    if (accountMatchCase === 'EMAIL_ONLY' && emailMatch) {
        const otpDispatch = await dispatchPreferredOtp({
            preferredChannel: 'email',
            email: emailMatch.email,
        });
        if (!otpDispatch.accepted) {
            logger_1.logger.warn({ email: emailMatch.email, userId: emailMatch.id }, 'Free event: failed to dispatch OTP for existing email account');
        }
        return {
            accountOutcome: 'ACCOUNT_FOUND_BY_EMAIL',
            createdUserId: null,
            resolvedUserId: emailMatch.id,
            otpSection: {
                show: true,
                mode: 'SIGN_IN_OTP',
                primaryChannel: otpDispatch.channel ?? 'email',
                availableChannels: otpDispatch.availableChannels.length > 0 ? otpDispatch.availableChannels : ['email'],
                maskedDestination: otpDispatch.maskedDestination ?? maskEmail(emailMatch.email),
                deliveryStatus: otpDispatch.deliveryStatus,
            },
            nextActions: {
                canCompleteMissingPhoneLater: !emailMatch.phoneNumber,
            },
            accountCreated: false,
            accountVerificationStatus: client_2.AccountVerificationStatus.PENDING_VERIFICATION,
        };
    }
    // CASE 3: account found by phone only.
    if (accountMatchCase === 'PHONE_ONLY' && phoneMatch) {
        const fallbackPhone = buildE164Phone(input.phonePrefix, input.phoneNumber);
        const otpTargetPhone = phoneMatch.phoneNumber ?? input.phoneNumber;
        const otpTargetPrefix = phoneMatch.phone_prefix ?? input.phonePrefix;
        const otpDispatch = await dispatchPreferredOtp({
            preferredChannel: 'phone',
            phone: otpTargetPhone,
            phonePrefix: otpTargetPrefix,
        });
        if (!otpDispatch.accepted) {
            logger_1.logger.warn({ userId: phoneMatch.id, phoneNumber: fallbackPhone ?? otpTargetPhone }, 'Free event: failed to dispatch OTP for existing phone account');
        }
        const hasMissingEmail = !phoneMatch.email || (0, sendEmail_1.isTemporaryEmailAddress)(phoneMatch.email) || phoneMatch.email.endsWith(TEMP_EMAIL_DOMAIN);
        return {
            accountOutcome: 'ACCOUNT_FOUND_BY_PHONE',
            createdUserId: null,
            resolvedUserId: phoneMatch.id,
            otpSection: {
                show: true,
                mode: 'SIGN_IN_OTP',
                primaryChannel: otpDispatch.channel ?? 'phone',
                availableChannels: otpDispatch.availableChannels.length > 0 ? otpDispatch.availableChannels : ['phone'],
                maskedDestination: otpDispatch.maskedDestination ?? maskPhone(fallbackPhone),
                deliveryStatus: otpDispatch.deliveryStatus,
            },
            nextActions: {
                canCompleteMissingEmailLater: hasMissingEmail,
            },
            accountCreated: false,
            accountVerificationStatus: client_2.AccountVerificationStatus.PENDING_VERIFICATION,
        };
    }
    // CASE 4: both channels belong to same user.
    const unifiedUser = (emailMatch ?? phoneMatch);
    const hasPhone = Boolean(unifiedUser.phoneNumber);
    const fallbackPhone = buildE164Phone(unifiedUser.phone_prefix ?? input.phonePrefix, unifiedUser.phoneNumber ?? input.phoneNumber);
    const otpDispatch = await dispatchPreferredOtp({
        preferredChannel: input.otpChannelPreference,
        email: unifiedUser.email,
        phone: unifiedUser.phoneNumber ?? input.phoneNumber,
        phonePrefix: unifiedUser.phone_prefix ?? input.phonePrefix,
    });
    if (!otpDispatch.accepted) {
        logger_1.logger.warn({
            userId: unifiedUser.id,
            email: unifiedUser.email,
            phone: fallbackPhone,
            preferredChannel: input.otpChannelPreference,
        }, 'Free event: failed to dispatch OTP for existing account');
    }
    return {
        accountOutcome: 'ACCOUNT_ALREADY_EXISTS',
        createdUserId: null,
        resolvedUserId: unifiedUser.id,
        otpSection: {
            show: true,
            mode: 'SIGN_IN_OTP',
            primaryChannel: otpDispatch.channel ?? (hasPhone ? (input.otpChannelPreference ?? 'email') : 'email'),
            availableChannels: otpDispatch.availableChannels.length > 0
                ? otpDispatch.availableChannels
                : (hasPhone ? ['email', 'phone'] : ['email']),
            maskedDestination: otpDispatch.maskedDestination
                ?? (hasPhone && input.otpChannelPreference === 'phone'
                    ? maskPhone(fallbackPhone)
                    : maskEmail(unifiedUser.email)),
            deliveryStatus: otpDispatch.deliveryStatus,
        },
        nextActions: {},
        accountCreated: false,
        accountVerificationStatus: client_2.AccountVerificationStatus.PENDING_VERIFICATION,
    };
}
function canSafelyAssociateRegistration(params) {
    const emailMatch = params.identityEmails.has(normalizeEmail(params.registrationEmail));
    const normalizedPrefix = normalizePhoneDigits(params.registrationPhonePrefix);
    const normalizedNumber = normalizePhoneDigits(params.registrationPhoneNumber);
    const phoneMatch = params.identityPhoneVariants.some((variant) => {
        if (normalizePhoneDigits(variant.number) !== normalizedNumber)
            return false;
        if (!variant.prefix)
            return true;
        return normalizePhoneDigits(variant.prefix) === normalizedPrefix;
    });
    const hasEmailIdentity = params.identityEmails.size > 0;
    const hasPhoneIdentity = params.identityPhoneVariants.length > 0;
    if (hasEmailIdentity && hasPhoneIdentity) {
        return emailMatch && phoneMatch;
    }
    if (hasEmailIdentity)
        return emailMatch;
    if (hasPhoneIdentity)
        return phoneMatch;
    return false;
}
function buildFreeEventOutcomeMeta(soldOut) {
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
function duplicateMessageForStatus(status) {
    return status === client_2.FreeEventRegistrationStatus.INTERESTED ? 'DUPLICATE_INTEREST' : 'DUPLICATE_REGISTRATION';
}
function shouldGenerateFreeEventReservationCode(status) {
    return status === client_2.FreeEventRegistrationStatus.CONFIRMED || status === client_2.FreeEventRegistrationStatus.PENDING;
}
function isFreeRegistrationEligibleForCodeCheckIn(status) {
    return status === client_2.FreeEventRegistrationStatus.CONFIRMED || status === client_2.FreeEventRegistrationStatus.PENDING;
}
function isReservationCodeUniqueConstraint(error) {
    const prismaError = error;
    if (prismaError?.code !== 'P2002')
        return false;
    const target = prismaError.meta?.target;
    if (Array.isArray(target))
        return target.some((item) => String(item).includes('reservation_code'));
    return String(target ?? '').includes('reservation_code');
}
async function generateUniqueFreeEventReservationCode(tx) {
    return (0, group_ticket_service_1.generateUniqueSixDigitCode)({
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
function buildFreeEventConfirmationContent(params) {
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
async function getFreeRegistrationState(companyId, eventId, userId, userEmail) {
    const event = await client_1.prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
        select: { id: true, is_free: true, status: true },
    });
    if (!event || !event.is_free || event.status !== client_2.GroupItemStatus.PUBLISHED) {
        return { code: 404, error: true, message: 'Event not found' };
    }
    const user = userId
        ? await client_1.prisma.user.findUnique({
            where: { id: userId },
            select: {
                first_name: true,
                last_name: true,
                gender: true,
                age: true,
                email: true,
                country_code: true,
                phone_prefix: true,
                phoneNumber: true,
            },
        })
        : null;
    // Check existing registration with safe identity matching (prevents cross-account leakage).
    const normalizedUserEmail = userEmail ? normalizeEmail(userEmail) : null;
    const profileEmail = user?.email ? normalizeEmail(user.email) : null;
    const canonicalProfilePhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
        phonePrefix: user?.phone_prefix?.trim(),
        phoneNumber: user?.phoneNumber?.trim(),
    });
    const profilePhonePrefix = canonicalProfilePhone.phonePrefix;
    const profilePhoneNumber = canonicalProfilePhone.phoneNumber;
    const profilePhoneVariants = buildPhoneMatchVariants(profilePhoneNumber, profilePhonePrefix);
    const identityEmails = new Set([
        ...(normalizedUserEmail ? [normalizedUserEmail] : []),
        ...(profileEmail ? [profileEmail] : []),
    ]);
    let existing = null;
    if (userId) {
        const candidates = await client_1.prisma.freeEventRegistration.findMany({
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
        existing = candidates.find((row) => row.user_id === userId) ?? candidates.find((row) => !row.user_id && canSafelyAssociateRegistration({
            registrationEmail: row.email,
            registrationPhonePrefix: row.phone_prefix,
            registrationPhoneNumber: row.phone_number,
            identityEmails,
            identityPhoneVariants: profilePhoneVariants,
        })) ?? null;
        if (existing && !existing.user_id) {
            existing = await client_1.prisma.freeEventRegistration.update({
                where: { id: existing.id },
                data: { user_id: userId },
            });
        }
    }
    else if (normalizedUserEmail) {
        existing = await client_1.prisma.freeEventRegistration.findFirst({
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
            countryCode: user.country_code ?? undefined,
            phonePrefix: canonicalProfilePhone.phonePrefix ?? '591',
            phoneNumber: canonicalProfilePhone.phoneNumber ?? '',
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
async function submitFreeRegistration(companyId, eventId, input, userId) {
    const otpChannelPreference = input.otpChannelPreference === 'email' || input.otpChannelPreference === 'phone'
        ? input.otpChannelPreference
        : undefined;
    if (input.otpChannelPreference && !otpChannelPreference) {
        return { code: 400, error: true, message: 'Invalid otpChannelPreference value' };
    }
    // Validate required fields
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
        phonePrefix: input.phonePrefix?.trim() ?? '',
        phoneNumber: input.phoneNumber?.trim() ?? '',
    });
    const trimmed = {
        firstName: input.firstName?.trim() ?? '',
        lastName: input.lastName?.trim() ?? '',
        gender: input.gender?.trim().toUpperCase() ?? '',
        email: normalizeEmail(input.email ?? ''),
        countryCode: input.countryCode?.trim().toUpperCase() ?? '',
        phonePrefix: canonicalPhone.phonePrefix ?? '',
        phoneNumber: canonicalPhone.phoneNumber ?? '',
    };
    const registrationQuestionAnswer = input.registrationQuestionAnswer?.trim() || null;
    if (!trimmed.firstName)
        return { code: 400, error: true, message: 'firstName is required' };
    if (!trimmed.lastName)
        return { code: 400, error: true, message: 'lastName is required' };
    if (!toGender(trimmed.gender))
        return { code: 400, error: true, message: 'Invalid gender value' };
    if (!input.age || input.age < 1 || input.age > 120)
        return { code: 400, error: true, message: 'Valid age is required' };
    if (!trimmed.email || !isValidEmail(trimmed.email))
        return { code: 400, error: true, message: 'Valid email is required' };
    if (!trimmed.phonePrefix)
        return { code: 400, error: true, message: 'phonePrefix is required' };
    if (!trimmed.phoneNumber)
        return { code: 400, error: true, message: 'phoneNumber is required' };
    if (!input.tosAccepted)
        return { code: 400, error: true, message: 'TOS must be accepted' };
    const gender = toGender(trimmed.gender);
    // Duplicate check outside transaction for fast fail
    const existingByEmail = await client_1.prisma.freeEventRegistration.findUnique({
        where: { group_event_id_email: { group_event_id: eventId, email: trimmed.email } },
    });
    if (existingByEmail) {
        const msg = duplicateMessageForStatus(existingByEmail.status);
        return { code: 409, error: true, message: msg };
    }
    if (userId) {
        const existingByUser = await client_1.prisma.freeEventRegistration.findFirst({
            where: { group_event_id: eventId, user_id: userId },
        });
        if (existingByUser) {
            const msg = duplicateMessageForStatus(existingByUser.status);
            return { code: 409, error: true, message: msg };
        }
    }
    // Account resolution is secondary and must never block event registration.
    let accountResolution = {
        accountOutcome: 'NOT_REQUESTED',
        createdUserId: null,
        resolvedUserId: userId ?? null,
        otpSection: { show: false, mode: null, primaryChannel: null, maskedDestination: null },
        nextActions: {},
        accountCreated: false,
        accountVerificationStatus: client_2.AccountVerificationStatus.NOT_REQUESTED,
    };
    try {
        accountResolution = await resolveAccountForFreeRegistration({
            createAccount: Boolean(input.createAccount),
            userId,
            email: trimmed.email,
            countryCode: trimmed.countryCode,
            phonePrefix: trimmed.phonePrefix,
            phoneNumber: trimmed.phoneNumber,
            otpChannelPreference,
            firstName: trimmed.firstName,
            lastName: trimmed.lastName,
            gender: trimmed.gender,
            age: input.age,
        });
    }
    catch (err) {
        logger_1.logger.error({ err, eventId, companyId }, 'Free event: account resolution failed unexpectedly');
    }
    const resolvedUserId = userId ?? accountResolution.resolvedUserId ?? null;
    if (resolvedUserId) {
        const existingByResolvedUser = await client_1.prisma.freeEventRegistration.findFirst({
            where: { group_event_id: eventId, user_id: resolvedUserId },
        });
        if (existingByResolvedUser) {
            const msg = duplicateMessageForStatus(existingByResolvedUser.status);
            return { code: 409, error: true, message: msg };
        }
    }
    // Main transaction: lock event row, check capacity, create record
    const result = await client_1.prisma.$transaction(async (tx) => {
        // Lock event row
        const event = await tx.$queryRaw `
            SELECT id, is_free, status, max_capacity, registration_question_text, registration_question_required, start_at, end_at, deleted_at, company_id
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
        if (ev.registration_question_required && !registrationQuestionAnswer) {
            throw Object.assign(new Error('Registration question answer is required'), { statusCode: 400 });
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
        const status = soldOut ? client_2.FreeEventRegistrationStatus.INTERESTED : client_2.FreeEventRegistrationStatus.CONFIRMED;
        let registration = null;
        let reservationCode = null;
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
                        country_code: trimmed.countryCode || null,
                        phone_prefix: trimmed.phonePrefix,
                        phone_number: trimmed.phoneNumber,
                        registration_question_answer: ev.registration_question_text ? registrationQuestionAnswer : null,
                        tos_accepted: input.tosAccepted,
                        source: 'free_event_form',
                        status,
                        create_account_requested: input.createAccount ?? false,
                        account_created: accountResolution.accountCreated,
                        account_verification_status: accountResolution.accountVerificationStatus,
                    },
                });
                break;
            }
            catch (error) {
                if (isReservationCodeUniqueConstraint(error) && shouldGenerateFreeEventReservationCode(status)) {
                    logger_1.logger.warn({ eventId, companyId, reservationCode, attempt }, 'Free event: reservation code collision, retrying');
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
            countryCode: trimmed.countryCode,
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
async function syncUserProfile(userId, fields) {
    try {
        const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
            phonePrefix: fields.phonePrefix,
            phoneNumber: fields.phoneNumber,
        });
        await client_1.prisma.user.update({
            where: { id: userId },
            data: {
                first_name: fields.first_name || undefined,
                last_name: fields.last_name || undefined,
                gender: fields.gender || undefined,
                age: fields.age || undefined,
                country_code: fields.countryCode?.trim().toUpperCase() || undefined,
                phone_prefix: canonicalPhone.phonePrefix || undefined,
                phoneNumber: canonicalPhone.phoneNumber || undefined,
                name: [fields.first_name, fields.last_name].filter(Boolean).join(' ') || undefined,
            },
        });
    }
    catch (err) {
        logger_1.logger.error({ err, userId }, 'Free event: failed to sync user profile');
    }
}
// ─────────────────────────────────────────────
// Notifications (placeholder hooks)
// ─────────────────────────────────────────────
async function sendRegistrationNotifications(opts) {
    try {
        if (!opts.reservationCode) {
            logger_1.logger.warn({ eventId: opts.eventId, companyId: opts.companyId }, 'Free event: skipping confirmation notification without reservation code');
            return;
        }
        const event = await client_1.prisma.groupEvent.findUnique({
            where: { id: opts.eventId },
            select: { title: true, start_at: true },
        });
        if (!event)
            return;
        const settings = await client_1.prisma.companySettings.findUnique({
            where: { company_id: opts.companyId },
            select: { send_email_notifications: true, send_whatsapp_notifications: true },
        });
        const sendEmailEnabled = settings?.send_email_notifications ?? true;
        const sendWhatsappEnabled = settings?.send_whatsapp_notifications ?? false;
        const languageConfig = await client_1.prisma.configMessage.findUnique({
            where: {
                company_id_key: {
                    company_id: opts.companyId,
                    key: DEFAULT_LANGUAGE_KEY,
                },
            },
            select: { value: true },
        });
        const locale = (languageConfig?.value || '').trim().toLowerCase() === 'en' ? 'en' : 'es';
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
                const result = await (0, sendEmail_1.sendGenericEmail)(opts.email, content.emailSubject, content.emailHtml, { companyId: opts.companyId });
                if (!(0, notification_provider_service_1.isEmailDeliverySuccessful)(result)) {
                    logger_1.logger.warn({ eventId: opts.eventId, reason: result.reason }, 'Free event: email notification was not delivered');
                }
            }
            catch (err) {
                logger_1.logger.warn({ err, eventId: opts.eventId, email: opts.email }, 'Free event: email notification failed');
            }
        }
        // ── WhatsApp notification (placeholder hook) ──
        // TODO: replace with template message when WhatsApp business template is approved
        if (sendWhatsappEnabled) {
            try {
                const fullPhone = `${opts.phonePrefix}${opts.phoneNumber}`;
                const result = await (0, whatsappSender_1.queueWhatsappText)(fullPhone, content.whatsappMessage, {
                    companyId: opts.companyId,
                    sourceType: 'FREE_EVENT_CONFIRMATION',
                    sourceId: opts.reservationCode,
                    dedupeKey: `free-event-confirmation:${opts.eventId}:${opts.reservationCode}`,
                    expiresAt: event.start_at,
                });
                if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
                    logger_1.logger.warn({ eventId: opts.eventId, reason: result.reason ?? 'WHATSAPP_ENQUEUE_FAILED' }, 'Free event: WhatsApp notification was not queued');
                }
            }
            catch (err) {
                logger_1.logger.warn({ err, eventId: opts.eventId, phone: `${opts.phonePrefix}${opts.phoneNumber}` }, 'Free event: WhatsApp notification failed');
            }
        }
    }
    catch (err) {
        logger_1.logger.error({ err, eventId: opts.eventId, companyId: opts.companyId }, 'Free event: notification pipeline failed');
    }
}
// ─────────────────────────────────────────────
// Admin/Staff: free-event reservation-code lookup and check-in
// ─────────────────────────────────────────────
async function getFreeRegistrationByReservationCode(companyId, eventId, reservationCode) {
    const code = reservationCode.trim();
    if (!code) {
        return { code: 400, error: true, message: 'reservation_code is required' };
    }
    const registration = await client_1.prisma.freeEventRegistration.findFirst({
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
async function checkInFreeEventByReservationCode(companyId, eventId, reservationCode, method = client_2.CheckInMethod.QR_SCAN) {
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
    const updated = await client_1.prisma.freeEventRegistration.update({
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
function ageGroupToRange(ageGroup) {
    const map = {
        '0-17': { min: 0, max: 17 },
        '18-24': { min: 18, max: 24 },
        '25-34': { min: 25, max: 34 },
        '35-44': { min: 35, max: 44 },
        '45-54': { min: 45, max: 54 },
        '55+': { min: 55, max: 999 },
    };
    return map[ageGroup] ?? null;
}
function deriveAgeGroup(age) {
    if (age <= 17)
        return '0-17';
    if (age <= 24)
        return '18-24';
    if (age <= 34)
        return '25-34';
    if (age <= 44)
        return '35-44';
    if (age <= 54)
        return '45-54';
    return '55+';
}
async function listInterestedUsers(filters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const where = { status: client_2.FreeEventRegistrationStatus.INTERESTED };
    if (filters.companyId)
        where.company_id = filters.companyId;
    if (filters.eventId)
        where.group_event_id = filters.eventId;
    if (filters.dateFrom || filters.dateTo) {
        where.created_at = {};
        if (filters.dateFrom)
            where.created_at.gte = new Date(filters.dateFrom);
        if (filters.dateTo)
            where.created_at.lte = new Date(filters.dateTo);
    }
    if (filters.ageGroup) {
        const range = ageGroupToRange(filters.ageGroup);
        if (range)
            where.age = { gte: range.min, lte: range.max };
    }
    const [total, rows] = await Promise.all([
        client_1.prisma.freeEventRegistration.count({ where }),
        client_1.prisma.freeEventRegistration.findMany({
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
// ─────────────────────────────────────────────
// Admin: list free registrations for an event
// ─────────────────────────────────────────────
async function listFreeEventRegistrations(companyId, eventId) {
    const event = await client_1.prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
        select: { id: true, is_free: true },
    });
    if (!event || !event.is_free) {
        return { code: 404, error: true, message: 'Free event not found' };
    }
    const rows = await client_1.prisma.freeEventRegistration.findMany({
        where: {
            group_event_id: eventId,
            company_id: companyId,
            status: { in: [client_2.FreeEventRegistrationStatus.CONFIRMED, client_2.FreeEventRegistrationStatus.PENDING] },
        },
        orderBy: { created_at: 'asc' },
        select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone_prefix: true,
            phone_number: true,
            registration_question_answer: true,
            gender: true,
            age: true,
            status: true,
            reservation_code: true,
            checked_in_at: true,
            created_at: true,
        },
    });
    return {
        code: 200,
        error: false,
        message: 'OK',
        data: rows.map((r) => ({
            id: r.id,
            firstName: r.first_name,
            lastName: r.last_name,
            email: r.email,
            phonePrefix: r.phone_prefix,
            phoneNumber: r.phone_number,
            registrationQuestionAnswer: r.registration_question_answer,
            gender: r.gender,
            age: r.age,
            status: r.status,
            reservationCode: r.reservation_code,
            checkedInAt: r.checked_in_at,
            createdAt: r.created_at,
        })),
    };
}
// ─────────────────────────────────────────────
// Admin: cancel (remove) a free event registration
// ─────────────────────────────────────────────
async function cancelFreeEventRegistration(companyId, eventId, registrationId) {
    const registration = await client_1.prisma.freeEventRegistration.findFirst({
        where: { id: registrationId, group_event_id: eventId, company_id: companyId },
    });
    if (!registration) {
        return { code: 404, error: true, message: 'Registration not found' };
    }
    if (registration.status === client_2.FreeEventRegistrationStatus.INTERESTED) {
        return { code: 400, error: true, message: 'Cannot cancel an interested record' };
    }
    await client_1.prisma.freeEventRegistration.delete({ where: { id: registrationId } });
    return { code: 200, error: false, message: 'Registration removed' };
}
// ─────────────────────────────────────────────
// Admin: list interested users for a specific event
// ─────────────────────────────────────────────
async function listEventInterestedUsers(companyId, eventId) {
    const event = await client_1.prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
        select: { id: true, is_free: true },
    });
    if (!event || !event.is_free) {
        return { code: 404, error: true, message: 'Free event not found' };
    }
    const rows = await client_1.prisma.freeEventRegistration.findMany({
        where: {
            group_event_id: eventId,
            company_id: companyId,
            status: client_2.FreeEventRegistrationStatus.INTERESTED,
        },
        orderBy: { created_at: 'asc' },
        select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone_prefix: true,
            phone_number: true,
            registration_question_answer: true,
            gender: true,
            age: true,
            created_at: true,
        },
    });
    return {
        code: 200,
        error: false,
        message: 'OK',
        data: rows.map((r) => ({
            id: r.id,
            firstName: r.first_name,
            lastName: r.last_name,
            email: r.email,
            phonePrefix: r.phone_prefix,
            phoneNumber: r.phone_number,
            registrationQuestionAnswer: r.registration_question_answer,
            gender: r.gender,
            age: r.age,
            createdAt: r.created_at,
        })),
    };
}
// ─────────────────────────────────────────────
// Admin: invite interested user (INTERESTED → CONFIRMED + notify)
// ─────────────────────────────────────────────
async function inviteInterestedRegistration(companyId, eventId, registrationId, channels) {
    const event = await client_1.prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
        select: { id: true, is_free: true, title: true, max_capacity: true, start_at: true },
    });
    if (!event || !event.is_free) {
        return { code: 404, error: true, message: 'Free event not found' };
    }
    const registration = await client_1.prisma.freeEventRegistration.findFirst({
        where: { id: registrationId, group_event_id: eventId, company_id: companyId },
    });
    if (!registration) {
        return { code: 404, error: true, message: 'Registration not found' };
    }
    if (registration.status !== client_2.FreeEventRegistrationStatus.INTERESTED) {
        return { code: 400, error: true, message: 'Registration is not in INTERESTED status' };
    }
    // Generate a unique reservation code
    let reservationCode = null;
    let updated = null;
    for (let attempt = 0; attempt < MAX_FREE_RESERVATION_CODE_INSERT_ATTEMPTS; attempt += 1) {
        reservationCode = await generateUniqueFreeEventReservationCode(client_1.prisma);
        try {
            updated = await client_1.prisma.freeEventRegistration.update({
                where: { id: registrationId },
                data: {
                    status: client_2.FreeEventRegistrationStatus.CONFIRMED,
                    reservation_code: reservationCode,
                },
            });
            break;
        }
        catch (err) {
            if (isReservationCodeUniqueConstraint(err) && attempt < MAX_FREE_RESERVATION_CODE_INSERT_ATTEMPTS - 1) {
                logger_1.logger.warn({ eventId, registrationId, reservationCode, attempt }, 'Invite: reservation code collision, retrying');
                continue;
            }
            throw err;
        }
    }
    if (!updated || !reservationCode) {
        return { code: 500, error: true, message: 'Could not generate reservation code' };
    }
    // Get company language setting
    const [languageConfig] = await Promise.all([
        client_1.prisma.configMessage.findUnique({
            where: { company_id_key: { company_id: companyId, key: DEFAULT_LANGUAGE_KEY } },
            select: { value: true },
        }),
    ]);
    const locale = (languageConfig?.value ?? '').trim().toLowerCase() === 'en' ? 'en' : 'es';
    const content = buildFreeEventConfirmationContent({
        locale,
        eventTitle: event.title,
        firstName: registration.first_name,
        reservationCode,
    });
    // Send notifications according to admin-selected channels
    if (channels.email && !(0, sendEmail_1.isTemporaryEmailAddress)(registration.email)) {
        try {
            const result = await (0, sendEmail_1.sendGenericEmail)(registration.email, content.emailSubject, content.emailHtml, { companyId });
            if (!(0, notification_provider_service_1.isEmailDeliverySuccessful)(result)) {
                logger_1.logger.warn({ eventId, registrationId, reason: result.reason }, 'Invite: email was not delivered');
            }
        }
        catch (err) {
            logger_1.logger.warn({ err, eventId, registrationId }, 'Invite: email send failed');
        }
    }
    if (channels.whatsapp) {
        try {
            const fullPhone = `${registration.phone_prefix}${registration.phone_number}`;
            const result = await (0, whatsappSender_1.queueWhatsappText)(fullPhone, content.whatsappMessage, {
                companyId,
                sourceType: 'FREE_EVENT_INVITATION',
                sourceId: String(registrationId),
                dedupeKey: `free-event-invite:${eventId}:${registrationId}:${reservationCode}`,
                expiresAt: event.start_at,
            });
            if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
                logger_1.logger.warn({ eventId, registrationId, reason: result.reason ?? 'WHATSAPP_ENQUEUE_FAILED' }, 'Invite: WhatsApp was not queued');
            }
        }
        catch (err) {
            logger_1.logger.warn({ err, eventId, registrationId }, 'Invite: WhatsApp send failed');
        }
    }
    return {
        code: 200,
        error: false,
        message: 'Invited successfully',
        data: {
            id: updated.id,
            status: updated.status,
            reservationCode,
        },
    };
}
async function exportInterestedUsersXlsx(filters) {
    // Fetch all (no pagination for export)
    const exportFilters = { ...filters, page: 1, pageSize: 10000 };
    const { rows } = await listInterestedUsers(exportFilters);
    // Lazy-load xlsx to avoid bundling overhead
    const XLSX = await Promise.resolve().then(() => __importStar(require('xlsx')));
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
