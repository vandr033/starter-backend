"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewNotificationDependencies = void 0;
exports.notifyNewReview = notifyNewReview;
exports.sendReviewRequestReminder = sendReviewRequestReminder;
const client_1 = require("../prisma/client");
const logger_1 = require("../config/logger");
const client_2 = require("@prisma/client");
const whatsappSender_1 = require("./whatsappSender");
const sendEmail_1 = require("./sendEmail");
const notification_provider_service_1 = require("../services/notification-provider.service");
const company_entitlements_service_1 = require("../services/company-entitlements.service");
exports.reviewNotificationDependencies = {
    companyHasCapability: company_entitlements_service_1.companyHasCapability,
};
// ---------------------------------------------------------------------------
// Idempotency: simple in-memory set to prevent duplicate sends within a window
// ---------------------------------------------------------------------------
const sentKeys = new Map();
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
function isDuplicate(key) {
    const now = Date.now();
    const existing = sentKeys.get(key);
    if (existing && now - existing < DEDUP_WINDOW_MS)
        return true;
    sentKeys.set(key, now);
    return false;
}
// Periodically clean old entries without keeping the process alive on its own.
const sentKeyCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [key, ts] of sentKeys) {
        if (ts < cutoff)
            sentKeys.delete(key);
    }
}, 60 * 60 * 1000); // every hour
sentKeyCleanupTimer.unref?.();
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildFullPhone(prefix, phone) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone)
        return null;
    const cleanPrefix = (prefix || '591').replace(/\D/g, '');
    return `${cleanPrefix}${cleanPhone}`;
}
function getReviewUrl(companySlug) {
    const base = process.env.FRONTEND_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        'http://localhost:3000';
    const normalizedBase = base.replace(/\/$/, '');
    if (companySlug) {
        return `${normalizedBase}/me/reviews?shop=${encodeURIComponent(companySlug)}`;
    }
    return `${normalizedBase}/me/reviews`;
}
async function getCompanyNotificationSettings(companyId) {
    const settings = await client_1.prisma.companySettings.findUnique({
        where: { company_id: companyId },
        select: {
            send_email_notifications: true,
            send_whatsapp_notifications: true,
        },
    });
    return {
        sendEmail: settings?.send_email_notifications ?? true,
        sendWhatsapp: settings?.send_whatsapp_notifications ?? false,
    };
}
function starEmojis(rating) {
    return '⭐'.repeat(Math.min(Math.max(rating, 1), 5));
}
// ---------------------------------------------------------------------------
// 1. Notify admin/owners when a new review is posted
// ---------------------------------------------------------------------------
async function notifyNewReview(data) {
    const dedupKey = `new-review:${data.reviewId}`;
    if (isDuplicate(dedupKey))
        return;
    try {
        const settings = await getCompanyNotificationSettings(data.companyId);
        // Fetch owners/admins
        const admins = await client_1.prisma.companyUser.findMany({
            where: {
                company_id: data.companyId,
                role: { in: [client_2.CompanyUserRole.OWNER, client_2.CompanyUserRole.ADMIN] },
                deleted_at: null,
            },
            include: {
                user: {
                    select: {
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                        first_name: true,
                    },
                },
            },
        });
        if (admins.length === 0)
            return;
        const subject = `Nueva reseña: ${starEmojis(data.rating)} de ${data.reviewerName}`;
        const commentSnippet = data.comment
            ? data.comment.length > 100
                ? `${data.comment.slice(0, 100)}...`
                : data.comment
            : 'Sin comentario';
        for (const admin of admins) {
            // Email
            if (settings.sendEmail && admin.user.email) {
                const html = `
          <div style="font-family:sans-serif;max-width:500px;">
            <h3>Nueva Reseña ${starEmojis(data.rating)}</h3>
            <p><strong>Cliente:</strong> ${data.reviewerName}</p>
            <p><strong>Calificación:</strong> ${data.rating}/5</p>
            ${data.serviceName ? `<p><strong>Servicio:</strong> ${data.serviceName}</p>` : ''}
            ${data.staffName ? `<p><strong>Staff:</strong> ${data.staffName}</p>` : ''}
            <p><strong>Comentario:</strong> ${commentSnippet}</p>
          </div>
        `;
                void (0, sendEmail_1.sendGenericEmail)(admin.user.email, subject, html, { companyId: data.companyId })
                    .then((result) => {
                    if (!(0, notification_provider_service_1.isEmailDeliverySuccessful)(result)) {
                        logger_1.logger.warn({ adminEmail: admin.user.email, status: result.status, reason: result.reason }, 'New review email was not delivered to admin');
                    }
                })
                    .catch((err) => {
                    logger_1.logger.error({ err, adminEmail: admin.user.email }, 'Failed to send new review email to admin');
                });
            }
            // WhatsApp
            if (settings.sendWhatsapp && admin.user.phoneNumber) {
                const fullPhone = buildFullPhone(admin.user.phone_prefix, admin.user.phoneNumber);
                if (fullPhone) {
                    const text = [
                        `📝 *Nueva Reseña* ${starEmojis(data.rating)}`,
                        `Cliente: ${data.reviewerName}`,
                        `Calificación: ${data.rating}/5`,
                        data.serviceName ? `Servicio: ${data.serviceName}` : null,
                        data.staffName ? `Staff: ${data.staffName}` : null,
                        `Comentario: ${commentSnippet}`,
                    ]
                        .filter(Boolean)
                        .join('\n');
                    void (0, whatsappSender_1.queueWhatsappText)(fullPhone, text, {
                        companyId: data.companyId,
                        sourceType: 'NEW_REVIEW_ADMIN_NOTIFICATION',
                        sourceId: String(data.reviewId),
                        dedupeKey: `new-review:${data.reviewId}:admin:${admin.user.phoneNumber}`,
                    })
                        .then((result) => {
                        if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
                            logger_1.logger.warn({ phone: fullPhone, status: result.status, reason: result.reason }, 'New review WhatsApp was not queued for admin');
                        }
                    })
                        .catch((err) => {
                        logger_1.logger.error({ err, phone: fullPhone }, 'Failed to send new review WhatsApp to admin');
                    });
                }
            }
        }
    }
    catch (error) {
        logger_1.logger.error({ error, reviewId: data.reviewId }, 'Error sending new review notification');
    }
}
// ---------------------------------------------------------------------------
// 2. Review request reminder (sent to customer after completed booking)
// ---------------------------------------------------------------------------
async function sendReviewRequestReminder(data) {
    const dedupKey = `review-request:${data.bookingId}`;
    if (isDuplicate(dedupKey)) {
        return { sent: false, reason: 'Already sent' };
    }
    try {
        const canSendReviewRequests = await exports.reviewNotificationDependencies.companyHasCapability(data.companyId, 'MENSAJERIA_REVIEW_REQUESTS');
        if (!canSendReviewRequests) {
            return { sent: false, reason: 'Feature not available on current plan' };
        }
        // Check the booking hasn't been reviewed yet
        const existingReview = await client_1.prisma.review.findUnique({
            where: { booking_id: data.bookingId },
            select: { id: true },
        });
        if (existingReview) {
            return { sent: false, reason: 'Already reviewed' };
        }
        const settings = await getCompanyNotificationSettings(data.companyId);
        const reviewUrl = getReviewUrl(data.companySlug);
        const locale = data.locale || 'es';
        // Try WhatsApp first (if plan allows), then email
        if (settings.sendWhatsapp && data.customerPhone) {
            const fullPhone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
            if (fullPhone) {
                const text = locale === 'en'
                    ? [
                        `Hi ${data.customerName}! 👋`,
                        `How was your experience at *${data.companyName}*?`,
                        `We'd love to hear your feedback! Leave a review here:`,
                        reviewUrl,
                    ].join('\n')
                    : [
                        `¡Hola ${data.customerName}! 👋`,
                        `¿Cómo fue tu experiencia en *${data.companyName}*?`,
                        `¡Nos encantaría conocer tu opinión! Dejá tu reseña aquí:`,
                        reviewUrl,
                    ].join('\n');
                const result = await (0, whatsappSender_1.queueWhatsappText)(fullPhone, text, {
                    companyId: data.companyId,
                    sourceType: 'REVIEW_REQUEST',
                    sourceId: String(data.bookingId),
                    dedupeKey: dedupKey,
                });
                if ((0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
                    const status = result.status === 'DUPLICATE' ? result.existingStatus : 'PENDING';
                    if (status === 'SENT') {
                        return { sent: true, channel: 'WHATSAPP', status: 'SENT', jobId: result.jobId, reason: 'Already sent' };
                    }
                    return {
                        sent: false,
                        queued: true,
                        channel: 'WHATSAPP',
                        status: status === 'PROCESSING' ? 'PROCESSING' : 'PENDING',
                        jobId: result.jobId,
                        reason: result.status === 'DUPLICATE' ? 'Already queued' : 'Queued',
                    };
                }
            }
        }
        if (settings.sendEmail && data.customerEmail) {
            const subject = locale === 'en'
                ? `How was your experience at ${data.companyName}?`
                : `¿Cómo fue tu experiencia en ${data.companyName}?`;
            const html = locale === 'en'
                ? `
            <div style="font-family:sans-serif;max-width:500px;">
              <p>Hi ${data.customerName},</p>
              <p>We hope you enjoyed your visit to <strong>${data.companyName}</strong>!</p>
              <p>We'd love to hear your feedback. It only takes a minute:</p>
              <p><a href="${reviewUrl}" style="display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Leave a Review</a></p>
              <p style="color:#888;font-size:12px;">Thank you for your time!</p>
            </div>
          `
                : `
            <div style="font-family:sans-serif;max-width:500px;">
              <p>Hola ${data.customerName},</p>
              <p>¡Esperamos que hayas disfrutado tu visita a <strong>${data.companyName}</strong>!</p>
              <p>Nos encantaría conocer tu opinión. Solo toma un minuto:</p>
              <p><a href="${reviewUrl}" style="display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Dejar una Reseña</a></p>
              <p style="color:#888;font-size:12px;">¡Gracias por tu tiempo!</p>
            </div>
          `;
            const result = await (0, sendEmail_1.sendGenericEmail)(data.customerEmail, subject, html, { companyId: data.companyId });
            if ((0, notification_provider_service_1.isEmailDeliverySuccessful)(result)) {
                return { sent: true, channel: 'EMAIL', status: 'SENT' };
            }
            return { sent: false, reason: `EMAIL_${result.reason}` };
        }
        return { sent: false, reason: 'No contact channel available' };
    }
    catch (error) {
        logger_1.logger.error({ error, bookingId: data.bookingId }, 'Error sending review request reminder');
        return { sent: false, reason: 'Internal error' };
    }
}
