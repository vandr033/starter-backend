import { CompanyUserRole } from '@prisma/client';
import { logger } from '../config/logger';
import { prisma } from '../prisma/client';
import { sendGenericEmail } from './sendEmail';

export function buildWaitlistSpotOpenedTemplate(input: {
    eventTitle: string;
    companyName: string;
    eventStartAt: Date;
    bookingUrl?: string | null;
}) {
    const when = input.eventStartAt.toISOString();
    const subject = `A spot opened for ${input.eventTitle}`;
    const text = [
        `Good news: a spot just opened for ${input.eventTitle}.`,
        `Business: ${input.companyName}`,
        `Starts at: ${when}`,
        input.bookingUrl ? `Book now: ${input.bookingUrl}` : null,
    ]
        .filter(Boolean)
        .join('\n');

    return { subject, text };
}

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

function formatMoney(totalPriceCents: number, currency?: string | null): string {
    const amount = totalPriceCents / 100;
    const currencyLabel = (currency ?? 'USD').trim() || 'USD';

    try {
        return new Intl.NumberFormat('es-BO', {
            style: 'currency',
            currency: currencyLabel,
        }).format(amount);
    } catch {
        return `${currencyLabel} ${amount.toFixed(2)}`;
    }
}

function humanizeEnum(value: string): string {
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
}) {
    const noun = input.itemType === 'EVENT' ? 'evento' : 'clase';
    const subject = `Nueva reserva de ${noun}: ${input.itemTitle}`;
    const customerName = input.customerName?.trim() || 'Sin nombre';
    const customerEmail = input.customerEmail?.trim() || 'No disponible';
    const customerPhone = input.customerPhone?.trim() || 'No disponible';
    const scheduleLabel = input.scheduleLabel?.trim() || 'No disponible';
    const qrProofState = input.qrProofImageUrl ? 'Subido' : 'No adjunto';

    const rows = [
        ['Tienda', input.companyName],
        ['Tipo', input.itemType === 'EVENT' ? 'Evento' : 'Clase'],
        ['Titulo', input.itemTitle],
        ['Cliente', customerName],
        ['Email', customerEmail],
        ['Telefono', customerPhone],
        ['Creado', input.createdAt.toISOString()],
        ['Horario', scheduleLabel],
        ['Metodo de pago', humanizeEnum(input.paymentMethod)],
        ['Estado de pago', humanizeEnum(input.paymentStatus)],
        ['Estado de reserva', humanizeEnum(input.bookingStatus)],
        ['Monto total', formatMoney(input.totalPriceCents, input.currency)],
        ['QR adjunto', qrProofState],
    ];

    const htmlRows = rows
        .map(([label, value]) => (
            `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(value)}</td></tr>`
        ))
        .join('');

    const qrProofLink = input.qrProofImageUrl
        ? `<p style="margin:0 0 12px 0;"><a href="${escapeHtml(input.qrProofImageUrl)}" target="_blank" rel="noopener noreferrer">Ver comprobante QR</a></p>`
        : '';
    const manageLink = input.manageUrl
        ? `<p style="margin:0;"><a href="${escapeHtml(input.manageUrl)}" target="_blank" rel="noopener noreferrer">Abrir en panel admin</a></p>`
        : '';

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;color:#0f172a;">
            <h2 style="margin:0 0 12px 0;">Nueva reserva de ${escapeHtml(noun)}</h2>
            <p style="margin:0 0 16px 0;">Se creo una nueva reserva para <strong>${escapeHtml(input.itemTitle)}</strong>.</p>
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
        const admins = await prisma.companyUser.findMany({
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
        });

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
        });

        await Promise.allSettled(
            admins
                .map((admin) => admin.user.email?.trim())
                .filter((email): email is string => Boolean(email))
                .map((email) => sendGenericEmail(email, subject, html)),
        );
    } catch (error) {
        logger.error({ input, error }, 'Failed to send internal group booking notifications');
    }
}
