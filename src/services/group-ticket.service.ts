import { randomInt } from 'crypto';
import { Prisma, TicketStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../config/logger';
import { MensajeApi } from '../types/MensajeApi';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';
import { buildGroupTicketQrImageUrl, buildGroupTicketQrToken } from './group-ticket-qr.service';
import { isTemporaryEmailAddress, sendGenericEmail } from '../utils/sendEmail';
import { sendWhatsappImage, sendWhatsappText } from '../utils/whatsappSender';

type ServiceResult = MensajeApi & { data?: unknown };

const MAX_TICKET_CODE_ATTEMPTS = 40;

export function generateSixDigitTicketCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function generateUniqueSixDigitCode(params: {
    exists: (candidate: string) => Promise<boolean>;
    maxAttempts?: number;
    candidateFactory?: () => string;
}): Promise<string> {
    const attempts = params.maxAttempts ?? MAX_TICKET_CODE_ATTEMPTS;
    const candidateFactory = params.candidateFactory ?? generateSixDigitTicketCode;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const candidate = candidateFactory();
        if (candidate.length !== 6) continue;
        if (!await params.exists(candidate)) return candidate;
    }

    throw new Error('Unable to generate a unique ticket code');
}

async function generateUniqueTicketCode(): Promise<string> {
    return generateUniqueSixDigitCode({
        exists: async (candidate) => {
            const existing = await prisma.groupTicket.findUnique({
                where: { ticket_code: candidate },
                select: { id: true },
            });
            return Boolean(existing);
        },
    });
}

async function canUseTickets(companyId: number): Promise<boolean> {
    return isFeatureEnabledForCompany(companyId, 'GROUP_ADVANCED');
}

function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = (phone ?? '').replace(/\D/g, '');
    if (!cleanPhone) return null;

    const cleanPrefix = (prefix ?? '591').replace(/\D/g, '');
    return `${cleanPrefix}${cleanPhone}`;
}

