import {
    GroupBookingStatus,
    PaymentMethod,
    PaymentStatus,
    GroupItemStatus,
    Prisma,
} from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../config/logger';
import { MensajeApi } from '../types/MensajeApi';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';
import {
    cancelTicketsForClassEnrollment,
    cancelTicketsForEventBooking,
    issueClassTicketForEnrollment,
    issueEventTicketForBooking,
} from './group-ticket.service';
import { generateInstallmentsForEnrollment } from './enrollment-installment.service';
import { buildWaitlistSpotOpenedTemplate, notifyGroupBookingCreated } from '../utils/groupNotifications';
import { isTemporaryEmailAddress, sendCustomerMassMessageEmail, sendGenericEmail } from '../utils/sendEmail';
import { sendWhatsappText } from '../utils/whatsappSender';
import { ensureCustomerProfileWithAccount, sendCustomerPortalInvite, type CustomerAccountInviteContext } from './customer-account.service';

type ServiceResult = MensajeApi & { data?: any };
type TxClient = Prisma.TransactionClient;
const DEFAULT_LANGUAGE_KEY = 'default_language';
export type EventMassMessageProgress = {
    total_recipients: number;
    processed: number;
    sent_total: number;
    sent_whatsapp: number;
    sent_email: number;
    skipped_no_contact: number;
    skipped_duplicates: number;
    failed: number;
};

type EventMassMessageFailedChannel = 'WHATSAPP' | 'EMAIL';
type EventMassMessageFailedTarget = {
    source: 'GROUP_EVENT_BOOKING' | 'FREE_REGISTRATION';
    id: number;
    failed_channels: EventMassMessageFailedChannel[];
};

type EventMassMessageDeliveryMode = 'AUTO' | 'WHATSAPP' | 'EMAIL' | 'BOTH';

type EventMassMessagePayload = {
    message: string;
    delivery_mode?: EventMassMessageDeliveryMode;
    selected_targets?: Array<{
        source: 'GROUP_EVENT_BOOKING' | 'FREE_REGISTRATION';
        id: number;
    }>;
};

function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = normalizePhoneDigits(phone);
    if (!cleanPhone) return null;

    const cleanPrefix = normalizePhoneDigits(prefix);
    const effectivePrefix = cleanPrefix || (cleanPhone.length <= 9 ? '591' : '');

    if (!effectivePrefix) {
        return cleanPhone;
    }

    if (cleanPhone.startsWith(effectivePrefix) && cleanPhone.length > effectivePrefix.length + 5) {
        return cleanPhone;
    }

    return `${effectivePrefix}${cleanPhone}`;
}

function normalizePhoneDigits(value?: string | null): string {
    return (value ?? '').replace(/\D/g, '');
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

    // Common fallback for NANP numbers stored as +1XXXXXXXXXX.
    if (!prefixDigits && phoneDigits.length === 11 && phoneDigits.startsWith('1')) {
        addVariant(phoneDigits.slice(1), '1');
        addVariant(phoneDigits.slice(1));
    }

    return Array.from(variants.values());
}

export function canSafelyMatchOrphanFreeRegistration(params: {
    registrationEmail: string;
    registrationPhonePrefix: string;
    registrationPhoneNumber: string;
    identityEmails: Set<string>;
    identityPhoneVariants: Array<{ number: string; prefix?: string }>;
}): boolean {
    const normalizedEmail = params.registrationEmail.trim().toLowerCase();
    const emailMatch = params.identityEmails.has(normalizedEmail);

    const registrationNumber = normalizePhoneDigits(params.registrationPhoneNumber);
    const registrationPrefix = normalizePhoneDigits(params.registrationPhonePrefix);
    const phoneMatch = params.identityPhoneVariants.some((variant) => {
        if (normalizePhoneDigits(variant.number) !== registrationNumber) return false;
        if (!variant.prefix) return true;
        return normalizePhoneDigits(variant.prefix) === registrationPrefix;
    });

    const hasEmailIdentity = params.identityEmails.size > 0;
    const hasPhoneIdentity = params.identityPhoneVariants.length > 0;

    if (hasEmailIdentity && hasPhoneIdentity) return emailMatch && phoneMatch;
    if (hasEmailIdentity) return emailMatch;
    if (hasPhoneIdentity) return phoneMatch;
    return false;
}

function getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getEventBookingUrl(companySlug: string | null | undefined, eventId: number): string | null {
    if (!companySlug) return null;
    return `${getFrontendBaseUrl()}/shop/${encodeURIComponent(companySlug)}/events/${eventId}`;
}

function buildDisplayPhone(prefix?: string | null, phone?: string | null): string | null {
    const digits = buildFullPhone(prefix, phone);
    return digits ? `+${digits}` : null;
}

function normalizeEmail(email?: string | null): string | null {
    const value = (email || '').trim().toLowerCase();
    return value || null;
}

function formatDateRange(startAt?: Date | null, endAt?: Date | null): string | null {
    if (!startAt) return null;
    if (!endAt) return startAt.toISOString();
    return `${startAt.toISOString()} - ${endAt.toISOString()}`;
}

async function notifyInternalEventBookingCreated(companyId: number, bookingId: number): Promise<void> {
    const booking = await prisma.groupEventBooking.findFirst({
        where: { id: bookingId, company_id: companyId },
        include: {
            company: {
                select: {
                    name: true,
                    currency: true,
                },
            },
            group_event: {
                select: {
                    id: true,
                    title: true,
                    start_at: true,
                    end_at: true,
                },
            },
            user: {
                select: {
                    name: true,
                    email: true,
                    phone_prefix: true,
                    phoneNumber: true,
                },
            },
        },
    });

    if (!booking) return;

    await notifyGroupBookingCreated({
        companyId,
        companyName: booking.company.name,
        itemType: 'EVENT',
        itemId: booking.group_event.id,
        itemTitle: booking.group_event.title,
        customerName: booking.user.name,
        customerEmail: booking.user.email,
        customerPhone: buildDisplayPhone(booking.user.phone_prefix, booking.user.phoneNumber),
        paymentMethod: booking.payment_method,
        paymentStatus: booking.payment_status,
        bookingStatus: booking.status,
        totalPriceCents: booking.total_price_cents,
        currency: booking.company.currency,
        qrProofImageUrl: booking.qr_proof_image_url,
        scheduleLabel: formatDateRange(booking.group_event.start_at, booking.group_event.end_at),
        createdAt: booking.created_at,
    });
}

async function notifyInternalClassEnrollmentCreated(companyId: number, enrollmentId: number): Promise<void> {
    const enrollment = await prisma.groupClassEnrollment.findFirst({
        where: { id: enrollmentId, company_id: companyId },
        include: {
            company: {
                select: {
                    name: true,
                    currency: true,
                },
            },
            group_class: {
                select: {
                    id: true,
                    title: true,
                },
            },
            user: {
                select: {
                    name: true,
                    email: true,
                    phone_prefix: true,
                    phoneNumber: true,
                },
            },
        },
    });

    if (!enrollment) return;

    await notifyGroupBookingCreated({
        companyId,
        companyName: enrollment.company.name,
        itemType: 'CLASS',
        itemId: enrollment.group_class.id,
        itemTitle: enrollment.group_class.title,
        customerName: enrollment.user.name,
        customerEmail: enrollment.user.email,
        customerPhone: buildDisplayPhone(enrollment.user.phone_prefix, enrollment.user.phoneNumber),
        paymentMethod: enrollment.payment_method,
        paymentStatus: enrollment.payment_status,
        bookingStatus: enrollment.status,
        totalPriceCents: enrollment.price_cents_snapshot,
        currency: enrollment.company.currency,
        qrProofImageUrl: enrollment.qr_proof_image_url,
        scheduleLabel: formatDateRange(enrollment.valid_from, enrollment.valid_until),
        createdAt: enrollment.created_at,
    });
}

async function lockEventRow(tx: TxClient, companyId: number, eventId: number): Promise<void> {
    await tx.$queryRaw`
        SELECT id
        FROM group_event
        WHERE id = ${eventId} AND company_id = ${companyId}
        FOR UPDATE
    `;
}

