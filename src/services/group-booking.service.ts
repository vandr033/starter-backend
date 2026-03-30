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
import { buildWaitlistSpotOpenedTemplate } from '../utils/groupNotifications';
import { isTemporaryEmailAddress, sendGenericEmail } from '../utils/sendEmail';
import { sendWhatsappText } from '../utils/whatsappSender';

type ServiceResult = MensajeApi & { data?: any };
type TxClient = Prisma.TransactionClient;

function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = (phone ?? '').replace(/\D/g, '');
    if (!cleanPhone) return null;

    const cleanPrefix = (prefix ?? '591').replace(/\D/g, '');
    return `${cleanPrefix}${cleanPhone}`;
}

function getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getEventBookingUrl(companySlug: string | null | undefined, eventId: number): string | null {
    if (!companySlug) return null;
    return `${getFrontendBaseUrl()}/shop/${encodeURIComponent(companySlug)}/events/${eventId}`;
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

    return result;
}

/**
 * Admin: list bookings for an event.
 */
export async function listEventBookings(companyId: number, eventId: number): Promise<ServiceResult> {
    const bookings = await prisma.groupEventBooking.findMany({
        where: { company_id: companyId, group_event_id: eventId },
        include: {
            user: { select: { id: true, name: true, email: true, phoneNumber: true } },
            customer_profile: { select: { id: true, notes: true } },
        },
        orderBy: { created_at: 'desc' },
    });
    return { code: 200, error: false, message: 'Bookings retrieved', data: bookings };
}

export async function listEventInterests(companyId: number, eventId: number): Promise<ServiceResult> {
    const event = await prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
        select: { id: true },
    });
    if (!event) {
        return { code: 404, error: true, message: 'Event not found' };
    }

    const interests = await prisma.groupEventInterest.findMany({
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
    });

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
                    await sendGenericEmail(entry.user.email, template.subject, html);
                    delivered = true;
                }

                const fullPhone = buildFullPhone(entry.user.phone_prefix, entry.user.phoneNumber);
                if (sendWhatsapp && fullPhone) {
                    const result = await sendWhatsappText(fullPhone, template.text);
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

        if (gc.price_cents > 0 && input.payment_method === 'NONE') {
            return { code: 400, error: true, message: 'Paid classes require a payment method' } as ServiceResult;
        }
        if (input.payment_method === 'QR' && requireComprobante && !input.qr_proof_image_url) {
            return { code: 400, error: true, message: 'QR payment proof is required' } as ServiceResult;
        }

        let paymentStatus: PaymentStatus = PaymentStatus.UNPAID;
        if (gc.price_cents === 0) {
            paymentStatus = PaymentStatus.PAID;
        } else if (input.payment_method === 'QR') {
            paymentStatus = PaymentStatus.PENDING_CONFIRMATION;
        }

        const status: GroupBookingStatus = gc.price_cents === 0 || autoConfirm
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
                price_cents_snapshot: gc.price_cents,
                status,
                payment_method: gc.price_cents === 0 ? PaymentMethod.NONE : (input.payment_method as PaymentMethod),
                payment_status: paymentStatus,
                qr_proof_image_url: input.qr_proof_image_url ?? null,
                valid_from: validFrom,
                valid_until: validUntil,
            },
        });

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

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER-FACING: My bookings / enrollments
// ═══════════════════════════════════════════════════════════════════════════

export async function getMyEventBookings(userId: string): Promise<ServiceResult> {
    const bookings = await prisma.groupEventBooking.findMany({
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
    });
    return { code: 200, error: false, message: 'Bookings retrieved', data: bookings };
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
        },
        orderBy: { created_at: 'desc' },
    });
    return { code: 200, error: false, message: 'Enrollments retrieved', data: enrollments };
}
