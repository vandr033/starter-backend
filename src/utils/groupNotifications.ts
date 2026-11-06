import { CompanyUserRole } from '@prisma/client';
import { logger } from '../config/logger';
import { prisma } from '../prisma/client';
import { sendGenericEmail } from './sendEmail';
import { isEmailDeliverySuccessful } from '../services/notification-provider.service';

export function buildGroupEventBookingConfirmedTemplate(input: {
    eventTitle: string;
    companyName: string;
    startAt: Date;
    locationText?: string | null;
}) {
    const subject = `Registration confirmed: ${input.eventTitle}`;
    const text = [
        `Your registration for ${input.eventTitle} is confirmed.`,
        `Business: ${input.companyName}`,
        `Starts at: ${input.startAt.toISOString()}`,
        input.locationText ? `Location: ${input.locationText}` : null,
    ]
        .filter(Boolean)
        .join('\n');

    return { subject, text };
}

export function buildGroupClassEnrollmentConfirmedTemplate(input: {
    classTitle: string;
    companyName: string;
    validFrom: Date;
    validUntil: Date;
}) {
    const subject = `Class pass confirmed: ${input.classTitle}`;
    const text = [
        `Your class pass for ${input.classTitle} is confirmed.`,
        `Business: ${input.companyName}`,
        `Valid from: ${input.validFrom.toISOString()}`,
        `Valid until: ${input.validUntil.toISOString()}`,
    ].join('\n');

    return { subject, text };
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function formatMoney(totalPriceCents: number, currency: string | null | undefined, locale: 'es' | 'en'): string {
    const amount = totalPriceCents / 100;
    const currencyLabel = (currency ?? 'USD').trim() || 'USD';

    try {
        return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-BO', {
            style: 'currency',
            currency: currencyLabel,
        }).format(amount);
    } catch {
        return `${currencyLabel} ${amount.toFixed(2)}`;
    }
}

function humanizeEnum(value: string, locale: 'es' | 'en'): string {
    const translations: Record<string, string> = locale === 'en'
        ? { NONE: 'None', QR: 'QR', CASH: 'Cash', UNPAID: 'Unpaid', PENDING_CONFIRMATION: 'Pending confirmation', PAID: 'Paid', REJECTED: 'Rejected', CONFIRMED: 'Confirmed', PENDING: 'Pending', CANCELLED: 'Cancelled', WAITLISTED: 'Waitlisted' }
        : { NONE: 'Ninguno', QR: 'QR', CASH: 'Efectivo', UNPAID: 'Sin pagar', PENDING_CONFIRMATION: 'Confirmación pendiente', PAID: 'Pagado', REJECTED: 'Rechazado', CONFIRMED: 'Confirmado', PENDING: 'Pendiente', CANCELLED: 'Cancelado', WAITLISTED: 'En lista de espera' };
    if (translations[value]) return translations[value];
    return value
        .toLowerCase()
        .split('_')
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ');
}

function getManageUrl(itemType: 'EVENT' | 'CLASS', itemId: number): string {
    const path = itemType === 'EVENT'
        ? `/admin/dashboard/group-reservations/events/${itemId}`
        : `/admin/dashboard/group-reservations/classes/${itemId}`;
    return `${getFrontendBaseUrl()}${path}`;
}