async function lockClassRow(tx: TxClient, companyId: number, classId: number): Promise<void> {
    await tx.$queryRaw`
        SELECT id
        FROM group_class
        WHERE id = ${classId} AND company_id = ${companyId}
        FOR UPDATE
    `;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT BOOKINGS
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateEventBookingInput {
    group_event_id: number;
    booked_spots?: number;
    payment_method: 'NONE' | 'CASH' | 'QR';
    qr_proof_image_url?: string | null;
    notes?: string | null;
    extra_attendees?: EventExtraAttendeeInput[];
}

export interface EventExtraAttendeeInput {
    full_name: string;
    email?: string | null;
    phone?: string | null;
}

/**
 * Book spots for a group event (customer-facing).
 */
export async function createEventBooking(
    companyId: number,
    userId: string,
    input: CreateEventBookingInput,
): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_EVENTS');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group events require Business plan or higher' };
    }

    const spots = input.booked_spots ?? 1;
    if (spots < 1) {
        return { code: 400, error: true, message: 'Must book at least 1 spot' };
    }

    const extrasRaw = input.extra_attendees ?? [];
    if (spots === 1 && extrasRaw.length > 0) {
        return { code: 400, error: true, message: 'extra_attendees are only allowed when booking multiple spots' };
    }
    if (spots > 1 && extrasRaw.length !== spots - 1) {
        return {
            code: 400,
            error: true,
            message: `You must provide attendee details for each extra spot (${spots - 1} required)`,
        };
    }

    const normalizedExtraAttendees: Array<{ full_name: string; email: string | null; phone: string | null }> = [];
    for (let idx = 0; idx < extrasRaw.length; idx += 1) {
        const attendee = extrasRaw[idx];
        const fullName = attendee.full_name?.trim();
        const email = attendee.email?.trim() || null;
        const phone = attendee.phone?.trim() || null;

        if (!fullName) {
            return { code: 400, error: true, message: `Missing full_name for extra attendee #${idx + 1}` };
        }
        if (!email && !phone) {
            return { code: 400, error: true, message: `Missing contact info for extra attendee #${idx + 1}` };
        }

        normalizedExtraAttendees.push({
            full_name: fullName,
            email,
            phone,
        });
    }

    const canCustomize = await isFeatureEnabledForCompany(companyId, 'BOOKING_FLOW_CUSTOMIZATION');

    const result = await prisma.$transaction(async (tx) => {
        await lockEventRow(tx, companyId, input.group_event_id);

        const event = await tx.groupEvent.findFirst({
            where: {
                id: input.group_event_id,
                company_id: companyId,
                status: GroupItemStatus.PUBLISHED,
                deleted_at: null,
            },
        });
        if (!event) {
            return { code: 404, error: true, message: 'Event not found or not published' } as ServiceResult;
        }

        if (new Date() > event.end_at) {
            return { code: 400, error: true, message: 'This event has already ended' } as ServiceResult;
        }

        const existingActive = await tx.groupEventBooking.findFirst({
            where: {
                company_id: companyId,
                group_event_id: event.id,
                user_id: userId,
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
            select: { id: true },
        });

        if (existingActive) {
            return { code: 400, error: true, message: 'You already have an active booking for this event' } as ServiceResult;
        }

        const existingWaitlist = await tx.groupEventBooking.findFirst({
            where: {
                company_id: companyId,
                group_event_id: event.id,
                user_id: userId,
                status: 'WAITLISTED',
            },
            select: { id: true, customer_profile_id: true },
        });

        const bookedCount = await tx.groupEventBooking.aggregate({
            where: {
                company_id: companyId,
                group_event_id: event.id,
                status: 'CONFIRMED',
            },
            _sum: { booked_spots: true },
        });

        const currentlyBooked = bookedCount._sum.booked_spots ?? 0;
        const remaining = event.max_capacity - currentlyBooked;

        if (spots > remaining) {
            return { code: 400, error: true, message: `Only ${Math.max(remaining, 0)} spots remaining` } as ServiceResult;
        }

        if (!event.is_free && input.payment_method === 'NONE') {
            return { code: 400, error: true, message: 'Paid events require a payment method' } as ServiceResult;
        }

        // Determine payment status
        let paymentStatus: PaymentStatus = PaymentStatus.UNPAID;
        if (event.is_free) {
            paymentStatus = PaymentStatus.PAID;
        } else if (input.payment_method === 'QR') {
            paymentStatus = PaymentStatus.PENDING_CONFIRMATION;
        }

        // Determine booking status based on auto_confirm setting
        const settings = await tx.companySettings.findUnique({
            where: { company_id: companyId },
            select: { auto_confirm_bookings: true, require_comprobante_for_qr: true },
        });
        const autoConfirm = canCustomize ? (settings?.auto_confirm_bookings ?? true) : true;
        const requireComprobante = canCustomize ? (settings?.require_comprobante_for_qr ?? true) : true;

        // Validate QR proof if required
        if (!event.is_free && input.payment_method === 'QR' && requireComprobante && !input.qr_proof_image_url) {
            return { code: 400, error: true, message: 'QR payment proof is required' } as ServiceResult;
        }

        const status: GroupBookingStatus = event.is_free || autoConfirm
            ? GroupBookingStatus.CONFIRMED
            : GroupBookingStatus.PENDING;

        // Get or create customer profile
        const customerProfile = await tx.customerProfile.upsert({
            where: { company_id_user_id: { company_id: companyId, user_id: userId } },
            update: {},
            create: { company_id: companyId, user_id: userId },
        });

        const booking = existingWaitlist
            ? await tx.groupEventBooking.update({
                where: { id: existingWaitlist.id },
                data: {
                    customer_profile_id: existingWaitlist.customer_profile_id ?? customerProfile.id,
                    status,
                    booked_spots: spots,
                    payment_method: event.is_free ? PaymentMethod.NONE : (input.payment_method as PaymentMethod),
                    payment_status: paymentStatus,
                    qr_proof_image_url: input.qr_proof_image_url ?? null,
                    total_price_cents: event.is_free ? 0 : event.price_cents * spots,
                    extra_attendees_json: normalizedExtraAttendees as Prisma.InputJsonValue,
                    notes: input.notes ?? null,
                    cancelled_at: null,
                },
            })
            : await tx.groupEventBooking.create({
                data: {
                    company_id: companyId,
                    group_event_id: event.id,
                    customer_profile_id: customerProfile.id,
                    user_id: userId,
                    status,
                    booked_spots: spots,
                    payment_method: event.is_free ? PaymentMethod.NONE : (input.payment_method as PaymentMethod),
                    payment_status: paymentStatus,
                    qr_proof_image_url: input.qr_proof_image_url ?? null,
                    total_price_cents: event.is_free ? 0 : event.price_cents * spots,
                    extra_attendees_json: normalizedExtraAttendees as Prisma.InputJsonValue,
                    notes: input.notes ?? null,
                },
            });

        return {
            code: 201,
            error: false,
            message: status === 'CONFIRMED' ? 'Booking confirmed' : 'Booking pending confirmation',
            data: booking,
        } as ServiceResult;
    });

    if (!result.error && result.data && (result.data as { status?: GroupBookingStatus }).status === GroupBookingStatus.CONFIRMED) {
        const bookingId = (result.data as { id: number }).id;
        void issueEventTicketForBooking(companyId, bookingId).catch((error) => {
            logger.error({ companyId, bookingId, error }, 'Failed to issue event ticket after booking creation');
        });
    }

    if (!result.error && result.data) {
        const bookingId = (result.data as { id: number }).id;
        void notifyInternalEventBookingCreated(companyId, bookingId).catch((error) => {
            logger.error({ companyId, bookingId, error }, 'Failed to notify internal event booking recipients');
        });
    }

    return result;
}

/**
 * Admin: list bookings for an event.
 */