function getCustomerPortalUrl(companySlug?: string | null): string {
    const base = (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    if (companySlug) {
        return `${base}/me/group-reservations?shop=${encodeURIComponent(companySlug)}`;
    }
    return `${base}/me/group-reservations`;
}

async function sendTicketNotification(companyId: number, ticketId: number, options?: {
    isResend?: boolean;
}): Promise<{ sent: boolean; channels: string[] }> {
    const ticket = await prisma.groupTicket.findFirst({
        where: {
            id: ticketId,
            company_id: companyId,
        },
        include: {
            event_booking: {
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
                    group_event: {
                        include: {
                            company: {
                                select: { id: true, name: true, slug: true },
                            },
                        },
                    },
                },
            },
            class_enrollment: {
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
                    group_class: {
                        include: {
                            company: {
                                select: { id: true, name: true, slug: true },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!ticket || ticket.status === TicketStatus.CANCELLED || ticket.status === TicketStatus.EXPIRED) {
        return { sent: false, channels: [] };
    }

    const settings = await prisma.companySettings.findUnique({
        where: { company_id: companyId },
        select: {
            send_email_notifications: true,
            send_whatsapp_notifications: true,
        },
    });

    const sendEmail = settings?.send_email_notifications ?? true;
    const sendWhatsapp = settings?.send_whatsapp_notifications ?? false;

    const isEventTicket = Boolean(ticket.group_event_booking_id && ticket.event_booking);
    const isClassTicket = Boolean(ticket.group_class_enrollment_id && ticket.class_enrollment);

    if (!isEventTicket && !isClassTicket) {
        return { sent: false, channels: [] };
    }

    const company = isEventTicket ? ticket.event_booking!.group_event.company : ticket.class_enrollment!.group_class.company;
    const user = isEventTicket ? ticket.event_booking!.user : ticket.class_enrollment!.user;
    const itemTitle = isEventTicket ? ticket.event_booking!.group_event.title : ticket.class_enrollment!.group_class.title;
    const qrToken = buildGroupTicketQrToken(ticket.company_id, ticket.ticket_code, ticket.issued_at);
    const qrImageUrl = buildGroupTicketQrImageUrl(qrToken);
    const portalUrl = getCustomerPortalUrl(company.slug);

    const formatDate = (d: Date) => d.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    });

    const emailSubject = isEventTicket
        ? `${options?.isResend ? 'Your ticket was re-sent' : 'Your ticket'}: ${itemTitle}`
        : `${options?.isResend ? 'Your class pass ticket was re-sent' : 'Your class pass ticket'}: ${itemTitle}`;

    let emailHtml: string;
    let whatsappCaption: string;

    if (isEventTicket) {
        const validLabel = `${formatDate(ticket.valid_from)} → ${formatDate(ticket.valid_until)}`;

        whatsappCaption = [
            company.name,
            `Your event ticket ${options?.isResend ? 'was re-sent' : 'is ready'}: ${itemTitle}`,
            `Ticket code: ${ticket.ticket_code}`,
            `Validity: ${validLabel}`,
            `Show this QR code at the event entrance to check in.`,
            `Manage reservations: ${portalUrl}`,
        ].join('\n');

        emailHtml = `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a; max-width: 640px; margin: 0 auto; padding: 20px;">
                <h2 style="margin-top: 0;">Event ticket</h2>
                <p>${options?.isResend ? 'We have re-sent your ticket details.' : 'Your ticket is ready.'}</p>
                <p><strong>Business:</strong> ${company.name}</p>
                <p><strong>Event:</strong> ${itemTitle}</p>
                <p><strong>Ticket code:</strong> ${ticket.ticket_code}</p>
                <p><strong>Validity:</strong> ${validLabel}</p>
                <p><strong>Your QR code:</strong></p>
                <p style="margin: 10px 0 16px;">
                    <img src="${qrImageUrl}" alt="Ticket QR code" style="display:block; width: 260px; max-width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #ffffff;" />
                </p>
                <p style="background:#f1f5f9; border-left:4px solid #3b82f6; padding:10px 14px; border-radius:4px; margin: 16px 0;">
                    📋 <strong>How to check in:</strong> Show this QR code at the event entrance. Staff will scan it to confirm your entry.
                </p>
                <p><a href="${portalUrl}" target="_blank" rel="noopener noreferrer">View my reservations</a></p>
            </div>
        `;
    } else {
        const groupClass = ticket.class_enrollment!.group_class;
        const validFrom = formatDate(ticket.valid_from);
        const validUntil = formatDate(ticket.valid_until);
        const sessionTime = groupClass.start_time ?? null;
        const location = groupClass.location_text ?? null;

        const scheduleLines: string[] = [];
        if (sessionTime) scheduleLines.push(`Session time: ${sessionTime}`);
        if (location) scheduleLines.push(`Location: ${location}`);
        scheduleLines.push(`Pass valid: ${validFrom} – ${validUntil}`);

        whatsappCaption = [
            company.name,
            `Your class pass ${options?.isResend ? 'was re-sent' : 'is ready'}: ${itemTitle}`,
            `Ticket code: ${ticket.ticket_code}`,
            ...scheduleLines,
            `✅ Check-in: Show this QR code to staff at the start of each class session. It will be scanned to confirm your attendance.`,
            `Manage reservations: ${portalUrl}`,
        ].join('\n');

        const scheduleHtml = [
            sessionTime ? `<p><strong>Session time:</strong> ${sessionTime}</p>` : '',
            location ? `<p><strong>Location:</strong> ${location}</p>` : '',
        ].join('');

        emailHtml = `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a; max-width: 640px; margin: 0 auto; padding: 20px;">
                <h2 style="margin-top: 0;">Class pass ticket</h2>
                <p>${options?.isResend ? 'We have re-sent your ticket details.' : 'Your class pass is ready. Save this QR code — you will need it at every session.'}</p>
                <p><strong>Business:</strong> ${company.name}</p>
                <p><strong>Class:</strong> ${itemTitle}</p>
                ${scheduleHtml}
                <p><strong>Pass valid:</strong> ${validFrom} – ${validUntil}</p>
                <p><strong>Ticket code:</strong> <span style="font-family: monospace; font-size: 1.1em; letter-spacing: 0.1em;">${ticket.ticket_code}</span></p>
                <p><strong>Your QR code:</strong></p>
                <p style="margin: 10px 0 16px;">
                    <img src="${qrImageUrl}" alt="Class QR code" style="display:block; width: 260px; max-width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #ffffff;" />
                </p>
                <div style="background:#f0fdf4; border-left:4px solid #22c55e; padding:12px 16px; border-radius:4px; margin: 16px 0;">
                    <p style="margin:0 0 6px 0;"><strong>✅ How to check in at each session:</strong></p>
                    <ol style="margin:0; padding-left:20px;">
                        <li>Open this email (or your reservations portal) and show this QR code to the staff.</li>
                        <li>Staff will scan your code to confirm your attendance.</li>
                        <li>Repeat at every class session — your QR code stays the same for the entire pass period.</li>
                    </ol>
                </div>
                <p><a href="${portalUrl}" target="_blank" rel="noopener noreferrer">View my class reservations</a></p>
            </div>
        `;
    }

    const whatsappFallbackText = `${whatsappCaption}\nQR image: ${qrImageUrl}`;

    const successfulChannels: string[] = [];

    if (sendEmail && user.email && !isTemporaryEmailAddress(user.email)) {
        try {
            await sendGenericEmail(user.email, emailSubject, emailHtml, { companyId });
            successfulChannels.push('EMAIL');
        } catch (error) {
            logger.error(
                { companyId, ticketId, error },
                'Failed sending group ticket email',
            );
        }
    }

    const phoneTarget = buildFullPhone(user.phone_prefix, user.phoneNumber);
    if (sendWhatsapp && phoneTarget) {
        const imageResult = await sendWhatsappImage(phoneTarget, qrImageUrl, whatsappCaption, { companyId });
        if (imageResult !== -1) {
            successfulChannels.push('WHATSAPP');
        } else {
            const textResult = await sendWhatsappText(phoneTarget, whatsappFallbackText, { companyId });
            if (textResult !== -1) {
                successfulChannels.push('WHATSAPP');
            } else {
                logger.error(
                    { companyId, ticketId, phoneTarget },
                    'Failed sending group ticket WhatsApp message',
                );
            }
        }
    }

    if (successfulChannels.length === 0) {
        return { sent: false, channels: [] };
    }

    await prisma.groupTicket.update({
        where: { id: ticket.id },
        data: {
            last_sent_at: new Date(),
            delivery_count: { increment: 1 },
            ...(options?.isResend ? { resend_count: { increment: 1 } } : {}),
        },
    });

    return { sent: true, channels: successfulChannels };
}

function mapTicketWithQr<T extends { company_id: number; ticket_code: string; issued_at: Date }>(ticket: T): T & { qr_token: string } {
    return {
        ...ticket,
        qr_token: buildGroupTicketQrToken(ticket.company_id, ticket.ticket_code, ticket.issued_at),
    };
}

type EventExtraAttendeeStored = {
    full_name: string;
    email: string | null;
    phone: string | null;
};

function parseEventExtraAttendees(raw: Prisma.JsonValue | null | undefined): EventExtraAttendeeStored[] {
    if (!raw || !Array.isArray(raw)) return [];

    const rows: EventExtraAttendeeStored[] = [];
    for (const item of raw) {
        if (typeof item !== 'object' || item === null) continue;
        const record = item as Record<string, unknown>;
        const fullName = typeof record.full_name === 'string' ? record.full_name.trim() : '';
        if (!fullName) continue;

        rows.push({
            full_name: fullName,
            email: typeof record.email === 'string' && record.email.trim() ? record.email.trim() : null,
            phone: typeof record.phone === 'string' && record.phone.trim() ? record.phone.trim() : null,
        });
    }

    return rows;
}

export async function issueEventTicketForBooking(companyId: number, bookingId: number): Promise<ServiceResult> {
    if (!(await canUseTickets(companyId))) {
        return { code: 403, error: true, message: 'Tickets require Pro plan' };
    }

    const booking = await prisma.groupEventBooking.findFirst({
        where: {
            id: bookingId,
            company_id: companyId,
            status: 'CONFIRMED',
        },
        include: {
            user: {
                select: {
                    name: true,
                    email: true,
                    phoneNumber: true,
                },
            },
            group_event: {
                select: {
                    start_at: true,
                    end_at: true,
                },
            },
            tickets: {
                where: { status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] } },
                orderBy: { created_at: 'asc' },
            },
        },
    });

    if (!booking) {
        return { code: 404, error: true, message: 'Confirmed event booking not found' };
    }

    const targetTicketCount = Math.max(1, booking.booked_spots);
    const extraAttendees = parseEventExtraAttendees(booking.extra_attendees_json as Prisma.JsonValue | null);
    const holderBySeat = new Map<number, { name: string | null; email: string | null; phone: string | null }>();

    holderBySeat.set(1, {
        name: booking.user.name?.trim() || null,
        email: booking.user.email?.trim() || null,
        phone: booking.user.phoneNumber?.trim() || null,
    });
    for (let seat = 2; seat <= targetTicketCount; seat += 1) {
        const extra = extraAttendees[seat - 2];
        holderBySeat.set(seat, {
            name: extra?.full_name ?? null,
            email: extra?.email ?? null,
            phone: extra?.phone ?? null,
        });
    }

    const createdTickets = await prisma.$transaction(async (tx) => {
        const currentTickets = await tx.groupTicket.findMany({
            where: {
                company_id: companyId,
                group_event_booking_id: booking.id,
                status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
            },
            orderBy: { created_at: 'asc' },
        });

        const seatToTicket = new Map<number, (typeof currentTickets)[number]>();
        const unseated: (typeof currentTickets)[number][] = [];

        for (const ticket of currentTickets) {
            if (
                ticket.seat_number
                && ticket.seat_number >= 1
                && ticket.seat_number <= targetTicketCount
                && !seatToTicket.has(ticket.seat_number)
            ) {
                seatToTicket.set(ticket.seat_number, ticket);
            } else {
                unseated.push(ticket);
            }
        }

        const availableSeats: number[] = [];
        for (let seat = 1; seat <= targetTicketCount; seat += 1) {
            if (!seatToTicket.has(seat)) {
                availableSeats.push(seat);
            }
        }

        for (const [seat, ticket] of seatToTicket.entries()) {
            const holder = holderBySeat.get(seat);
            const nextName = holder?.name ?? null;
            const nextEmail = holder?.email ?? null;
            const nextPhone = holder?.phone ?? null;
            if (
                ticket.holder_name !== nextName
                || ticket.holder_email !== nextEmail
                || ticket.holder_phone !== nextPhone
            ) {
                await tx.groupTicket.update({
                    where: { id: ticket.id },
                    data: {
                        holder_name: nextName,
                        holder_email: nextEmail,
                        holder_phone: nextPhone,
                    },
                });
            }
        }

        const assignableCount = Math.min(unseated.length, availableSeats.length);
        for (let idx = 0; idx < assignableCount; idx += 1) {
            const ticket = unseated[idx];
            const seat = availableSeats[idx];
            const holder = holderBySeat.get(seat);

            await tx.groupTicket.update({
                where: { id: ticket.id },
                data: {
                    seat_number: seat,
                    holder_name: holder?.name ?? null,
                    holder_email: holder?.email ?? null,
                    holder_phone: holder?.phone ?? null,
                },
            });
            seatToTicket.set(seat, ticket);
        }

        const remainingSeats: number[] = [];
        for (let seat = 1; seat <= targetTicketCount; seat += 1) {
            if (!seatToTicket.has(seat)) {
                remainingSeats.push(seat);
            }
        }

        const rows: Awaited<ReturnType<typeof tx.groupTicket.create>>[] = [];
        for (const seat of remainingSeats) {
            const holder = holderBySeat.get(seat);
            const created = await tx.groupTicket.create({
                data: {
                    company_id: companyId,
                    group_event_booking_id: booking.id,
                    ticket_code: await generateUniqueTicketCode(),
                    seat_number: seat,
                    holder_name: holder?.name ?? null,
                    holder_email: holder?.email ?? null,
                    holder_phone: holder?.phone ?? null,
                    status: TicketStatus.ACTIVE,
                    valid_from: booking.group_event.start_at,
                    valid_until: booking.group_event.end_at,
                },
            });
            rows.push(created);
        }

        return rows;
    });

    if (createdTickets[0]) {
        void sendTicketNotification(companyId, createdTickets[0].id).catch((error) => {
            logger.error(
                { companyId, bookingId, ticketId: createdTickets[0].id, error },
                'Failed sending event ticket notification',
            );
        });
    }

    const allTickets = await prisma.groupTicket.findMany({
        where: {
            company_id: companyId,
            group_event_booking_id: booking.id,
            status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
        },
        orderBy: [
            { seat_number: 'asc' },
            { created_at: 'asc' },
        ],
    });

    return {
        code: createdTickets.length > 0 ? 201 : 200,
        error: false,
        message: createdTickets.length === 0
            ? 'Tickets already exist'
            : createdTickets.length === 1
                ? 'Event ticket issued'
                : `${createdTickets.length} event tickets issued`,
        data: allTickets.map((ticket) => mapTicketWithQr(ticket)),
    };
}

export async function issueClassTicketForEnrollment(companyId: number, enrollmentId: number): Promise<ServiceResult> {
    if (!(await canUseTickets(companyId))) {
        return { code: 403, error: true, message: 'Tickets require Pro plan' };
    }

    const enrollment = await prisma.groupClassEnrollment.findFirst({
        where: {
            id: enrollmentId,
            company_id: companyId,
            status: 'CONFIRMED',
        },
        include: {
            tickets: {
                where: { status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] } },
                orderBy: { created_at: 'desc' },
                take: 1,
            },
        },
    });

    if (!enrollment) {
        return { code: 404, error: true, message: 'Confirmed class enrollment not found' };
    }

    const existingTicket = enrollment.tickets[0];
    if (existingTicket) {
        return { code: 200, error: false, message: 'Ticket already exists', data: mapTicketWithQr(existingTicket) };
    }

    let classSessionId: number | null = null;
    if (enrollment.pricing_mode === 'PER_SESSION') {
        const matchedSession = await prisma.groupClassSession.findFirst({
            where: {
                company_id: companyId,
                group_class_id: enrollment.group_class_id,
                cancelled_at: null,
                start_at: enrollment.valid_from,
                end_at: enrollment.valid_until,
            },
            select: { id: true },
        });
        classSessionId = matchedSession?.id ?? null;
    }

    const ticket = await prisma.groupTicket.create({
        data: {
            company_id: companyId,
            group_class_enrollment_id: enrollment.id,
            group_class_session_id: classSessionId,
            ticket_code: await generateUniqueTicketCode(),
            status: TicketStatus.ACTIVE,
            valid_from: enrollment.valid_from,
            valid_until: enrollment.valid_until,
        },
    });

    void sendTicketNotification(companyId, ticket.id).catch((error) => {
        logger.error({ companyId, ticketId: ticket.id, error }, 'Failed sending class ticket notification');
    });

    return { code: 201, error: false, message: 'Class pass ticket issued', data: mapTicketWithQr(ticket) };
}