export function buildGroupBookingInternalTemplate(input: {
    companyName: string;
    itemType: 'EVENT' | 'CLASS';
    itemTitle: string;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    paymentMethod: string;
    paymentStatus: string;
    bookingStatus: string;
    totalPriceCents: number;
    currency?: string | null;
    qrProofImageUrl?: string | null;
    manageUrl?: string | null;
    scheduleLabel?: string | null;
    createdAt: Date;
    locale?: 'es' | 'en';
}) {
    const locale = input.locale ?? 'es';
    const english = locale === 'en';
    const noun = input.itemType === 'EVENT' ? (english ? 'event' : 'evento') : (english ? 'class' : 'clase');
    const subject = english ? `New ${noun} booking: ${input.itemTitle}` : `Nueva reserva de ${noun}: ${input.itemTitle}`;
    const customerName = input.customerName?.trim() || (english ? 'No name' : 'Sin nombre');
    const customerEmail = input.customerEmail?.trim() || (english ? 'Not available' : 'No disponible');
    const customerPhone = input.customerPhone?.trim() || (english ? 'Not available' : 'No disponible');
    const scheduleLabel = input.scheduleLabel?.trim() || (english ? 'Not available' : 'No disponible');
    const qrProofState = input.qrProofImageUrl ? (english ? 'Uploaded' : 'Subido') : (english ? 'Not attached' : 'No adjunto');

    const rows = [
        [english ? 'Business' : 'Tienda', input.companyName],
        [english ? 'Type' : 'Tipo', input.itemType === 'EVENT' ? (english ? 'Event' : 'Evento') : (english ? 'Class' : 'Clase')],
        [english ? 'Title' : 'Título', input.itemTitle],
        [english ? 'Customer' : 'Cliente', customerName],
        ['Email', customerEmail],
        [english ? 'Phone' : 'Teléfono', customerPhone],
        [english ? 'Created' : 'Creado', input.createdAt.toISOString()],
        [english ? 'Schedule' : 'Horario', scheduleLabel],
        [english ? 'Payment method' : 'Método de pago', humanizeEnum(input.paymentMethod, locale)],
        [english ? 'Payment status' : 'Estado de pago', humanizeEnum(input.paymentStatus, locale)],
        [english ? 'Booking status' : 'Estado de reserva', humanizeEnum(input.bookingStatus, locale)],
        [english ? 'Total amount' : 'Monto total', formatMoney(input.totalPriceCents, input.currency, locale)],
        [english ? 'QR proof' : 'Comprobante QR', qrProofState],
    ];

    const htmlRows = rows
        .map(([label, value]) => (
            `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(value)}</td></tr>`
        ))
        .join('');

    const qrProofLink = input.qrProofImageUrl
        ? `<p style="margin:0 0 12px 0;"><a href="${escapeHtml(input.qrProofImageUrl)}" target="_blank" rel="noopener noreferrer">${english ? 'View QR proof' : 'Ver comprobante QR'}</a></p>`
        : '';
    const manageLink = input.manageUrl
        ? `<p style="margin:0;"><a href="${escapeHtml(input.manageUrl)}" target="_blank" rel="noopener noreferrer">${english ? 'Open admin panel' : 'Abrir en panel admin'}</a></p>`
        : '';

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;color:#0f172a;">
            <h2 style="margin:0 0 12px 0;">${english ? `New ${noun} booking` : `Nueva reserva de ${noun}`}</h2>
            <p style="margin:0 0 16px 0;">${english ? 'A new reservation was created for' : 'Se creó una nueva reserva para'} <strong>${escapeHtml(input.itemTitle)}</strong>.</p>
            <table style="border-collapse:collapse;width:100%;margin:0 0 16px 0;">
                <tbody>${htmlRows}</tbody>
            </table>
            ${qrProofLink}
            ${manageLink}
        </div>
    `;

    return { subject, html };
}

export async function notifyGroupBookingCreated(input: {
    companyId: number;
    companyName: string;
    itemType: 'EVENT' | 'CLASS';
    itemId: number;
    itemTitle: string;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    paymentMethod: string;
    paymentStatus: string;
    bookingStatus: string;
    totalPriceCents: number;
    currency?: string | null;
    qrProofImageUrl?: string | null;
    scheduleLabel?: string | null;
    createdAt: Date;
}): Promise<void> {
    try {
        const [admins, language] = await Promise.all([
            prisma.companyUser.findMany({
                where: {
                    company_id: input.companyId,
                    role: { in: [CompanyUserRole.OWNER, CompanyUserRole.ADMIN] },
                    deleted_at: null,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                        },
                    },
                },
            }),
            prisma.configMessage.findUnique({
                where: { company_id_key: { company_id: input.companyId, key: 'default_language' } },
                select: { value: true },
            }),
        ]);

        if (admins.length === 0) return;

        const { subject, html } = buildGroupBookingInternalTemplate({
            companyName: input.companyName,
            itemType: input.itemType,
            itemTitle: input.itemTitle,
            customerName: input.customerName,
            customerEmail: input.customerEmail,
            customerPhone: input.customerPhone,
            paymentMethod: input.paymentMethod,
            paymentStatus: input.paymentStatus,
            bookingStatus: input.bookingStatus,
            totalPriceCents: input.totalPriceCents,
            currency: input.currency,
            qrProofImageUrl: input.qrProofImageUrl,
            manageUrl: getManageUrl(input.itemType, input.itemId),
            scheduleLabel: input.scheduleLabel,
            createdAt: input.createdAt,
            locale: language?.value?.trim().toLowerCase() === 'en' ? 'en' : 'es',
        });

        const deliveries = await Promise.allSettled(
            admins
                .map((admin) => admin.user.email?.trim())
                .filter((email): email is string => Boolean(email))
                .map((email) => sendGenericEmail(email, subject, html, { companyId: input.companyId })),
        );
        const failedCount = deliveries.filter(
            (delivery) => delivery.status === 'rejected' || !isEmailDeliverySuccessful(delivery.value),
        ).length;
        if (failedCount > 0) {
            logger.warn({ companyId: input.companyId, failedCount }, 'Some internal group booking emails were not delivered');
        }
    } catch (error) {
        logger.error({ input, error }, 'Failed to send internal group booking notifications');
    }
}