export async function listEventBookings(companyId: number, eventId: number): Promise<ServiceResult> {
    const [bookings, freeRegistrations] = await Promise.all([
        prisma.groupEventBooking.findMany({
            where: { company_id: companyId, group_event_id: eventId },
            include: {
                user: { select: { id: true, name: true, email: true, phoneNumber: true } },
                customer_profile: { select: { id: true, notes: true } },
            },
            orderBy: { created_at: 'desc' },
        }),
        prisma.freeEventRegistration.findMany({
            where: {
                company_id: companyId,
                group_event_id: eventId,
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
            include: {
                user: { select: { id: true, name: true, email: true, phoneNumber: true } },
            },
            orderBy: { created_at: 'desc' },
        }),
    ]);

    const bookingUserKeys = new Set(
        bookings
            .map((booking) => booking.user_id)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .map((value) => `${eventId}:uid:${value}`),
    );
    const bookingEmailKeys = new Set(
        bookings
            .map((booking) => booking.user?.email?.trim().toLowerCase())
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .map((value) => `${eventId}:email:${value}`),
    );
    const bookingPhoneKeys = new Set(
        bookings
            .flatMap((booking) => buildPhoneMatchVariants(booking.user?.phoneNumber))
            .map((variant) => `${eventId}:phone:${variant.number}`),
    );

    const mappedFreeRegistrations = freeRegistrations
        .filter((registration) => {
            const byUser = registration.user_id ? bookingUserKeys.has(`${eventId}:uid:${registration.user_id}`) : false;
            const byEmail = bookingEmailKeys.has(`${eventId}:email:${registration.email.trim().toLowerCase()}`);
            const byPhone = buildPhoneMatchVariants(registration.phone_number, registration.phone_prefix)
                .some((variant) => bookingPhoneKeys.has(`${eventId}:phone:${variant.number}`));
            return !(byUser || byEmail || byPhone);
        })
        .map((registration) => {
        const fallbackUserId = `free-reg-${registration.id}`;
        const fallbackName = [registration.first_name, registration.last_name]
            .map((value) => value?.trim() ?? '')
            .filter((value) => value.length > 0)
            .join(' ');

            return {
                id: -registration.id,
                source: 'FREE_REGISTRATION',
                company_id: registration.company_id,
                group_event_id: registration.group_event_id,
                customer_profile_id: null,
                user_id: registration.user_id ?? fallbackUserId,
                status: registration.status === 'CONFIRMED' ? GroupBookingStatus.CONFIRMED : GroupBookingStatus.PENDING,
                booked_spots: 1,
                payment_method: PaymentMethod.NONE,
                payment_status: PaymentStatus.PAID,
                qr_proof_image_url: null,
                total_price_cents: 0,
                extra_attendees_json: null,
                notes: null,
                created_at: registration.created_at,
                updated_at: registration.updated_at,
                cancelled_at: null,
                user: registration.user ?? {
                    id: registration.user_id ?? fallbackUserId,
                    name: fallbackName || null,
                    email: registration.email,
                    phoneNumber: registration.phone_number,
                },
                customer_profile: null,
            };
        });

    const allBookings = [...bookings, ...mappedFreeRegistrations].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return { code: 200, error: false, message: 'Bookings retrieved', data: allBookings };
}

async function runEventMassMessage(
    companyId: number,
    eventId: number,
    payload: EventMassMessagePayload,
    onProgress?: (progress: EventMassMessageProgress) => Promise<void> | void,
): Promise<ServiceResult> {
    const message = (payload.message || '').trim();
    if (!message) {
        return {
            code: 400,
            error: true,
            message: 'Message body is required',
        };
    }

    if (message.length > 1500) {
        return {
            code: 400,
            error: true,
            message: 'Message body cannot exceed 1500 characters',
        };
    }

    const [company, event, localeConfig] = await Promise.all([
        prisma.company.findUnique({
            where: { id: companyId, deleted_at: null },
            select: { id: true, name: true },
        }),
        prisma.groupEvent.findFirst({
            where: { id: eventId, company_id: companyId, deleted_at: null },
            select: { id: true, title: true },
        }),
        prisma.configMessage.findUnique({
            where: {
                company_id_key: {
                    company_id: companyId,
                    key: DEFAULT_LANGUAGE_KEY,
                },
            },
            select: { value: true },
        }),
    ]);

    if (!company) {
        return {
            code: 404,
            error: true,
            message: 'Company not found',
        };
    }

    if (!event) {
        return {
            code: 404,
            error: true,
            message: 'Event not found',
        };
    }

    const locale = (localeConfig?.value || '').trim().toLowerCase() === 'en' ? 'en' : 'es';
    const deliveryMode: EventMassMessageDeliveryMode =
        payload.delivery_mode === 'WHATSAPP'
        || payload.delivery_mode === 'EMAIL'
        || payload.delivery_mode === 'BOTH'
            ? payload.delivery_mode
            : 'AUTO';
    const requestedTargets = Array.isArray(payload.selected_targets) ? payload.selected_targets : [];
    const selectedTargetKeys =
        requestedTargets.length > 0
            ? new Set(
                requestedTargets
                    .filter((target) => Number.isInteger(target.id) && target.id > 0)
                    .map((target) => `${target.source}:${target.id}`),
            )
            : null;

    const [bookings, freeRegistrations] = await Promise.all([
        prisma.groupEventBooking.findMany({
            where: {
                company_id: companyId,
                group_event_id: eventId,
                status: { in: [GroupBookingStatus.PENDING, GroupBookingStatus.CONFIRMED, GroupBookingStatus.WAITLISTED] },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone_prefix: true,
                        phoneNumber: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
        prisma.freeEventRegistration.findMany({
            where: {
                company_id: companyId,
                group_event_id: eventId,
                status: { in: ['PENDING', 'CONFIRMED'] },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone_prefix: true,
                        phoneNumber: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
    ]);

    const recipients = [
        ...bookings.map((booking) => ({
            source: 'GROUP_EVENT_BOOKING' as const,
            id: booking.id,
            email: normalizeEmail(booking.user?.email),
            phone: booking.user?.phoneNumber || null,
            phonePrefix: booking.user?.phone_prefix || null,
        })),
        ...freeRegistrations.map((registration) => ({
            source: 'FREE_REGISTRATION' as const,
            id: registration.id,
            email: normalizeEmail(registration.user?.email || registration.email),
            phone: registration.user?.phoneNumber || registration.phone_number,
            phonePrefix: registration.user?.phone_prefix || registration.phone_prefix,
        })),
    ].filter((recipient) =>
        selectedTargetKeys ? selectedTargetKeys.has(`${recipient.source}:${recipient.id}`) : true,
    );

    const seenWhatsappTargets = new Set<string>();
    const seenEmailTargets = new Set<string>();
    const failedTargets = new Map<string, { source: 'GROUP_EVENT_BOOKING' | 'FREE_REGISTRATION'; id: number; failed_channels: Set<EventMassMessageFailedChannel> }>();
    let whatsappSent = 0;
    let emailSent = 0;
    let noContact = 0;
    let failed = 0;
    let duplicatesSkipped = 0;
    let processed = 0;

    const whatsappText =
        locale === 'en'
            ? `${company.name} · ${event.title}\n\n${message}`
            : `${company.name} · ${event.title}\n\n${message}`;

    const emitProgress = async () => {
        if (!onProgress) return;
        await onProgress({
            total_recipients: recipients.length,
            processed,
            sent_total: whatsappSent + emailSent,
            sent_whatsapp: whatsappSent,
            sent_email: emailSent,
            skipped_no_contact: noContact,
            skipped_duplicates: duplicatesSkipped,
            failed,
        });
    };

    const markFailedTarget = (
        recipient: { source: 'GROUP_EVENT_BOOKING' | 'FREE_REGISTRATION'; id: number },
        channel: EventMassMessageFailedChannel,
    ) => {
        const key = `${recipient.source}:${recipient.id}`;
        const existing = failedTargets.get(key);
        if (existing) {
            existing.failed_channels.add(channel);
            return;
        }

        failedTargets.set(key, {
            source: recipient.source,
            id: recipient.id,
            failed_channels: new Set([channel]),
        });
    };

    logger.info(
        {
            event: 'group_event_mass_message_started',
            companyId,
            companyName: company.name,
            groupEventId: eventId,
            groupEventTitle: event.title,
            locale,
            totalRecipients: recipients.length,
            selectedRecipients: requestedTargets.length > 0 ? requestedTargets.length : null,
            deliveryMode,
            messageLength: message.length,
        },
        'Group event mass message started',
    );

    await emitProgress();

    for (const recipient of recipients) {
        const whatsappTarget = buildFullPhone(recipient.phonePrefix, recipient.phone);
        const emailTarget = normalizeEmail(recipient.email);
        const wantsWhatsapp = deliveryMode === 'AUTO' || deliveryMode === 'WHATSAPP' || deliveryMode === 'BOTH';
        const wantsEmail = deliveryMode === 'EMAIL' || deliveryMode === 'BOTH';
        let attemptedChannel = false;
        let hasSelectedContact = false;
        let whatsappFailedInAuto = false;

        if (wantsWhatsapp && whatsappTarget) {
            hasSelectedContact = true;

            if (seenWhatsappTargets.has(whatsappTarget)) {
                duplicatesSkipped += 1;
                logger.warn(
                    {
                        event: 'group_event_mass_message_duplicate_whatsapp',
                        companyId,
                        groupEventId: eventId,
                        recipientSource: recipient.source,
                        recipientId: recipient.id,
                        whatsappTarget,
                    },
                    'Skipping duplicate WhatsApp recipient in group event mass message',
                );
            } else {
                attemptedChannel = true;
                const waResult = await sendWhatsappText(whatsappTarget, whatsappText, { companyId });
                if (waResult !== -1) {
                    whatsappSent += 1;
                    seenWhatsappTargets.add(whatsappTarget);
                    logger.info(
                        {
                            event: 'group_event_mass_message_whatsapp_sent',
                            companyId,
                            groupEventId: eventId,
                            recipientSource: recipient.source,
                            recipientId: recipient.id,
                            whatsappTarget,
                            deliveryMode,
                            processed: processed + 1,
                            totalRecipients: recipients.length,
                        },
                        'Group event mass message sent by WhatsApp',
                    );
                    if (deliveryMode === 'AUTO') {
                        processed += 1;
                        await emitProgress();
                        continue;
                    }
                } else {
                    if (deliveryMode === 'AUTO') {
                        whatsappFailedInAuto = true;
                    } else {
                        failed += 1;
                        markFailedTarget(recipient, 'WHATSAPP');
                    }
                    logger.error(
                        {
                            event: 'group_event_mass_message_whatsapp_failed',
                            companyId,
                            groupEventId: eventId,
                            recipientSource: recipient.source,
                            recipientId: recipient.id,
                            whatsappTarget,
                            emailTarget,
                            deliveryMode,
                            processed: processed + 1,
                            totalRecipients: recipients.length,
                        },
                        'Group event mass message failed on WhatsApp send',
                    );
                }
            }
        }

        if (wantsEmail && emailTarget) {
            hasSelectedContact = true;

            if (seenEmailTargets.has(emailTarget)) {
                duplicatesSkipped += 1;
                logger.warn(
                    {
                        event: 'group_event_mass_message_duplicate_email',
                        companyId,
                        groupEventId: eventId,
                        recipientSource: recipient.source,
                        recipientId: recipient.id,
                        emailTarget,
                    },
                    'Skipping duplicate email recipient in group event mass message',
                );
            } else {
                attemptedChannel = true;
                const emailResult = await sendCustomerMassMessageEmail({
                    email: emailTarget,
                    companyName: company.name,
                    message,
                    locale,
                    companyId,
                });

                if (emailResult === 1) {
                    emailSent += 1;
                    seenEmailTargets.add(emailTarget);
                    logger.info(
                        {
                            event: 'group_event_mass_message_email_sent',
                            companyId,
                            groupEventId: eventId,
                            recipientSource: recipient.source,
                            recipientId: recipient.id,
                            emailTarget,
                            deliveryMode,
                            processed: processed + 1,
                            totalRecipients: recipients.length,
                        },
                        'Group event mass message sent by email',
                    );
                } else {
                    failed += 1;
                    markFailedTarget(recipient, 'EMAIL');
                    logger.error(
                        {
                            event: 'group_event_mass_message_email_failed',
                            companyId,
                            groupEventId: eventId,
                            recipientSource: recipient.source,
                            recipientId: recipient.id,
                            emailTarget,
                            whatsappTarget,
                            deliveryMode,
                            processed: processed + 1,
                            totalRecipients: recipients.length,
                        },
                        'Group event mass message failed on email send',
                    );
                }
            }
        }

        if (deliveryMode === 'AUTO' && whatsappFailedInAuto) {
            const emailSucceeded = emailTarget ? seenEmailTargets.has(emailTarget) : false;
            if (!emailSucceeded) {
                failed += 1;
                markFailedTarget(recipient, 'WHATSAPP');
            }
        }

        if (!attemptedChannel && !hasSelectedContact) {
            noContact += 1;
            logger.warn(
                {
                    event: 'group_event_mass_message_no_contact',
                    companyId,
                    groupEventId: eventId,
                    recipientSource: recipient.source,
                    recipientId: recipient.id,
                    deliveryMode,
                },
                'Group event mass message recipient had no contact for selected delivery mode',
            );
        }

        processed += 1;
        await emitProgress();
    }

    const totalSent = whatsappSent + emailSent;
    const failedTargetsList: EventMassMessageFailedTarget[] = Array.from(failedTargets.values()).map((target) => ({
        source: target.source,
        id: target.id,
        failed_channels: Array.from(target.failed_channels),
    }));
    logger.info(
        {
            event: 'group_event_mass_message_completed',
            companyId,
            companyName: company.name,
            groupEventId: eventId,
            groupEventTitle: event.title,
            locale,
            totalRecipients: recipients.length,
            totalSent,
            whatsappSent,
            emailSent,
            noContact,
            failed,
            duplicatesSkipped,
            messageLength: message.length,
            deliveryMode,
            failedTargets: failedTargetsList.length,
        },
        'Group event mass message completed',
    );

    return {
        code: 200,
        error: false,
        message: totalSent > 0 ? 'Mass message sent' : 'No messages sent',
        data: {
            total_customers: recipients.length,
            sent_total: totalSent,
            sent_whatsapp: whatsappSent,
            sent_email: emailSent,
            skipped_no_contact: noContact,
            skipped_duplicates: duplicatesSkipped,
            failed,
            failed_targets: failedTargetsList,
        },
    };
}

export async function sendEventMassMessage(
    companyId: number,
    eventId: number,
    payload: EventMassMessagePayload,
): Promise<ServiceResult> {
    return runEventMassMessage(companyId, eventId, payload);
}

export async function sendEventMassMessageWithProgress(
    companyId: number,
    eventId: number,
    payload: EventMassMessagePayload,
    onProgress: (progress: EventMassMessageProgress) => Promise<void> | void,
): Promise<ServiceResult> {
    return runEventMassMessage(companyId, eventId, payload, onProgress);
}

export async function listEventInterests(companyId: number, eventId: number): Promise<ServiceResult> {
    const event = await prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
        select: { id: true },
    });
    if (!event) {
        return { code: 404, error: true, message: 'Event not found' };
    }

    const [legacyInterests, freeRegistrationInterests] = await Promise.all([
        prisma.groupEventInterest.findMany({
            where: {
                company_id: companyId,
                group_event_id: eventId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
                customer_profile: {
                    select: {
                        id: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
        prisma.freeEventRegistration.findMany({
            where: {
                company_id: companyId,
                group_event_id: eventId,
                status: 'INTERESTED',
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
    ]);

    const mappedFreeRegistrationInterests = freeRegistrationInterests.map((registration) => {
        const fallbackUserId = `free-interest-${registration.id}`;
        const fallbackName = [registration.first_name, registration.last_name]
            .map((value) => value?.trim() ?? '')
            .filter((value) => value.length > 0)
            .join(' ');

        return {
            id: -registration.id,
            company_id: registration.company_id,
            group_event_id: registration.group_event_id,
            user_id: registration.user_id ?? fallbackUserId,
            customer_profile_id: null,
            created_at: registration.created_at,
            user: registration.user ?? {
                id: registration.user_id ?? fallbackUserId,
                name: fallbackName || null,
                email: registration.email,
                phoneNumber: registration.phone_number,
                phone_prefix: registration.phone_prefix,
            },
        };
    });

    const deduped = new Map<string, (typeof legacyInterests)[number] | (typeof mappedFreeRegistrationInterests)[number]>();
    [...legacyInterests, ...mappedFreeRegistrationInterests]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .forEach((row) => {
            const email = row.user?.email?.trim().toLowerCase();
            const key = row.user_id ? `uid:${row.user_id}` : (email ? `email:${email}` : `row:${row.id}`);
            if (!deduped.has(key)) {
                deduped.set(key, row);
            }
        });

    const interests = Array.from(deduped.values());

    return {
        code: 200,
        error: false,
        message: 'Interests retrieved',
        data: interests,
    };
}

/**
 * Admin: confirm a pending event booking.
 */
export async function confirmEventBooking(companyId: number, bookingId: number): Promise<ServiceResult> {
    const result = await prisma.$transaction(async (tx) => {
        const booking = await tx.groupEventBooking.findFirst({
            where: { id: bookingId, company_id: companyId },
            include: { group_event: true },
        });
        if (!booking) return { code: 404, error: true, message: 'Booking not found' } as ServiceResult;
        if (booking.status !== 'PENDING') {
            return { code: 400, error: true, message: `Cannot confirm a ${booking.status} booking` } as ServiceResult;
        }

        await lockEventRow(tx, companyId, booking.group_event_id);

        const confirmedCount = await tx.groupEventBooking.aggregate({
            where: {
                company_id: companyId,
                group_event_id: booking.group_event_id,
                status: 'CONFIRMED',
            },
            _sum: { booked_spots: true },
        });
        const usedCapacity = confirmedCount._sum.booked_spots ?? 0;
        const remaining = booking.group_event.max_capacity - usedCapacity;

        if (booking.booked_spots > remaining) {
            return {
                code: 409,
                error: true,
                message: `Cannot confirm booking. Only ${Math.max(remaining, 0)} spot(s) remaining`,
            } as ServiceResult;
        }

        await tx.groupEventBooking.update({
            where: { id: bookingId },
            data: { status: 'CONFIRMED' },
        });

        return { code: 200, error: false, message: 'Booking confirmed' } as ServiceResult;
    });

    if (result.error) {
        return result;
    }

    void issueEventTicketForBooking(companyId, bookingId).catch((error) => {
        logger.error({ companyId, bookingId, error }, 'Failed to issue event ticket on confirm');
    });

    return result;
}

export async function approveEventBookingQrPayment(companyId: number, bookingId: number): Promise<ServiceResult> {
    const result = await prisma.$transaction(async (tx) => {
        const booking = await tx.groupEventBooking.findFirst({
            where: { id: bookingId, company_id: companyId },
            include: { group_event: true },
        });
        if (!booking) return { code: 404, error: true, message: 'Booking not found' } as ServiceResult;
        if (booking.status === 'CANCELLED') {
            return { code: 400, error: true, message: 'Cannot approve a cancelled booking' } as ServiceResult;
        }
        if (booking.payment_method !== PaymentMethod.QR) {
            return { code: 400, error: true, message: 'Booking is not a QR payment booking' } as ServiceResult;
        }
        if (booking.payment_status !== PaymentStatus.PENDING_CONFIRMATION) {
            return { code: 400, error: true, message: `Cannot approve payment with status ${booking.payment_status}` } as ServiceResult;
        }
        if (booking.status !== GroupBookingStatus.PENDING) {
            return { code: 400, error: true, message: `Cannot approve a ${booking.status} booking` } as ServiceResult;
        }

        await lockEventRow(tx, companyId, booking.group_event_id);

        const confirmedCount = await tx.groupEventBooking.aggregate({
            where: {
                company_id: companyId,
                group_event_id: booking.group_event_id,
                status: 'CONFIRMED',
            },
            _sum: { booked_spots: true },
        });
        const usedCapacity = confirmedCount._sum.booked_spots ?? 0;
        const remaining = booking.group_event.max_capacity - usedCapacity;

        if (booking.booked_spots > remaining) {
            return {
                code: 409,
                error: true,
                message: `Cannot approve booking. Only ${Math.max(remaining, 0)} spot(s) remaining`,
            } as ServiceResult;
        }

        await tx.groupEventBooking.update({
            where: { id: bookingId },
            data: {
                payment_status: PaymentStatus.PAID,
                status: GroupBookingStatus.CONFIRMED,
            },
        });

        return { code: 200, error: false, message: 'QR payment approved and booking confirmed' } as ServiceResult;
    });

    if (result.error) {
        return result;
    }

    void issueEventTicketForBooking(companyId, bookingId).catch((error) => {
        logger.error({ companyId, bookingId, error }, 'Failed to issue event ticket after QR approval');
    });

    return result;
}

/**
 * Admin: move a confirmed booking back to pending review.
 * This frees a confirmed seat and can trigger waitlist notifications.
 */
export async function unconfirmEventBooking(companyId: number, bookingId: number): Promise<ServiceResult> {
    const booking = await prisma.groupEventBooking.findFirst({
        where: { id: bookingId, company_id: companyId },
        include: { group_event: true },
    });
    if (!booking) return { code: 404, error: true, message: 'Booking not found' };
    if (booking.status !== 'CONFIRMED') {
        return { code: 400, error: true, message: `Cannot unconfirm a ${booking.status} booking` };
    }

    await prisma.groupEventBooking.update({
        where: { id: bookingId },
        data: { status: 'PENDING' },
    });

    await cancelTicketsForEventBooking(companyId, bookingId);

    if (!booking.group_event.is_free) {
        await notifyWaitlistOfOpenSpot(companyId, booking.group_event_id);
    }

    return { code: 200, error: false, message: 'Booking moved back to pending' };
}

/**
 * Admin: cancel an event booking. If paid event → free a seat and trigger waitlist.
 */
export async function cancelEventBooking(companyId: number, bookingId: number): Promise<ServiceResult> {
    const booking = await prisma.groupEventBooking.findFirst({
        where: { id: bookingId, company_id: companyId },
        include: { group_event: true },
    });
    if (!booking) return { code: 404, error: true, message: 'Booking not found' };
    if (booking.status === 'CANCELLED') {
        return { code: 400, error: true, message: 'Booking is already cancelled' };
    }

    await prisma.groupEventBooking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED', cancelled_at: new Date() },
    });

    await cancelTicketsForEventBooking(companyId, bookingId);

    // Trigger waitlist notification if paid event + PRO plan
    if (!booking.group_event.is_free && booking.status === 'CONFIRMED') {
        await notifyWaitlistOfOpenSpot(companyId, booking.group_event_id);
    }

    return { code: 200, error: false, message: 'Booking cancelled' };
}

// ═══════════════════════════════════════════════════════════════════════════
// WAITLIST (PRO only, paid events only)
// ═══════════════════════════════════════════════════════════════════════════

export async function joinWaitlist(companyId: number, userId: string, eventId: number): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_ADVANCED');
    if (!canUse) {
        return { code: 403, error: true, message: 'Waitlist requires Pro plan' };
    }

    const event = await prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, status: 'PUBLISHED', deleted_at: null },
    });
    if (!event) return { code: 404, error: true, message: 'Event not found' };
    if (event.is_free) return { code: 400, error: true, message: 'Waitlist is only for paid events' };
    if (new Date() > event.end_at) return { code: 400, error: true, message: 'This event has already ended' };

    const confirmedCount = await prisma.groupEventBooking.aggregate({
        where: {
            company_id: companyId,
            group_event_id: eventId,
            status: 'CONFIRMED',
        },
        _sum: { booked_spots: true },
    });

    const usedCapacity = confirmedCount._sum.booked_spots ?? 0;
    if (usedCapacity < event.max_capacity) {
        return { code: 400, error: true, message: 'Event still has available seats' };
    }

    // Check if user already has an active booking or is already waitlisted
    const existing = await prisma.groupEventBooking.findFirst({
        where: {
            company_id: companyId,
            group_event_id: eventId,
            user_id: userId,
            status: { in: ['CONFIRMED', 'PENDING', 'WAITLISTED'] },
        },
    });
    if (existing) {
        return { code: 400, error: true, message: 'You already have an active booking or are on the waitlist' };
    }

    const customerProfile = await prisma.customerProfile.upsert({
        where: { company_id_user_id: { company_id: companyId, user_id: userId } },
        update: {},
        create: { company_id: companyId, user_id: userId },
    });

    const waitlistEntry = await prisma.groupEventBooking.create({
        data: {
            company_id: companyId,
            group_event_id: eventId,
            customer_profile_id: customerProfile.id,
            user_id: userId,
            status: 'WAITLISTED',
            booked_spots: 1,
            payment_method: 'NONE',
            payment_status: 'UNPAID',
            total_price_cents: event.price_cents,
        },
    });

    return { code: 201, error: false, message: 'Added to waitlist', data: waitlistEntry };
}

export async function leaveWaitlist(companyId: number, userId: string, eventId: number): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_ADVANCED');
    if (!canUse) {
        return { code: 403, error: true, message: 'Waitlist requires Pro plan' };
    }

    const waitlistEntry = await prisma.groupEventBooking.findFirst({
        where: {
            company_id: companyId,
            group_event_id: eventId,
            user_id: userId,
            status: 'WAITLISTED',
        },
    });

    if (!waitlistEntry) {
        return { code: 404, error: true, message: 'Waitlist entry not found' };
    }

    await prisma.groupEventBooking.delete({
        where: { id: waitlistEntry.id },
    });

    return { code: 200, error: false, message: 'Removed from waitlist' };
}

/**
 * Notify all waitlisted users that a spot has opened.
 * First successful booking takes the seat.
 */
async function notifyWaitlistOfOpenSpot(companyId: number, eventId: number): Promise<void> {
    try {
        const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_ADVANCED');
        if (!canUse) return;

        const event = await prisma.groupEvent.findFirst({
            where: { id: eventId, company_id: companyId },
            include: { company: { select: { name: true, slug: true } } },
        });
        if (!event) return;

        const waitlisted = await prisma.groupEventBooking.findMany({
            where: {
                company_id: companyId,
                group_event_id: eventId,
                status: 'WAITLISTED',
            },
            include: {
                user: {
                    select: {
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                        name: true,
                    },
                },
            },
            orderBy: { created_at: 'asc' },
        });

        if (waitlisted.length === 0) return;

        const settings = await prisma.companySettings.findUnique({
            where: { company_id: companyId },
            select: {
                send_email_notifications: true,
                send_whatsapp_notifications: true,
            },
        });

        const sendEmail = settings?.send_email_notifications ?? true;
        const sendWhatsapp = settings?.send_whatsapp_notifications ?? false;
        const bookingUrl = getEventBookingUrl(event.company.slug, event.id);

        const template = buildWaitlistSpotOpenedTemplate({
            eventTitle: event.title,
            companyName: event.company.name,
            eventStartAt: event.start_at,
            bookingUrl,
        });

        const deliveries = await Promise.allSettled(
            waitlisted.map(async (entry) => {
                let delivered = false;

                if (sendEmail && entry.user.email && !isTemporaryEmailAddress(entry.user.email)) {
                    const html = `<p>${template.text.replace(/\n/g, '<br/>')}</p>`;
                    await sendGenericEmail(entry.user.email, template.subject, html, { companyId });
                    delivered = true;
                }

                const fullPhone = buildFullPhone(entry.user.phone_prefix, entry.user.phoneNumber);
                if (sendWhatsapp && fullPhone) {
                    const result = await sendWhatsappText(fullPhone, template.text, { companyId });
                    if (result !== -1) {
                        delivered = true;
                    }
                }

                return delivered;
            }),
        );

        const deliveredCount = deliveries.filter(
            (result) => result.status === 'fulfilled' && result.value === true,
        ).length;
        const failedCount = deliveries.filter((result) => result.status === 'rejected').length;

        logger.info(
            {
                companyId,
                eventId,
                waitlistedCount: waitlisted.length,
                deliveredCount,
                failedCount,
            },
            'Waitlist notification batch completed',
        );
    } catch (error) {
        logger.error({ companyId, eventId, error }, 'Error notifying waitlist');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FREE EVENT INTEREST CAPTURE
// ═══════════════════════════════════════════════════════════════════════════

export async function captureEventInterest(companyId: number, userId: string, eventId: number): Promise<ServiceResult> {
    const result = await prisma.$transaction(async (tx) => {
        await lockEventRow(tx, companyId, eventId);

        const event = await tx.groupEvent.findFirst({
            where: { id: eventId, company_id: companyId, status: 'PUBLISHED', deleted_at: null },
        });
        if (!event) return { code: 404, error: true, message: 'Event not found' } as ServiceResult;
        if (!event.is_free) return { code: 400, error: true, message: 'Interest capture is only for free events' } as ServiceResult;
        if (new Date() > event.end_at) return { code: 400, error: true, message: 'This event has already ended' } as ServiceResult;

        const existingBooking = await tx.groupEventBooking.findFirst({
            where: {
                company_id: companyId,
                group_event_id: eventId,
                user_id: userId,
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
            select: { id: true, status: true },
        });
        if (existingBooking) {
            return { code: 409, error: true, message: 'You already have an active booking for this event' } as ServiceResult;
        }

        // Capture interest only while sold out based on confirmed spots.
        const bookedCount = await tx.groupEventBooking.aggregate({
            where: { company_id: companyId, group_event_id: eventId, status: 'CONFIRMED' },
            _sum: { booked_spots: true },
        });
        const currentlyBooked = bookedCount._sum.booked_spots ?? 0;
        if (currentlyBooked < event.max_capacity) {
            return { code: 409, error: true, message: 'Event is no longer sold out' } as ServiceResult;
        }

        const customerProfile = await tx.customerProfile.upsert({
            where: { company_id_user_id: { company_id: companyId, user_id: userId } },
            update: {},
            create: { company_id: companyId, user_id: userId },
        });

        const existingInterest = await tx.groupEventInterest.findUnique({
            where: {
                group_event_id_user_id: {
                    group_event_id: eventId,
                    user_id: userId,
                },
            },
        });

        if (existingInterest) {
            const interest = await tx.groupEventInterest.update({
                where: { id: existingInterest.id },
                data: {
                    customer_profile_id: existingInterest.customer_profile_id ?? customerProfile.id,
                },
            });
            return {
                code: 200,
                error: false,
                message: 'Interest already captured',
                data: {
                    ...interest,
                    already_interested: true,
                },
            } as ServiceResult;
        }

        const interest = await tx.groupEventInterest.create({
            data: {
                company_id: companyId,
                group_event_id: eventId,
                user_id: userId,
                customer_profile_id: customerProfile.id,
            },
        });
        return {
            code: 201,
            error: false,
            message: 'Interest captured',
            data: {
                ...interest,
                already_interested: false,
            },
        } as ServiceResult;
    });

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASS ENROLLMENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateClassEnrollmentInput {
    group_class_id: number;
    group_class_session_id?: number;
    payment_method: 'NONE' | 'CASH' | 'QR';
    qr_proof_image_url?: string | null;
}

/**
 * Enroll in a class (create a pass).
 */
export async function createClassEnrollment(
    companyId: number,
    userId: string,
    input: CreateClassEnrollmentInput,
): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_CLASSES');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group classes require Pro plan' };
    }

    const canCustomize = await isFeatureEnabledForCompany(companyId, 'BOOKING_FLOW_CUSTOMIZATION');

    const result = await prisma.$transaction(async (tx) => {
        await lockClassRow(tx, companyId, input.group_class_id);

        const gc = await tx.groupClass.findFirst({
            where: {
                id: input.group_class_id,
                company_id: companyId,
                status: GroupItemStatus.PUBLISHED,
                deleted_at: null,
            },
        });
        if (!gc) {
            return { code: 404, error: true, message: 'Class not found or not published' } as ServiceResult;
        }

        const now = new Date();

        // Check for existing active enrollment
        const existingActive = await tx.groupClassEnrollment.findFirst({
            where: {
                company_id: companyId,
                group_class_id: gc.id,
                user_id: userId,
                status: { in: ['CONFIRMED', 'PENDING'] },
                valid_until: { gte: now },
            },
        });
        if (existingActive) {
            return { code: 400, error: true, message: 'You already have an active pass for this class' } as ServiceResult;
        }

        let validFrom = now;
        let validUntil: Date;

        if (gc.pricing_mode === 'PER_SESSION') {
            if (!input.group_class_session_id) {
                return { code: 400, error: true, message: 'group_class_session_id is required for per-session classes' } as ServiceResult;
            }

            const session = await tx.groupClassSession.findFirst({
                where: {
                    id: input.group_class_session_id,
                    company_id: companyId,
                    group_class_id: gc.id,
                    cancelled_at: null,
                    start_at: { gte: now },
                },
                select: {
                    id: true,
                    start_at: true,
                    end_at: true,
                    max_capacity_override: true,
                },
            });
            if (!session) {
                return { code: 404, error: true, message: 'Session not found or not available for enrollment' } as ServiceResult;
            }

            const sessionCapacity = session.max_capacity_override ?? gc.max_capacity_per_session;
            const confirmedForSession = await tx.groupClassEnrollment.count({
                where: {
                    company_id: companyId,
                    group_class_id: gc.id,
                    status: 'CONFIRMED',
                    valid_from: { lte: session.start_at },
                    valid_until: { gte: session.start_at },
                },
            });
            if (confirmedForSession >= sessionCapacity) {
                return { code: 409, error: true, message: 'Selected session is sold out' } as ServiceResult;
            }

            validFrom = session.start_at;
            validUntil = session.end_at;
        } else if (gc.pricing_mode === 'WEEKLY_PASS') {
            validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        } else if (gc.pricing_mode === 'FULL_COURSE') {
            if (!gc.recurrence_end_date) {
                return { code: 400, error: true, message: 'This class does not have an end date configured' } as ServiceResult;
            }
            validUntil = new Date(gc.recurrence_end_date);
        } else {
            validUntil = new Date(now);
            validUntil.setMonth(validUntil.getMonth() + 1);
        }

        const settings = await tx.companySettings.findUnique({
            where: { company_id: companyId },
            select: { auto_confirm_bookings: true, require_comprobante_for_qr: true },
        });
        const autoConfirm = canCustomize ? (settings?.auto_confirm_bookings ?? true) : true;
        const requireComprobante = canCustomize ? (settings?.require_comprobante_for_qr ?? true) : true;

        const isFullCourse = gc.pricing_mode === 'FULL_COURSE';

        // For FULL_COURSE, payment is tracked per installment — no upfront payment required.
        if (!isFullCourse) {
            if (gc.price_cents > 0 && input.payment_method === 'NONE') {
                return { code: 400, error: true, message: 'Paid classes require a payment method' } as ServiceResult;
            }
            if (input.payment_method === 'QR' && requireComprobante && !input.qr_proof_image_url) {
                return { code: 400, error: true, message: 'QR payment proof is required' } as ServiceResult;
            }
        }

        let paymentStatus: PaymentStatus = PaymentStatus.UNPAID;
        if (isFullCourse) {
            paymentStatus = PaymentStatus.UNPAID; // installments govern actual payment
        } else if (gc.price_cents === 0) {
            paymentStatus = PaymentStatus.PAID;
        } else if (input.payment_method === 'QR') {
            paymentStatus = PaymentStatus.PENDING_CONFIRMATION;
        }

        const status: GroupBookingStatus = (isFullCourse || gc.price_cents === 0 || autoConfirm)
            ? GroupBookingStatus.CONFIRMED
            : GroupBookingStatus.PENDING;

        const customerProfile = await tx.customerProfile.upsert({
            where: { company_id_user_id: { company_id: companyId, user_id: userId } },
            update: {},
            create: { company_id: companyId, user_id: userId },
        });

        const enrollment = await tx.groupClassEnrollment.create({
            data: {
                company_id: companyId,
                group_class_id: gc.id,
                customer_profile_id: customerProfile.id,
                user_id: userId,
                pricing_mode: gc.pricing_mode,
                price_cents_snapshot: isFullCourse ? (gc.monthly_price_cents ?? 0) : gc.price_cents,
                status,
                payment_method: (isFullCourse || gc.price_cents === 0) ? PaymentMethod.NONE : (input.payment_method as PaymentMethod),
                payment_status: paymentStatus,
                qr_proof_image_url: isFullCourse ? null : (input.qr_proof_image_url ?? null),
                valid_from: validFrom,
                valid_until: validUntil,
            },
        });

        if (isFullCourse && gc.recurrence_end_date && gc.monthly_price_cents && gc.billing_day) {
            await generateInstallmentsForEnrollment(tx, {
                enrollmentId: enrollment.id,
                enrollmentDate: now,
                classEndDate: new Date(gc.recurrence_end_date),
                billingDay: gc.billing_day,
                amountCents: gc.monthly_price_cents,
            });
        }

        return {
            code: 201,
            error: false,
            message: status === 'CONFIRMED' ? 'Enrollment confirmed' : 'Enrollment pending confirmation',
            data: enrollment,
        } as ServiceResult;
    });

    if (!result.error && result.data && (result.data as { status?: GroupBookingStatus }).status === GroupBookingStatus.CONFIRMED) {
        const enrollmentId = (result.data as { id: number }).id;
        void issueClassTicketForEnrollment(companyId, enrollmentId).catch((error) => {
            logger.error(
                {
                    companyId,
                    enrollmentId,
                    error,
                },
                'Failed to issue class ticket after enrollment creation',
            );
        });
    }

    if (!result.error && result.data) {
        const enrollmentId = (result.data as { id: number }).id;
        void notifyInternalClassEnrollmentCreated(companyId, enrollmentId).catch((error) => {
            logger.error({ companyId, enrollmentId, error }, 'Failed to notify internal class enrollment recipients');
        });
    }

    return result;
}

export interface AdminCreateClassEnrollmentInput {
    customer_id?: number;
    new_member?: {
        name: string;
        email: string;
        phone: string;
    };
    payment_method: 'NONE' | 'CASH' | 'QR';
    mark_as_paid: boolean;
    qr_proof_image_url?: string | null;
    admin_user_id: string;
}

/**
 * Admin: create an enrollment for a customer on behalf of the business.
 * Bypasses the PUBLISHED status requirement and auto-confirms the enrollment.
 */
export async function adminCreateClassEnrollment(
    companyId: number,
    classId: number,
    input: AdminCreateClassEnrollmentInput,
): Promise<ServiceResult> {
    const gc = await prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
    });
    if (!gc) {
        return { code: 404, error: true, message: 'Class not found' };
    }

    let inviteContext: CustomerAccountInviteContext | null = null;
    let customerProfile: { id: number; user_id: string } | null = null;

    if (input.customer_id) {
        customerProfile = await prisma.customerProfile.findFirst({
            where: { id: input.customer_id, company_id: companyId, deleted_at: null },
            select: { id: true, user_id: true },
        });
        if (!customerProfile) {
            return { code: 404, error: true, message: 'Customer not found for this company' };
        }
    } else if (input.new_member) {
        const provisioned = await ensureCustomerProfileWithAccount({
            companyId,
            fullName: input.new_member.name,
            email: input.new_member.email,
            phone: input.new_member.phone,
        });

        if ('error' in provisioned && provisioned.error) {
            return {
                code: provisioned.code,
                error: true,
                message: provisioned.message,
            };
        }

        customerProfile = {
            id: provisioned.customerProfileId,
            user_id: provisioned.userId,
        };
        inviteContext = provisioned.inviteContext;
    } else {
        return { code: 400, error: true, message: 'customer_id or new_member is required' };
    }

    const now = new Date();

    const existingActive = await prisma.groupClassEnrollment.findFirst({
        where: {
            company_id: companyId,
            group_class_id: classId,
            user_id: customerProfile.user_id,
            status: { in: ['CONFIRMED', 'PENDING'] },
            valid_until: { gte: now },
        },
    });
    if (existingActive) {
        return { code: 400, error: true, message: 'This customer already has an active pass for this class' };
    }

    let validFrom = now;
    let validUntil: Date;

    if (gc.pricing_mode === 'PER_SESSION') {
        const nextSession = await prisma.groupClassSession.findFirst({
            where: { company_id: companyId, group_class_id: classId, cancelled_at: null, start_at: { gte: now } },
            orderBy: { start_at: 'asc' },
            select: { start_at: true, end_at: true },
        });
        if (nextSession) {
            validFrom = nextSession.start_at;
            validUntil = nextSession.end_at;
        } else {
            validUntil = gc.recurrence_end_date
                ? new Date(gc.recurrence_end_date)
                : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        }
    } else if (gc.pricing_mode === 'WEEKLY_PASS') {
        validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (gc.pricing_mode === 'FULL_COURSE') {
        if (!gc.recurrence_end_date) {
            return { code: 400, error: true, message: 'This class does not have an end date configured' };
        }
        validUntil = new Date(gc.recurrence_end_date);
    } else {
        validUntil = new Date(now);
        validUntil.setMonth(validUntil.getMonth() + 1);
    }

    const isFullCourse = gc.pricing_mode === 'FULL_COURSE';
    const canCustomize = await isFeatureEnabledForCompany(companyId, 'BOOKING_FLOW_CUSTOMIZATION');
    const settings = await prisma.companySettings.findUnique({
        where: { company_id: companyId },
        select: {
            allow_cash_payment: true,
            allow_qr_payment: true,
            require_comprobante_for_qr: true,
        },
    });
    const requireComprobante = canCustomize ? (settings?.require_comprobante_for_qr ?? true) : true;

    const selectedPaymentMethod = input.payment_method as PaymentMethod;
    const qrProofImageUrl = input.qr_proof_image_url?.trim() || null;
    const expectedAmountCents = isFullCourse ? (gc.monthly_price_cents ?? 0) : gc.price_cents;

    if (expectedAmountCents > 0 && input.mark_as_paid && selectedPaymentMethod === PaymentMethod.NONE) {
        return { code: 400, error: true, message: 'payment_method is required when mark_as_paid is enabled' };
    }

    if (selectedPaymentMethod === PaymentMethod.CASH && settings && !settings.allow_cash_payment) {
        return { code: 400, error: true, message: 'Cash payment is not enabled for this business' };
    }

    if (selectedPaymentMethod === PaymentMethod.QR && settings && !settings.allow_qr_payment) {
        return { code: 400, error: true, message: 'QR payment is not enabled for this business' };
    }

    if (selectedPaymentMethod === PaymentMethod.QR && requireComprobante && !qrProofImageUrl) {
        return { code: 400, error: true, message: 'QR payment proof is required' };
    }

    let enrollmentPaymentMethod: PaymentMethod = PaymentMethod.NONE;
    let enrollmentPaymentStatus: PaymentStatus = PaymentStatus.UNPAID;
    let enrollmentQrProofImageUrl: string | null = null;

    if (expectedAmountCents <= 0) {
        enrollmentPaymentStatus = PaymentStatus.PAID;
    } else if (input.mark_as_paid) {
        enrollmentPaymentMethod = selectedPaymentMethod;
        enrollmentPaymentStatus = PaymentStatus.PAID;
        enrollmentQrProofImageUrl = selectedPaymentMethod === PaymentMethod.QR ? qrProofImageUrl : null;
    } else if (selectedPaymentMethod === PaymentMethod.QR) {
        enrollmentPaymentMethod = PaymentMethod.QR;
        enrollmentPaymentStatus = PaymentStatus.PENDING_CONFIRMATION;
        enrollmentQrProofImageUrl = qrProofImageUrl;
    } else if (selectedPaymentMethod === PaymentMethod.CASH) {
        enrollmentPaymentMethod = PaymentMethod.CASH;
    }

    let shouldDeliverTicketNow = false;

    const result = await prisma.$transaction(async (tx) => {
        const enrollment = await tx.groupClassEnrollment.create({
            data: {
                company_id: companyId,
                group_class_id: classId,
                customer_profile_id: customerProfile.id,
                user_id: customerProfile.user_id,
                pricing_mode: gc.pricing_mode,
                price_cents_snapshot: isFullCourse ? (gc.monthly_price_cents ?? 0) : gc.price_cents,
                status: GroupBookingStatus.CONFIRMED,
                payment_method: enrollmentPaymentMethod,
                payment_status: enrollmentPaymentStatus,
                qr_proof_image_url: enrollmentQrProofImageUrl,
                valid_from: validFrom,
                valid_until: validUntil,
            },
        });

        if (isFullCourse && gc.recurrence_end_date && gc.monthly_price_cents && gc.billing_day) {
            await generateInstallmentsForEnrollment(tx, {
                enrollmentId: enrollment.id,
                enrollmentDate: now,
                classEndDate: new Date(gc.recurrence_end_date),
                billingDay: gc.billing_day,
                amountCents: gc.monthly_price_cents,
            });

            const firstInstallment = await tx.enrollmentInstallment.findFirst({
                where: { enrollment_id: enrollment.id },
                orderBy: { installment_number: 'asc' },
                select: { id: true },
            });

            if (firstInstallment) {
                if (expectedAmountCents <= 0) {
                    await tx.enrollmentInstallment.update({
                        where: { id: firstInstallment.id },
                        data: {
                            payment_status: PaymentStatus.PAID,
                            payment_method: PaymentMethod.NONE,
                            paid_at: now,
                            marked_paid_by_admin_id: input.admin_user_id,
                        },
                    });
                    shouldDeliverTicketNow = true;
                } else if (input.mark_as_paid) {
                    await tx.enrollmentInstallment.update({
                        where: { id: firstInstallment.id },
                        data: {
                            payment_status: PaymentStatus.PAID,
                            payment_method: selectedPaymentMethod,
                            qr_proof_image_url: selectedPaymentMethod === PaymentMethod.QR ? qrProofImageUrl : null,
                            paid_at: now,
                            marked_paid_by_admin_id: input.admin_user_id,
                        },
                    });
                    shouldDeliverTicketNow = true;
                } else if (selectedPaymentMethod === PaymentMethod.QR) {
                    await tx.enrollmentInstallment.update({
                        where: { id: firstInstallment.id },
                        data: {
                            payment_status: PaymentStatus.PENDING_CONFIRMATION,
                            payment_method: PaymentMethod.QR,
                            qr_proof_image_url: qrProofImageUrl,
                        },
                    });
                } else if (selectedPaymentMethod === PaymentMethod.CASH) {
                    await tx.enrollmentInstallment.update({
                        where: { id: firstInstallment.id },
                        data: {
                            payment_status: PaymentStatus.UNPAID,
                            payment_method: PaymentMethod.CASH,
                        },
                    });
                }
            }
        } else if (enrollmentPaymentStatus === PaymentStatus.PAID) {
            shouldDeliverTicketNow = true;
        }

        return {
            code: 201,
            error: false,
            message: 'Enrollment created by admin',
            data: enrollment,
        } as ServiceResult;
    });

    if (!result.error && result.data && shouldDeliverTicketNow) {
        const enrollmentId = (result.data as { id: number }).id;
        void issueClassTicketForEnrollment(companyId, enrollmentId).catch((error) => {
            logger.error({ companyId, enrollmentId, error }, 'Failed to issue class ticket after admin enrollment');
        });
    }

    if (!result.error && inviteContext) {
        void sendCustomerPortalInvite(inviteContext).catch((error) => {
            logger.error({ companyId, classId, inviteContext, error }, 'Failed to send customer portal invite after admin class enrollment');
        });
    }

    return result;
}

/**
 * Admin: list enrollments for a class.
 */
export async function listClassEnrollments(companyId: number, classId: number): Promise<ServiceResult> {
    const enrollments = await prisma.groupClassEnrollment.findMany({
        where: { company_id: companyId, group_class_id: classId },
        include: {
            user: { select: { id: true, name: true, email: true, phoneNumber: true } },
        },
        orderBy: { created_at: 'desc' },
    });
    return { code: 200, error: false, message: 'Enrollments retrieved', data: enrollments };
}

/**
 * Admin: confirm a pending enrollment.
 */
export async function confirmClassEnrollment(companyId: number, enrollmentId: number): Promise<ServiceResult> {
    const result = await prisma.$transaction(async (tx) => {
        const enrollment = await tx.groupClassEnrollment.findFirst({
            where: { id: enrollmentId, company_id: companyId },
            include: {
                group_class: {
                    select: {
                        id: true,
                        max_capacity_per_session: true,
                    },
                },
            },
        });
        if (!enrollment) return { code: 404, error: true, message: 'Enrollment not found' } as ServiceResult;
        if (enrollment.status !== 'PENDING') {
            return { code: 400, error: true, message: `Cannot confirm a ${enrollment.status} enrollment` } as ServiceResult;
        }

        await lockClassRow(tx, companyId, enrollment.group_class_id);

        if (enrollment.pricing_mode === 'PER_SESSION') {
            const session = await tx.groupClassSession.findFirst({
                where: {
                    company_id: companyId,
                    group_class_id: enrollment.group_class_id,
                    cancelled_at: null,
                    start_at: enrollment.valid_from,
                    end_at: enrollment.valid_until,
                },
                select: {
                    id: true,
                    start_at: true,
                    max_capacity_override: true,
                },
            });
            if (!session) {
                return { code: 404, error: true, message: 'Referenced session is no longer available' } as ServiceResult;
            }

            const capacity = session.max_capacity_override ?? enrollment.group_class.max_capacity_per_session;
            const confirmedForSession = await tx.groupClassEnrollment.count({
                where: {
                    company_id: companyId,
                    group_class_id: enrollment.group_class_id,
                    status: 'CONFIRMED',
                    valid_from: { lte: session.start_at },
                    valid_until: { gte: session.start_at },
                },
            });

            if (confirmedForSession >= capacity) {
                return { code: 409, error: true, message: 'Selected session is sold out' } as ServiceResult;
            }
        }

        await tx.groupClassEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'CONFIRMED' },
        });

        return { code: 200, error: false, message: 'Enrollment confirmed' } as ServiceResult;
    });

    if (result.error) {
        return result;
    }

    void issueClassTicketForEnrollment(companyId, enrollmentId).catch((error) => {
        logger.error({ companyId, enrollmentId, error }, 'Failed to issue class ticket on enrollment confirm');
    });

    return result;
}

export async function unconfirmClassEnrollment(companyId: number, enrollmentId: number): Promise<ServiceResult> {
    const enrollment = await prisma.groupClassEnrollment.findFirst({
        where: { id: enrollmentId, company_id: companyId },
    });
    if (!enrollment) return { code: 404, error: true, message: 'Enrollment not found' };
    if (enrollment.status !== 'CONFIRMED') {
        return { code: 400, error: true, message: `Cannot unconfirm a ${enrollment.status} enrollment` };
    }

    await prisma.groupClassEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'PENDING' },
    });

    await cancelTicketsForClassEnrollment(companyId, enrollmentId);

    return { code: 200, error: false, message: 'Enrollment moved back to pending' };
}