export async function resendTicketByCode(companyId: number, ticketCode: string): Promise<ServiceResult> {
    if (!(await canUseTickets(companyId))) {
        return { code: 403, error: true, message: 'Tickets require Pro plan' };
    }

    const ticket = await prisma.groupTicket.findFirst({
        where: {
            company_id: companyId,
            ticket_code: ticketCode,
        },
    });

    if (!ticket) {
        return { code: 404, error: true, message: 'Ticket not found' };
    }

    if (ticket.status === TicketStatus.CANCELLED || ticket.status === TicketStatus.EXPIRED) {
        return { code: 400, error: true, message: `Cannot resend a ${ticket.status.toLowerCase()} ticket` };
    }

    const delivery = await sendTicketNotification(companyId, ticket.id, { isResend: true });
    if (!delivery.sent) {
        return { code: 400, error: true, message: 'Ticket could not be delivered. Verify customer contact info and notification settings.' };
    }

    return {
        code: 200,
        error: false,
        message: 'Ticket re-sent',
        data: {
            ticket_code: ticket.ticket_code,
            channels: delivery.channels,
        },
    };
}

export async function cancelTicketByCode(companyId: number, ticketCode: string): Promise<ServiceResult> {
    if (!(await canUseTickets(companyId))) {
        return { code: 403, error: true, message: 'Tickets require Pro plan' };
    }

    const ticket = await prisma.groupTicket.findFirst({
        where: {
            company_id: companyId,
            ticket_code: ticketCode,
        },
    });

    if (!ticket) {
        return { code: 404, error: true, message: 'Ticket not found' };
    }

    if (ticket.status === TicketStatus.CANCELLED) {
        return { code: 400, error: true, message: 'Ticket is already cancelled' };
    }

    const updated = await prisma.groupTicket.update({
        where: { id: ticket.id },
        data: {
            status: TicketStatus.CANCELLED,
            cancelled_at: new Date(),
        },
    });

    return {
        code: 200,
        error: false,
        message: 'Ticket cancelled',
        data: mapTicketWithQr(updated),
    };
}

