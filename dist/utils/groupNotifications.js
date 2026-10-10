"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWaitlistSpotOpenedTemplate = buildWaitlistSpotOpenedTemplate;
exports.buildGroupEventBookingConfirmedTemplate = buildGroupEventBookingConfirmedTemplate;
exports.buildGroupClassEnrollmentConfirmedTemplate = buildGroupClassEnrollmentConfirmedTemplate;
exports.buildGroupBookingInternalTemplate = buildGroupBookingInternalTemplate;
exports.notifyGroupBookingCreated = notifyGroupBookingCreated;
const client_1 = require("@prisma/client");
const logger_1 = require("../config/logger");
const client_2 = require("../prisma/client");
const sendEmail_1 = require("./sendEmail");
const notification_provider_service_1 = require("../services/notification-provider.service");
function buildWaitlistSpotOpenedTemplate(input) {
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
function buildGroupEventBookingConfirmedTemplate(input) {
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
function buildGroupClassEnrollmentConfirmedTemplate(input) {
    const subject = `Class pass confirmed: ${input.classTitle}`;
    const text = [
        `Your class pass for ${input.classTitle} is confirmed.`,
        `Business: ${input.companyName}`,
        `Valid from: ${input.validFrom.toISOString()}`,
        `Valid until: ${input.validUntil.toISOString()}`,
    ].join('\n');
    return { subject, text };
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function getFrontendBaseUrl() {
    return (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}
function formatMoney(totalPriceCents, currency) {
    const amount = totalPriceCents / 100;
    const currencyLabel = (currency ?? 'USD').trim() || 'USD';
    try {
        return new Intl.NumberFormat('es-BO', {
            style: 'currency',
            currency: currencyLabel,
        }).format(amount);
    }
    catch {
        return `${currencyLabel} ${amount.toFixed(2)}`;
    }
}
function humanizeEnum(value) {
    return value
        .toLowerCase()
        .split('_')
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ');
}
function getManageUrl(itemType, itemId) {
    const path = itemType === 'EVENT'
        ? `/admin/dashboard/group-reservations/events/${itemId}`
        : `/admin/dashboard/group-reservations/classes/${itemId}`;
    return `${getFrontendBaseUrl()}${path}`;
}
function buildGroupBookingInternalTemplate(input) {
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
        .map(([label, value]) => (`<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(value)}</td></tr>`))
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
async function notifyGroupBookingCreated(input) {
    try {
        const admins = await client_2.prisma.companyUser.findMany({
            where: {
                company_id: input.companyId,
                role: { in: [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN] },
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
        if (admins.length === 0)
            return;
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
        const deliveries = await Promise.allSettled(admins
            .map((admin) => admin.user.email?.trim())
            .filter((email) => Boolean(email))
            .map((email) => (0, sendEmail_1.sendGenericEmail)(email, subject, html, { companyId: input.companyId })));
        const failedCount = deliveries.filter((delivery) => delivery.status === 'rejected' || !(0, notification_provider_service_1.isEmailDeliverySuccessful)(delivery.value)).length;
        if (failedCount > 0) {
            logger_1.logger.warn({ companyId: input.companyId, failedCount }, 'Some internal group booking emails were not delivered');
        }
    }
    catch (error) {
        logger_1.logger.error({ input, error }, 'Failed to send internal group booking notifications');
    }
}
