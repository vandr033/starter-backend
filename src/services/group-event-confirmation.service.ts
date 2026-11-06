import crypto from 'crypto';
import {
    CompanyUserRole,
    EventAttendanceStatus,
    FreeEventRegistrationStatus,
    GroupBookingStatus,
    Prisma,
    TicketStatus,
} from '@prisma/client';
import { logger } from '../config/logger';
import { prisma } from '../prisma/client';
import { isEmailDeliverySuccessful } from './notification-provider.service';
import { isTemporaryEmailAddress, sendGenericEmail } from '../utils/sendEmail';
import { isWhatsappEnqueueAccepted, queueWhatsappText } from '../utils/whatsappSender';

type Locale = 'es' | 'en';
type Transaction = Prisma.TransactionClient;
type ConfirmationRecipient = {
    name: string;
    email: string | null;
    phone: string | null;
    token: string;
    reservationCode?: string | null;
};

const CONFIRMATION_URL_ACTIONS = ['confirm', 'decline'] as const;

function frontendBaseUrl(): string {
    return (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function getEventConfirmationLinks(slug: string, eventId: number, token: string) {
    const page = `${frontendBaseUrl()}/shop/${encodeURIComponent(slug)}/events/${eventId}/confirmation`;
    return {
        event: `${frontendBaseUrl()}/shop/${encodeURIComponent(slug)}/events/${eventId}`,
        confirm: `${page}?token=${encodeURIComponent(token)}&action=${CONFIRMATION_URL_ACTIONS[0]}`,
        decline: `${page}?token=${encodeURIComponent(token)}&action=${CONFIRMATION_URL_ACTIONS[1]}`,
    };
}

function localeFor(value?: string | null): Locale {
    return value?.trim().toLowerCase() === 'en' ? 'en' : 'es';
}

async function getLocale(companyId: number): Promise<Locale> {
    const config = await prisma.configMessage.findUnique({
        where: { company_id_key: { company_id: companyId, key: 'default_language' } },
        select: { value: true },
    });
    return localeFor(config?.value);
}

function fullPhone(prefix?: string | null, phone?: string | null): string | null {
    const value = (phone ?? '').trim();
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (!digits) return null;
    if (value.startsWith('+')) return digits;
    const prefixDigits = (prefix ?? '591').replace(/\D/g, '');
    return `${prefixDigits}${digits}` || null;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendConfirmationInvites(
    companyId: number,
    event: { id: number; title: string; start_at: Date; company: { slug: string } },
    recipients: ConfirmationRecipient[],
    locale?: Locale,
): Promise<void> {
    if (recipients.length === 0) return;
    const [settings, resolvedLocale] = await Promise.all([
        prisma.companySettings.findUnique({
            where: { company_id: companyId },
            select: { send_email_notifications: true, send_whatsapp_notifications: true },
        }),
        locale ? Promise.resolve(locale) : getLocale(companyId),
    ]);
    const sendEmail = settings?.send_email_notifications ?? true;
    const sendWhatsapp = settings?.send_whatsapp_notifications ?? false;

    await Promise.allSettled(recipients.map(async (recipient) => {
        const links = getEventConfirmationLinks(event.company.slug, event.id, recipient.token);
        const message = resolvedLocale === 'en'
            ? [
                `Can you attend ${event.title}? Please let us know.`,
                recipient.reservationCode ? `Reservation code: ${recipient.reservationCode}` : null,
                `Confirm: ${links.confirm}`,
                `Decline: ${links.decline}`,
                `Event details: ${links.event}`,
            ].filter(Boolean).join('\n')
            : [
                `¿Podrás asistir a ${event.title}? Por favor avísanos.`,
                recipient.reservationCode ? `Código de reserva: ${recipient.reservationCode}` : null,
                `Confirmar asistencia: ${links.confirm}`,
                `No podré asistir: ${links.decline}`,
                `Detalles del evento: ${links.event}`,
            ].filter(Boolean).join('\n');
        const subject = resolvedLocale === 'en'
            ? `Can you attend? ${event.title}`
            : `Confirma tu asistencia: ${event.title}`;
        const greeting = resolvedLocale === 'en' ? `Hi ${recipient.name},` : `Hola ${recipient.name},`;
        const confirmLabel = resolvedLocale === 'en' ? 'Yes, I will attend' : 'Sí, asistiré';
        const declineLabel = resolvedLocale === 'en' ? 'I cannot attend' : 'No podré asistir';
        const codeLine = recipient.reservationCode
            ? `<p>${resolvedLocale === 'en' ? 'Reservation code' : 'Código de reserva'}: <strong>${escapeHtml(recipient.reservationCode)}</strong></p>`
            : '';
        const html = `<p>${escapeHtml(greeting)}</p><p>${resolvedLocale === 'en' ? 'Please respond for' : 'Por favor responde para'} <strong>${escapeHtml(event.title)}</strong>.</p>${codeLine}<p><a href="${escapeHtml(links.confirm)}">${confirmLabel}</a></p><p><a href="${escapeHtml(links.decline)}">${declineLabel}</a></p><p><a href="${escapeHtml(links.event)}">${resolvedLocale === 'en' ? 'Event details' : 'Detalles del evento'}</a></p>`;

        if (sendEmail && recipient.email && !isTemporaryEmailAddress(recipient.email)) {
            try {
                const result = await sendGenericEmail(recipient.email, subject, html, { companyId });
                if (!isEmailDeliverySuccessful(result)) {
                    logger.warn({ companyId, eventId: event.id, reason: result.reason }, 'Event confirmation email was not delivered');
                }
            } catch (error) {
                logger.warn({ companyId, eventId: event.id, error }, 'Event confirmation email failed');
            }
        }
        const phone = recipient.phone?.replace(/\D/g, '') || null;
        if (sendWhatsapp && phone) {
            try {
                const result = await queueWhatsappText(phone, message, {
                    companyId,
                    sourceType: 'GROUP_EVENT_CONFIRMATION',
                    sourceId: recipient.token,
                    dedupeKey: `event-confirmation:${event.id}:${recipient.token}`,
                    expiresAt: event.start_at,
                });
                if (!isWhatsappEnqueueAccepted(result)) {
                    logger.warn({ companyId, eventId: event.id, reason: result.reason }, 'Event confirmation WhatsApp was not queued');
                }
            } catch (error) {
                logger.warn({ companyId, eventId: event.id, error }, 'Event confirmation WhatsApp failed');
            }
        }
    }));
}

type PaidAttendeeInput = {
    seat_number: number;
    full_name: string;
    email: string | null;
    phone: string | null;
    confirmation_token: string;
    confirmation_status: 'PENDING';
};

async function ensurePaidAttendees(tx: Transaction, bookingId: number): Promise<ConfirmationRecipient[]> {
    const booking = await tx.groupEventBooking.findUnique({
        where: { id: bookingId },
        include: {
            user: { select: { name: true, email: true, phoneNumber: true, phone_prefix: true } },
            group_event: { include: { company: { select: { slug: true } } } },
        },
    });
    if (!booking || !booking.group_event.confirmations_enabled || !['CONFIRMED', 'PENDING'].includes(booking.status)) return [];

    const existing = await tx.groupEventAttendee.findMany({
        where: { group_event_booking_id: bookingId },
        select: { seat_number: true },
    });
    const existingSeats = new Set(existing.map((row) => row.seat_number));
    const extras = Array.isArray(booking.extra_attendees_json)
        ? booking.extra_attendees_json as Array<{ full_name?: string; email?: string | null; phone?: string | null }>
        : [];
    const attendees: PaidAttendeeInput[] = [];
    for (let seat = 1; seat <= booking.booked_spots; seat += 1) {
        if (existingSeats.has(seat)) continue;
        const extra = extras[seat - 2];
        attendees.push({
            seat_number: seat,
            full_name: seat === 1 ? booking.user.name : extra?.full_name?.trim() || `Attendee ${seat}`,
            email: seat === 1 ? booking.user.email : extra?.email?.trim() || null,
            phone: seat === 1
                ? fullPhone(booking.user.phone_prefix, booking.user.phoneNumber)
                : fullPhone(booking.user.phone_prefix, extra?.phone) || null,
            confirmation_token: crypto.randomBytes(32).toString('hex'),
            confirmation_status: EventAttendanceStatus.PENDING,
        });
    }
    if (attendees.length) {
        await tx.groupEventAttendee.createMany({
            data: attendees.map((attendee) => ({
                ...attendee,
                company_id: booking.company_id,
                group_event_id: booking.group_event_id,
                group_event_booking_id: booking.id,
            })),
            skipDuplicates: true,
        });
    }
    const rows = await tx.groupEventAttendee.findMany({
        where: { group_event_booking_id: bookingId },
        select: { full_name: true, email: true, phone: true, confirmation_token: true },
        orderBy: { seat_number: 'asc' },
    });
    return rows.map((row) => ({ name: row.full_name, email: row.email, phone: row.phone, token: row.confirmation_token }));
}

export async function ensurePaidBookingAttendees(bookingId: number): Promise<void> {
    await prisma.$transaction((tx) => ensurePaidAttendees(tx, bookingId));
}

export async function sendPaidBookingConfirmationInvites(companyId: number, bookingId: number): Promise<void> {
    const recipients = await prisma.$transaction((tx) => ensurePaidAttendees(tx, bookingId));
    if (recipients.length === 0) return;
    const event = await prisma.groupEvent.findFirst({
        where: { bookings: { some: { id: bookingId, company_id: companyId } } },
        select: { id: true, title: true, start_at: true, company: { select: { slug: true } } },
    });
    if (event) await sendConfirmationInvites(companyId, event, recipients);
}

export async function enableEventAttendanceConfirmations(companyId: number, eventId: number) {
    const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM group_event WHERE id = ${eventId} AND company_id = ${companyId} FOR UPDATE`;
        const event = await tx.groupEvent.findFirst({
            where: { id: eventId, company_id: companyId, deleted_at: null },
            select: { id: true, title: true, start_at: true, confirmations_enabled: true, company: { select: { slug: true } } },
        });
        if (!event) return { error: true as const, code: 404, message: 'Event not found' };
        if (event.confirmations_enabled) return { error: false as const, code: 200, alreadyEnabled: true, event, recipients: [] as ConfirmationRecipient[] };
        await tx.groupEvent.update({ where: { id: eventId }, data: { confirmations_enabled: true } });

        const registrations = await tx.freeEventRegistration.findMany({
            where: { company_id: companyId, group_event_id: eventId, status: { in: ['CONFIRMED', 'PENDING'] } },
            select: { id: true, first_name: true, email: true, phone_prefix: true, phone_number: true, reservation_code: true, confirmation_token: true },
        });
        const freeRecipients: ConfirmationRecipient[] = [];
        for (const registration of registrations) {
            const token = registration.confirmation_token || crypto.randomBytes(32).toString('hex');
            await tx.freeEventRegistration.update({
                where: { id: registration.id },
                data: {
                    confirmation_token: token,
                    confirmation_status: EventAttendanceStatus.PENDING,
                    confirmation_reason: null,
                    confirmation_responded_at: null,
                },
            });
            freeRecipients.push({
                name: registration.first_name,
                email: registration.email,
                phone: fullPhone(registration.phone_prefix, registration.phone_number),
                token,
                reservationCode: registration.reservation_code,
            });
        }

        const bookings = await tx.groupEventBooking.findMany({
            where: { company_id: companyId, group_event_id: eventId, status: { in: [GroupBookingStatus.CONFIRMED, GroupBookingStatus.PENDING] } },
            select: { id: true },
        });
        const paidRecipients = (await Promise.all(bookings.map((booking) => ensurePaidAttendees(tx, booking.id)))).flat();
        return { error: false as const, code: 200, alreadyEnabled: false, event, recipients: [...freeRecipients, ...paidRecipients] };
    });

    if (result.error) return result;
    if (!result.alreadyEnabled) await sendConfirmationInvites(companyId, result.event, result.recipients);
    return {
        code: 200,
        error: false,
        message: result.alreadyEnabled ? 'Attendance confirmations are already enabled' : 'Attendance confirmations enabled',
        data: { confirmations_enabled: true, invited: result.recipients.length },
    };
}

export async function getEventAttendanceConfirmation(token: string) {
    const free = await prisma.freeEventRegistration.findFirst({
        where: { confirmation_token: token },
        select: {
            first_name: true, last_name: true, confirmation_status: true,
            group_event: { select: { id: true, title: true, start_at: true, end_at: true, is_free: true, company: { select: { id: true, slug: true } } } },
        },
    });
    if (free) {
        return {
            code: 200, error: false, message: 'Confirmation retrieved',
            data: {
                attendee_name: `${free.first_name} ${free.last_name}`.trim(),
                confirmation_status: free.confirmation_status,
                event: { id: free.group_event.id, title: free.group_event.title, start_at: free.group_event.start_at, end_at: free.group_event.end_at, is_free: true, slug: free.group_event.company.slug },
                locale: await getLocale(free.group_event.company.id),
            },
        };
    }
    const attendee = await prisma.groupEventAttendee.findFirst({
        where: { confirmation_token: token },
        select: {
            full_name: true, confirmation_status: true,
            event_booking: { select: { status: true } },
            group_event: { select: { id: true, title: true, start_at: true, end_at: true, is_free: true, company: { select: { id: true, slug: true } } } },
        },
    });
    if (!attendee) return { code: 404, error: true, message: 'Confirmation link not found' };
    return {
        code: 200, error: false, message: 'Confirmation retrieved',
        data: {
            attendee_name: attendee.full_name,
            confirmation_status: attendee.confirmation_status,
            event: { id: attendee.group_event.id, title: attendee.group_event.title, start_at: attendee.group_event.start_at, end_at: attendee.group_event.end_at, is_free: attendee.group_event.is_free, slug: attendee.group_event.company.slug },
            locale: await getLocale(attendee.group_event.company.id),
            booking_status: attendee.event_booking.status,
        },
    };
}

async function generateFreeReservationCode(tx: Transaction): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = String(crypto.randomInt(100_000, 1_000_000));
        const [registration, ticket] = await Promise.all([
            tx.freeEventRegistration.findFirst({ where: { reservation_code: candidate }, select: { id: true } }),
            tx.groupTicket.findFirst({ where: { ticket_code: candidate }, select: { id: true } }),
        ]);
        if (!registration && !ticket) return candidate;
    }
    throw new Error('Could not generate a free-event reservation code');
}

async function promoteFreeWaitlist(tx: Transaction, eventId: number): Promise<ConfirmationRecipient | null> {
    const registration = await tx.freeEventRegistration.findFirst({
        where: { group_event_id: eventId, status: FreeEventRegistrationStatus.INTERESTED },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    if (!registration) return null;
    const token = crypto.randomBytes(32).toString('hex');
    const reservationCode = await generateFreeReservationCode(tx);
    await tx.freeEventRegistration.update({
        where: { id: registration.id },
        data: {
            status: FreeEventRegistrationStatus.CONFIRMED,
            reservation_code: reservationCode,
            confirmation_token: token,
            confirmation_status: EventAttendanceStatus.PENDING,
            confirmation_reason: null,
            confirmation_responded_at: null,
        },
    });
    return {
        name: registration.first_name,
        email: registration.email,
        phone: fullPhone(registration.phone_prefix, registration.phone_number),
        token,
        reservationCode,
    };
}

async function sendDeclineAlert(input: {
    companyId: number;
    eventId: number;
    eventTitle: string;
    eventSlug: string;
    attendeeName: string;
    reason: string | null;
    attendeeId: number;
}): Promise<void> {
    const [admins, settings, locale] = await Promise.all([
        prisma.companyUser.findMany({
            where: { company_id: input.companyId, role: { in: [CompanyUserRole.OWNER, CompanyUserRole.ADMIN] }, deleted_at: null },
            select: { user: { select: { email: true, phoneNumber: true, phone_prefix: true } } },
        }),
        prisma.companySettings.findUnique({
            where: { company_id: input.companyId },
            select: { send_email_notifications: true, send_whatsapp_notifications: true },
        }),
        getLocale(input.companyId),
    ]);
    const eventUrl = `${frontendBaseUrl()}/shop/${encodeURIComponent(input.eventSlug)}/events/${input.eventId}`;
    const manageUrl = `${frontendBaseUrl()}/admin/dashboard/group-reservations/events/${input.eventId}`;
    const text = locale === 'en'
        ? `${input.attendeeName} won't be able to attend ${input.eventTitle}.${input.reason ? ` Reason: ${input.reason}` : ''}\nEvent details: ${eventUrl}\nManage event: ${manageUrl}`
        : `${input.attendeeName} no podrá asistir a ${input.eventTitle}.${input.reason ? ` Motivo: ${input.reason}` : ''}\nDetalles del evento: ${eventUrl}\nAdministrar evento: ${manageUrl}`;
    const subject = locale === 'en' ? `Attendee declined: ${input.eventTitle}` : `Un asistente no podrá ir: ${input.eventTitle}`;
    const html = `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p><p><a href="${escapeHtml(manageUrl)}">${locale === 'en' ? 'Open event management' : 'Abrir administración del evento'}</a></p>`;
    const deliveries: Promise<unknown>[] = [];
    for (const admin of admins) {
        const email = admin.user.email?.trim();
        if ((settings?.send_email_notifications ?? true) && email && !isTemporaryEmailAddress(email)) {
            deliveries.push(sendGenericEmail(email, subject, html, { companyId: input.companyId }).then((result) => {
                if (!isEmailDeliverySuccessful(result)) logger.warn({ companyId: input.companyId, reason: result.reason }, 'Event decline alert email was not delivered');
            }));
        }
        const phone = fullPhone(admin.user.phone_prefix, admin.user.phoneNumber);
        if ((settings?.send_whatsapp_notifications ?? false) && phone) {
            deliveries.push(queueWhatsappText(phone, text, {
                companyId: input.companyId,
                sourceType: 'GROUP_EVENT_ATTENDEE_DECLINED',
                sourceId: String(input.attendeeId),
                dedupeKey: `event-declined:${input.attendeeId}:${phone}`,
            }).then((result) => {
                if (!isWhatsappEnqueueAccepted(result)) logger.warn({ companyId: input.companyId, reason: result.reason }, 'Event decline alert WhatsApp was not queued');
            }));
        }
    }
    const outcomes = await Promise.allSettled(deliveries);
    for (const outcome of outcomes) if (outcome.status === 'rejected') logger.warn({ companyId: input.companyId, error: outcome.reason }, 'Event decline alert failed');
}

export async function submitEventAttendanceConfirmation(
    token: string,
    action: 'ATTENDING' | 'NOT_ATTENDING',
    reason?: string | null,
) {
    const response = await prisma.$transaction(async (tx) => {
        const free = await tx.freeEventRegistration.findFirst({ where: { confirmation_token: token }, include: { group_event: { include: { company: { select: { id: true, slug: true } } } } } });
        if (free) {
            await tx.$queryRaw`SELECT id FROM group_event WHERE id = ${free.group_event_id} AND company_id = ${free.company_id} FOR UPDATE`;
            const current = await tx.freeEventRegistration.findUnique({ where: { id: free.id } });
            if (!current) return { error: true as const, code: 404, message: 'Confirmation link not found' };
            if (current.status !== FreeEventRegistrationStatus.CONFIRMED && current.status !== FreeEventRegistrationStatus.PENDING) {
                return { error: true as const, code: 409, message: 'This registration is no longer active' };
            }
            if (current.confirmation_status !== EventAttendanceStatus.PENDING) {
                if (current.confirmation_status === action) return { error: false as const, alreadyResponded: true, decline: action === 'NOT_ATTENDING' };
                return { error: true as const, code: 409, message: 'You have already responded to this invitation' };
            }
            if (free.group_event.start_at <= new Date()) return { error: true as const, code: 409, message: 'This event has already started' };
            await tx.freeEventRegistration.update({
                where: { id: free.id },
                data: { confirmation_status: action, confirmation_reason: action === 'NOT_ATTENDING' ? reason?.trim() || null : null, confirmation_responded_at: new Date() },
            });
            const promoted = action === 'NOT_ATTENDING' ? await promoteFreeWaitlist(tx, free.group_event_id) : null;
            return {
                error: false as const,
                alreadyResponded: false,
                decline: action === 'NOT_ATTENDING',
                companyId: free.company_id,
                event: { id: free.group_event.id, title: free.group_event.title, start_at: free.group_event.start_at, company: free.group_event.company },
                attendeeId: free.id,
                attendeeName: `${free.first_name} ${free.last_name}`.trim(),
                reason: action === 'NOT_ATTENDING' ? reason?.trim() || null : null,
                promoted,
            };
        }

        const attendee = await tx.groupEventAttendee.findFirst({
            where: { confirmation_token: token },
            include: { group_event: { include: { company: { select: { id: true, slug: true } } } }, event_booking: true },
        });
        if (!attendee) return { error: true as const, code: 404, message: 'Confirmation link not found' };
        await tx.$queryRaw`SELECT id FROM group_event WHERE id = ${attendee.group_event_id} AND company_id = ${attendee.company_id} FOR UPDATE`;
        const current = await tx.groupEventAttendee.findUnique({ where: { id: attendee.id } });
        if (!current) return { error: true as const, code: 404, message: 'Confirmation link not found' };
        if (current.confirmation_status !== EventAttendanceStatus.PENDING) {
            if (current.confirmation_status === action) return { error: false as const, alreadyResponded: true, decline: action === 'NOT_ATTENDING' };
            return { error: true as const, code: 409, message: 'You have already responded to this invitation' };
        }
        if (attendee.event_booking.status !== GroupBookingStatus.CONFIRMED && attendee.event_booking.status !== GroupBookingStatus.PENDING) {
            return { error: true as const, code: 409, message: 'This booking is no longer active' };
        }
        if (attendee.group_event.start_at <= new Date()) return { error: true as const, code: 409, message: 'This event has already started' };
        await tx.groupEventAttendee.update({
            where: { id: attendee.id },
            data: { confirmation_status: action, confirmation_reason: action === 'NOT_ATTENDING' ? reason?.trim() || null : null, confirmation_responded_at: new Date() },
        });
        if (action === 'NOT_ATTENDING') {
            await tx.groupEventBooking.update({ where: { id: attendee.group_event_booking_id }, data: { declined_spots: { increment: 1 } } });
            await tx.groupTicket.updateMany({
                where: { group_event_booking_id: attendee.group_event_booking_id, seat_number: attendee.seat_number, status: TicketStatus.ACTIVE },
                data: { status: TicketStatus.CANCELLED, cancelled_at: new Date() },
            });
        }
        return {
            error: false as const,
            alreadyResponded: false,
            decline: action === 'NOT_ATTENDING',
            companyId: attendee.company_id,
            event: { id: attendee.group_event.id, title: attendee.group_event.title, start_at: attendee.group_event.start_at, company: attendee.group_event.company },
            attendeeId: attendee.id,
            attendeeName: attendee.full_name,
            reason: action === 'NOT_ATTENDING' ? reason?.trim() || null : null,
        };
    });

    if (response.error) return response;
    if (response.alreadyResponded) return { code: 200, error: false, message: 'Your response is already saved', data: { confirmation_status: action } };
    if (response.decline && response.companyId !== undefined && response.event && response.attendeeName !== undefined && response.reason !== undefined && response.attendeeId !== undefined) {
        try {
            await sendDeclineAlert({
                companyId: response.companyId,
                eventId: response.event.id,
                eventTitle: response.event.title,
                eventSlug: response.event.company.slug,
                attendeeName: response.attendeeName,
                reason: response.reason,
                attendeeId: response.attendeeId,
            });
        } catch (error) {
            logger.error({ companyId: response.companyId, eventId: response.event.id, error }, 'Failed to notify event owners about an attendee decline');
        }
        if ('promoted' in response && response.promoted) {
            try {
                await sendConfirmationInvites(response.companyId, response.event, [response.promoted]);
            } catch (error) {
                logger.error({ companyId: response.companyId, eventId: response.event.id, error }, 'Failed to invite promoted free-event waitlist attendee');
            }
        } else if (!('promoted' in response)) {
            try {
                await offerPaidWaitlistSpots(response.companyId, response.event.id);
            } catch (error) {
                logger.error({ companyId: response.companyId, eventId: response.event.id, error }, 'Failed to offer declined paid-event seat to waitlist');
            }
        }
    }
    return {
        code: 200,
        error: false,
        message: action === 'ATTENDING' ? 'Attendance confirmed' : 'Decline saved',
        data: { confirmation_status: action },
    };
}

export async function offerPaidWaitlistSpots(companyId: number, eventId: number): Promise<void> {
    const offers = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM group_event WHERE id = ${eventId} AND company_id = ${companyId} FOR UPDATE`;
        const event = await tx.groupEvent.findFirst({
            where: { id: eventId, company_id: companyId, is_free: false, deleted_at: null },
            select: { id: true, title: true, start_at: true, max_capacity: true, company: { select: { slug: true, name: true } } },
        });
        if (!event) return { event: null, recipients: [] as Array<{ id: number; email: string; phone: string | null }>, expiresAt: null as Date | null };
        const now = new Date();
        await tx.groupEventBooking.updateMany({
            where: { company_id: companyId, group_event_id: eventId, status: GroupBookingStatus.WAITLISTED, waitlist_offer_expires_at: { lte: now } },
            data: { status: GroupBookingStatus.CANCELLED, cancelled_at: now },
        });
        if (event.start_at <= now) return { event: null, recipients: [] as Array<{ id: number; email: string; phone: string | null }>, expiresAt: null as Date | null };
        const [activeBookings, activeOffers] = await Promise.all([
            tx.groupEventBooking.findMany({
                where: { company_id: companyId, group_event_id: eventId, status: GroupBookingStatus.CONFIRMED },
                select: { booked_spots: true, declined_spots: true },
            }),
            tx.groupEventBooking.count({
                where: { company_id: companyId, group_event_id: eventId, status: GroupBookingStatus.WAITLISTED, waitlist_offer_expires_at: { gt: now } },
            }),
        ]);
        const used = activeBookings.reduce((sum, row) => sum + Math.max(row.booked_spots - row.declined_spots, 0), 0);
        const slots = Math.max(event.max_capacity - used - activeOffers, 0);
        if (!slots) return { event, recipients: [] as Array<{ id: number; email: string; phone: string | null }>, expiresAt: null as Date | null };
        const waitlisted = await tx.groupEventBooking.findMany({
            where: { company_id: companyId, group_event_id: eventId, status: GroupBookingStatus.WAITLISTED, waitlist_offer_expires_at: null },
            include: { user: { select: { email: true, phoneNumber: true, phone_prefix: true } } },
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
            take: slots,
        });
        const expiresAt = new Date(Math.min(now.getTime() + 24 * 60 * 60 * 1000, event.start_at.getTime()));
        const recipients: Array<{ id: number; email: string; phone: string | null }> = [];
        for (const entry of waitlisted) {
            await tx.groupEventBooking.update({ where: { id: entry.id }, data: { waitlist_offer_expires_at: expiresAt } });
            recipients.push({ id: entry.id, email: entry.user.email, phone: fullPhone(entry.user.phone_prefix, entry.user.phoneNumber) });
        }
        return { event, recipients, expiresAt };
    });

    if (!offers.event || offers.recipients.length === 0) return;
    const [settings, locale] = await Promise.all([
        prisma.companySettings.findUnique({ where: { company_id: companyId }, select: { send_email_notifications: true, send_whatsapp_notifications: true } }),
        getLocale(companyId),
    ]);
    const bookingUrl = `${frontendBaseUrl()}/shop/${encodeURIComponent(offers.event.company.slug)}/events/${eventId}`;
    const message = locale === 'en'
        ? `A place is available for ${offers.event.title}. Claim and pay within 24 hours or before the event starts: ${bookingUrl}\nEvent details: ${bookingUrl}`
        : `Hay un espacio disponible para ${offers.event.title}. Confirma y paga dentro de 24 horas o antes de que empiece el evento: ${bookingUrl}\nDetalles del evento: ${bookingUrl}`;
    const subject = locale === 'en' ? `A spot opened for ${offers.event.title}` : `Se liberó un espacio para ${offers.event.title}`;
    const claimLabel = locale === 'en' ? 'Claim this spot and pay' : 'Reclamar este cupo y pagar';
    const html = `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p><p><a href="${escapeHtml(bookingUrl)}">${claimLabel}</a></p>`;
    await Promise.allSettled(offers.recipients.map(async (recipient) => {
        if ((settings?.send_email_notifications ?? true) && recipient.email && !isTemporaryEmailAddress(recipient.email)) {
            const result = await sendGenericEmail(recipient.email, subject, html, { companyId });
            if (!isEmailDeliverySuccessful(result)) logger.warn({ companyId, eventId, reason: result.reason }, 'Paid event waitlist offer email was not delivered');
        }
        if ((settings?.send_whatsapp_notifications ?? false) && recipient.phone) {
            const result = await queueWhatsappText(recipient.phone, message, {
                companyId,
                sourceType: 'EVENT_WAITLIST_OFFER',
                sourceId: String(recipient.id),
                dedupeKey: `event-waitlist-offer:${recipient.id}`,
                expiresAt: offers.expiresAt ?? undefined,
            });
            if (!isWhatsappEnqueueAccepted(result)) logger.warn({ companyId, eventId, reason: result.reason }, 'Paid event waitlist offer WhatsApp was not queued');
        }
    }));
}

let waitlistWorker: NodeJS.Timeout | null = null;

export function startEventWaitlistOfferWorker(): void {
    if (waitlistWorker) return;
    const run = () => {
        void (async () => {
            const expired = await prisma.groupEventBooking.findMany({
                where: { status: GroupBookingStatus.WAITLISTED, waitlist_offer_expires_at: { lte: new Date() } },
                select: { company_id: true, group_event_id: true },
                distinct: ['company_id', 'group_event_id'],
                take: 100,
            });
            await Promise.all(expired.map((row) => offerPaidWaitlistSpots(row.company_id, row.group_event_id)));
        })().catch((error) => logger.error({ error }, 'Event waitlist offer worker failed'));
    };
    run();
    waitlistWorker = setInterval(run, 60_000);
    waitlistWorker.unref();
}

export function stopEventWaitlistOfferWorker(): void {
    if (waitlistWorker) clearInterval(waitlistWorker);
    waitlistWorker = null;
}