export async function cancelTicketsForEventBooking(companyId: number, bookingId: number): Promise<void> {
    await prisma.groupTicket.updateMany({
        where: {
            company_id: companyId,
            group_event_booking_id: bookingId,
            status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
        },
        data: {
            status: TicketStatus.CANCELLED,
            cancelled_at: new Date(),
        },
    });
}

export async function cancelTicketsForClassEnrollment(companyId: number, enrollmentId: number): Promise<void> {
    await prisma.groupTicket.updateMany({
        where: {
            company_id: companyId,
            group_class_enrollment_id: enrollmentId,
            status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
        },
        data: {
            status: TicketStatus.CANCELLED,
            cancelled_at: new Date(),
        },
    });
}

export async function getTicketByCode(companyId: number, ticketCode: string): Promise<ServiceResult> {
    const ticket = await prisma.groupTicket.findFirst({
        where: { company_id: companyId, ticket_code: ticketCode },
        include: {
            event_booking: {
                include: {
                    user: {
                        select: { id: true, name: true, email: true, phoneNumber: true },
                    },
                    group_event: {
                        select: { id: true, title: true, start_at: true, end_at: true },
                    },
                },
            },
            class_enrollment: {
                include: {
                    user: {
                        select: { id: true, name: true, email: true, phoneNumber: true },
                    },
                    group_class: {
                        select: { id: true, title: true },
                    },
                },
            },
            class_session: {
                select: { id: true, start_at: true, end_at: true },
            },
        },
    });

    if (!ticket) {
        return { code: 404, error: true, message: 'Ticket not found' };
    }

    const now = new Date();
    if (ticket.status === TicketStatus.ACTIVE && ticket.valid_until < now) {
        const expired = await prisma.groupTicket.update({
            where: { id: ticket.id },
            data: { status: TicketStatus.EXPIRED },
            include: {
                event_booking: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, phoneNumber: true },
                        },
                        group_event: {
                            select: { id: true, title: true, start_at: true, end_at: true },
                        },
                    },
                },
                class_enrollment: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, phoneNumber: true },
                        },
                        group_class: {
                            select: { id: true, title: true },
                        },
                    },
                },
                class_session: {
                    select: { id: true, start_at: true, end_at: true },
                },
            },
        });

        return { code: 200, error: false, message: 'Ticket is expired', data: mapTicketWithQr(expired) };
    }

    return { code: 200, error: false, message: 'Ticket retrieved', data: mapTicketWithQr(ticket) };
}