/**
 * Admin: cancel an enrollment.
 */
export async function cancelClassEnrollment(companyId: number, enrollmentId: number): Promise<ServiceResult> {
    const enrollment = await prisma.groupClassEnrollment.findFirst({
        where: { id: enrollmentId, company_id: companyId },
    });
    if (!enrollment) return { code: 404, error: true, message: 'Enrollment not found' };
    if (enrollment.status === 'CANCELLED') {
        return { code: 400, error: true, message: 'Enrollment is already cancelled' };
    }

    await prisma.groupClassEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'CANCELLED', cancelled_at: new Date() },
    });

    await cancelTicketsForClassEnrollment(companyId, enrollmentId);

    return { code: 200, error: false, message: 'Enrollment cancelled' };
}

/**
 * Admin: mark an enrollment's payment as PAID (approve QR proof or manual cash).
 */
export async function confirmClassEnrollmentPayment(companyId: number, enrollmentId: number): Promise<ServiceResult> {
    const enrollment = await prisma.groupClassEnrollment.findFirst({
        where: { id: enrollmentId, company_id: companyId },
    });
    if (!enrollment) return { code: 404, error: true, message: 'Enrollment not found' };
    if (enrollment.payment_status === 'PAID') {
        return { code: 400, error: true, message: 'Enrollment payment is already marked as paid' };
    }

    await prisma.groupClassEnrollment.update({
        where: { id: enrollmentId },
        data: { payment_status: 'PAID' },
    });

    void issueClassTicketForEnrollment(companyId, enrollmentId).catch((error) => {
        logger.error({ companyId, enrollmentId, error }, 'Failed to issue class ticket after payment confirmation');
    });

    return { code: 200, error: false, message: 'Enrollment payment confirmed' };
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER-FACING: My bookings / enrollments
// ═══════════════════════════════════════════════════════════════════════════

export async function getMyEventBookings(userId: string): Promise<ServiceResult> {
    const [bookings, user] = await Promise.all([
        prisma.groupEventBooking.findMany({
            where: { user_id: userId },
            include: {
                group_event: {
                    select: {
                        id: true, title: true, slug: true, start_at: true, end_at: true,
                        cover_image_url: true, thumbnail_url: true, is_free: true, location_text: true,
                        company: { select: { id: true, name: true, slug: true } },
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, phone_prefix: true, phoneNumber: true },
        }),
    ]);

    const normalizedEmail = user?.email?.trim().toLowerCase() || null;
    const phoneNumber = user?.phoneNumber?.trim();
    const phonePrefix = user?.phone_prefix?.trim();
    const phoneVariants = buildPhoneMatchVariants(phoneNumber, phonePrefix);
    const identityEmails = new Set<string>(normalizedEmail ? [normalizedEmail] : []);

    const orphanIdentityOr: Prisma.FreeEventRegistrationWhereInput[] = [];
    if (identityEmails.size > 0) {
        orphanIdentityOr.push({ email: { in: Array.from(identityEmails) } });
    }
    for (const variant of phoneVariants) {
        orphanIdentityOr.push({
            phone_number: variant.number,
            ...(variant.prefix ? { phone_prefix: variant.prefix } : {}),
        });
    }

    const freeRegistrations = await prisma.freeEventRegistration.findMany({
        where: {
            status: { in: ['CONFIRMED', 'PENDING'] },
            OR: [
                { user_id: userId },
                ...(orphanIdentityOr.length > 0
                    ? [{
                        user_id: null,
                        create_account_requested: true,
                        OR: orphanIdentityOr,
                    }]
                    : []),
            ],
        },
        include: {
            group_event: {
                select: {
                    id: true, title: true, slug: true, start_at: true, end_at: true,
                    cover_image_url: true, thumbnail_url: true, is_free: true, location_text: true,
                    company: { select: { id: true, name: true, slug: true } },
                },
            },
        },
        orderBy: { created_at: 'desc' },
    });

    const bookedEventIds = new Set(
        bookings
            .filter((booking) => booking.status === GroupBookingStatus.CONFIRMED || booking.status === GroupBookingStatus.PENDING)
            .map((booking) => booking.group_event_id),
    );
    const mappedFreeRegistrations = freeRegistrations
        .filter((registration) => {
            if (registration.user_id === userId) return true;
            if (registration.user_id) return false;
            if (!registration.create_account_requested) return false;
            return canSafelyMatchOrphanFreeRegistration({
                registrationEmail: registration.email,
                registrationPhonePrefix: registration.phone_prefix,
                registrationPhoneNumber: registration.phone_number,
                identityEmails,
                identityPhoneVariants: phoneVariants,
            });
        })
        .filter((registration) => !bookedEventIds.has(registration.group_event_id))
        .map((registration) => ({
            id: -registration.id,
            source: 'FREE_REGISTRATION',
            reservation_code: registration.reservation_code,
            company_id: registration.company_id,
            group_event_id: registration.group_event_id,
            customer_profile_id: null,
            user_id: registration.user_id ?? userId,
            status: registration.status === 'CONFIRMED' ? GroupBookingStatus.CONFIRMED : GroupBookingStatus.PENDING,
            booked_spots: 1,
            payment_method: PaymentMethod.NONE,
            payment_status: PaymentStatus.PAID,
            qr_proof_image_url: null,
            total_price_cents: 0,
            extra_attendees_json: null,
            notes: null,
            created_at: registration.created_at,
            updated_at: registration.updated_at,
            cancelled_at: null,
            group_event: registration.group_event,
        }));

    const allBookings = [...bookings, ...mappedFreeRegistrations].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return { code: 200, error: false, message: 'Bookings retrieved', data: allBookings };
}

export async function getMyClassEnrollments(userId: string): Promise<ServiceResult> {
    const enrollments = await prisma.groupClassEnrollment.findMany({
        where: { user_id: userId },
        include: {
            group_class: {
                select: {
                    id: true, title: true, slug: true, pricing_mode: true,
                    cover_image_url: true, thumbnail_url: true, location_text: true,
                    company: { select: { id: true, name: true, slug: true } },
                },
            },
            tickets: {
                where: { status: { in: ['ACTIVE', 'USED'] } },
                orderBy: { created_at: 'desc' },
                take: 1,
                select: {
                    id: true,
                    ticket_code: true,
                    status: true,
                    valid_from: true,
                    valid_until: true,
                    issued_at: true,
                    company_id: true,
                },
            },
        },
        orderBy: { created_at: 'desc' },
    });

    const { buildGroupTicketQrToken, buildGroupTicketQrImageUrl } = await import('./group-ticket-qr.service');

    const data = enrollments.map((enrollment) => {
        const ticket = enrollment.tickets[0] ?? null;
        return {
            ...enrollment,
            tickets: undefined,
            ticket: ticket
                ? {
                    ...ticket,
                    qr_token: buildGroupTicketQrToken(ticket.company_id, ticket.ticket_code, ticket.issued_at),
                    qr_image_url: buildGroupTicketQrImageUrl(
                        buildGroupTicketQrToken(ticket.company_id, ticket.ticket_code, ticket.issued_at),
                    ),
                }
                : null,
        };
    });

    return { code: 200, error: false, message: 'Enrollments retrieved', data };
}
