import { prisma } from '../prisma/client';
import { logger } from '../config/logger';
import { CompanyUserRole } from '@prisma/client';
import { sendWhatsappText } from './whatsappSender';
import { sendGenericEmail } from './sendEmail';
import { isPlanFeatureEnabled } from '../config/plan-capabilities';
import type { ShopPlan } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewReviewNotificationData {
  companyId: number;
  reviewId: number;
  reviewerName: string;
  rating: number;
  comment: string | null;
  serviceName: string | null;
  staffName: string | null;
}

interface ReviewRequestReminderData {
  companyId: number;
  bookingId: number;
  customerEmail: string | null;
  customerPhone: string | null;
  customerPhonePrefix: string | null;
  customerName: string;
  companyName: string;
  companySlug: string | null;
  locale?: 'es' | 'en';
}

// ---------------------------------------------------------------------------
// Idempotency: simple in-memory set to prevent duplicate sends within a window
// ---------------------------------------------------------------------------

const sentKeys = new Map<string, number>();
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const existing = sentKeys.get(key);
  if (existing && now - existing < DEDUP_WINDOW_MS) return true;
  sentKeys.set(key, now);
  return false;
}

// Periodically clean old entries
setInterval(() => {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, ts] of sentKeys) {
    if (ts < cutoff) sentKeys.delete(key);
  }
}, 60 * 60 * 1000); // every hour

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  if (!cleanPhone) return null;
  const cleanPrefix = (prefix || '591').replace(/\D/g, '');
  return `${cleanPrefix}${cleanPhone}`;
}

function getReviewUrl(companySlug?: string | null): string {
  const base =
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    'http://localhost:3000';
  const normalizedBase = base.replace(/\/$/, '');
  if (companySlug) {
    return `${normalizedBase}/me/reviews?shop=${encodeURIComponent(companySlug)}`;
  }
  return `${normalizedBase}/me/reviews`;
}

async function getCompanyNotificationSettings(companyId: number) {
  const settings = await prisma.companySettings.findUnique({
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

function starEmojis(rating: number): string {
  return '⭐'.repeat(Math.min(Math.max(rating, 1), 5));
}

// ---------------------------------------------------------------------------
// 1. Notify admin/owners when a new review is posted
// ---------------------------------------------------------------------------

export async function notifyNewReview(data: NewReviewNotificationData): Promise<void> {
  const dedupKey = `new-review:${data.reviewId}`;
  if (isDuplicate(dedupKey)) return;

  try {
    const settings = await getCompanyNotificationSettings(data.companyId);

    // Fetch owners/admins
    const admins = await prisma.companyUser.findMany({
      where: {
        company_id: data.companyId,
        role: { in: [CompanyUserRole.OWNER, CompanyUserRole.ADMIN] },
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

    if (admins.length === 0) return;

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
        void sendGenericEmail(admin.user.email, subject, html, { companyId: data.companyId }).catch((err) => {
          logger.error({ err, adminEmail: admin.user.email }, 'Failed to send new review email to admin');
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

          void sendWhatsappText(fullPhone, text, { companyId: data.companyId }).catch((err) => {
            logger.error({ err, phone: fullPhone }, 'Failed to send new review WhatsApp to admin');
          });
        }
      }
    }
  } catch (error) {
    logger.error({ error, reviewId: data.reviewId }, 'Error sending new review notification');
  }
}

// ---------------------------------------------------------------------------
// 2. Review request reminder (sent to customer after completed booking)
// ---------------------------------------------------------------------------

export async function sendReviewRequestReminder(data: ReviewRequestReminderData): Promise<{
  sent: boolean;
  channel?: 'EMAIL' | 'WHATSAPP';
  reason?: string;
}> {
  const dedupKey = `review-request:${data.bookingId}`;
  if (isDuplicate(dedupKey)) {
    return { sent: false, reason: 'Already sent' };
  }

  try {
    // Check plan allows review request reminders (umbrella check)
    const company = await prisma.company.findUnique({
      where: { id: data.companyId },
      select: { plan: true },
    });
    if (!company || !isPlanFeatureEnabled(company.plan as ShopPlan, 'REVIEW_REQUEST_REMINDERS')) {
      return { sent: false, reason: 'Feature not available on current plan' };
    }

    const plan = company.plan as ShopPlan;

    // Check the booking hasn't been reviewed yet
    const existingReview = await prisma.review.findUnique({
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
    if (isPlanFeatureEnabled(plan, 'REVIEW_REQUEST_WHATSAPP') && settings.sendWhatsapp && data.customerPhone) {
      const fullPhone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
      if (fullPhone) {
        const text =
          locale === 'en'
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

        await sendWhatsappText(fullPhone, text, { companyId: data.companyId });
        return { sent: true, channel: 'WHATSAPP' };
      }
    }

    if (isPlanFeatureEnabled(plan, 'REVIEW_REQUEST_EMAIL') && settings.sendEmail && data.customerEmail) {
      const subject =
        locale === 'en'
          ? `How was your experience at ${data.companyName}?`
          : `¿Cómo fue tu experiencia en ${data.companyName}?`;

      const html =
        locale === 'en'
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

      await sendGenericEmail(data.customerEmail, subject, html, { companyId: data.companyId });
      return { sent: true, channel: 'EMAIL' };
    }

    return { sent: false, reason: 'No contact channel available' };
  } catch (error) {
    logger.error({ error, bookingId: data.bookingId }, 'Error sending review request reminder');
    return { sent: false, reason: 'Internal error' };
  }
}