export async function markEventTicketUsed(companyId: number, ticketCode: string): Promise<ServiceResult> {
    const ticket = await prisma.groupTicket.findFirst({
        where: {
            company_id: companyId,
            ticket_code: ticketCode,
            group_event_booking_id: { not: null },
        },
    });

    if (!ticket) {
        return { code: 404, error: true, message: 'Event ticket not found' };
    }

    if (ticket.status === TicketStatus.USED) {
        return { code: 200, error: false, message: 'Ticket already used', data: ticket };
    }

    if (ticket.status !== TicketStatus.ACTIVE) {
        return { code: 400, error: true, message: `Ticket is ${ticket.status.toLowerCase()}` };
    }

    const now = new Date();
    if (now < ticket.valid_from || now > ticket.valid_until) {
        await prisma.groupTicket.update({
            where: { id: ticket.id },
            data: {
                status: TicketStatus.EXPIRED,
            },
        });
        return { code: 400, error: true, message: 'Ticket is outside validity window' };
    }

    const updated = await prisma.groupTicket.update({
        where: { id: ticket.id },
        data: {
            status: TicketStatus.USED,
            used_at: now,
        },
    });

    return { code: 200, error: false, message: 'Ticket marked as used', data: updated };
}

export async function listCompanyTickets(companyId: number, filters?: {
    status?: TicketStatus;
    eventBookingId?: number;
    classEnrollmentId?: number;
}): Promise<ServiceResult> {
    const tickets = await prisma.groupTicket.findMany({
        where: {
            company_id: companyId,
            ...(filters?.status ? { status: filters.status } : {}),
            ...(filters?.eventBookingId ? { group_event_booking_id: filters.eventBookingId } : {}),
            ...(filters?.classEnrollmentId ? { group_class_enrollment_id: filters.classEnrollmentId } : {}),
        },
        include: {
            event_booking: {
                include: {
                    group_event: { select: { id: true, title: true } },
                    user: { select: { id: true, name: true, email: true, phoneNumber: true } },
                },
            },
            class_enrollment: {
                include: {
                    group_class: { select: { id: true, title: true } },
                    user: { select: { id: true, name: true, email: true, phoneNumber: true } },
                },
            },
        },
        orderBy: { created_at: 'desc' },
    });

    return {
        code: 200,
        error: false,
        message: 'Tickets retrieved',
        data: tickets.map((ticket) => mapTicketWithQr(ticket)),
    };
}
