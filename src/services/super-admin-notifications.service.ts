import { logger } from '../config/logger';
import { MensajeApi } from '../types/MensajeApi';
import { sendGenericEmail } from '../utils/sendEmail';
import { sendWhatsappText } from '../utils/whatsappSender';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MIN_LENGTH = 8;
const PHONE_MAX_LENGTH = 18;
const SUBJECT_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 600;

const DEFAULT_EMAIL_SUBJECT = 'PriConPri test email';
const DEFAULT_EMAIL_MESSAGE = 'This is a test email triggered from the Super Admin panel.';
const DEFAULT_WHATSAPP_MESSAGE =
    'This is a test WhatsApp message triggered from the Super Admin panel.';

interface RequestedByInfo {
    id?: string;
    name?: string | null;
    email?: string | null;
}

interface SendTestEmailInput {
    email?: string | null;
    subject?: string | null;
    message?: string | null;
    requestedBy?: RequestedByInfo;
}

interface SendTestWhatsappInput {
    phoneNumber?: string | null;
    message?: string | null;
    requestedBy?: RequestedByInfo;
}

function normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value?: string | null): string | null {
    const trimmed = normalizeOptionalText(value);
    return trimmed ? trimmed.toLowerCase() : null;
}

function normalizePhoneNumber(value?: string | null): string | null {
    const trimmed = normalizeOptionalText(value);
    if (!trimmed) return null;

    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < PHONE_MIN_LENGTH || digits.length > PHONE_MAX_LENGTH) {
        return null;
    }

    return digits;
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveActorLabel(requestedBy?: RequestedByInfo): string {
    if (!requestedBy) return 'Unknown super admin';
    if (requestedBy.name && requestedBy.name.trim().length > 0) return requestedBy.name.trim();
    if (requestedBy.email && requestedBy.email.trim().length > 0) return requestedBy.email.trim();
    if (requestedBy.id && requestedBy.id.trim().length > 0) return `user:${requestedBy.id.trim()}`;
    return 'Unknown super admin';
}

export async function sendTestEmailNotification(input: SendTestEmailInput): Promise<MensajeApi> {
    const email = normalizeEmail(input.email);
    if (!email || !EMAIL_REGEX.test(email)) {
        return {
            code: 400,
            error: true,
            message: 'Valid email is required',
        };
    }

    const subject = normalizeOptionalText(input.subject) || DEFAULT_EMAIL_SUBJECT;
    if (subject.length > SUBJECT_MAX_LENGTH) {
        return {
            code: 400,
            error: true,
            message: `Subject cannot exceed ${SUBJECT_MAX_LENGTH} characters`,
        };
    }

    const message = normalizeOptionalText(input.message) || DEFAULT_EMAIL_MESSAGE;
    if (message.length > MESSAGE_MAX_LENGTH) {
        return {
            code: 400,
            error: true,
            message: `Message cannot exceed ${MESSAGE_MAX_LENGTH} characters`,
        };
    }

    const sentAt = new Date();
    const actorLabel = resolveActorLabel(input.requestedBy);
    const safeMessageHtml = escapeHtml(message).replace(/\r?\n/g, '<br/>');

    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 620px; margin: 0 auto; padding: 20px; background: #f8fafc;">
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
                <h2 style="margin-top: 0;">PriConPri Test Email</h2>
                <p>This is a test email triggered from the Super Admin panel.</p>
                <div style="margin-top: 16px; background: #f8fafc; border-radius: 8px; padding: 14px;">
                    ${safeMessageHtml}
                </div>
                <p style="margin-top: 16px; font-size: 12px; color: #64748b;">
                    Sent by: ${escapeHtml(actorLabel)}<br/>
                    Sent at (UTC): ${sentAt.toISOString()}
                </p>
            </div>
        </div>
    `;

    try {
        await sendGenericEmail(email, subject, html);

        logger.info(
            {
                event: 'super_admin_test_email_sent',
                to: email,
                subject,
                requestedBy: input.requestedBy?.id || null,
            },
            'Super admin test email sent',
        );

        return {
            code: 200,
            error: false,
            message: 'Test email sent successfully',
            data: {
                email,
                subject,
                sent_at: sentAt.toISOString(),
            },
        };
    } catch (error) {
        logger.error(
            {
                event: 'super_admin_test_email_failed',
                to: email,
                requestedBy: input.requestedBy?.id || null,
                err: error,
            },
            'Super admin test email failed',
        );

        return {
            code: 500,
            error: true,
            message: 'Failed to send test email',
        };
    }
}

export async function sendTestWhatsappNotification(input: SendTestWhatsappInput): Promise<MensajeApi> {
    const phoneNumber = normalizePhoneNumber(input.phoneNumber);
    if (!phoneNumber) {
        return {
            code: 400,
            error: true,
            message: 'Valid phone number is required',
        };
    }

    const message = normalizeOptionalText(input.message) || DEFAULT_WHATSAPP_MESSAGE;
    if (message.length > MESSAGE_MAX_LENGTH) {
        return {
            code: 400,
            error: true,
            message: `Message cannot exceed ${MESSAGE_MAX_LENGTH} characters`,
        };
    }

    const sentAt = new Date();
    const actorLabel = resolveActorLabel(input.requestedBy);
    const whatsappText = [
        'PriConPri test message',
        '',
        message,
        '',
        `Sent by: ${actorLabel}`,
        `Sent at (UTC): ${sentAt.toISOString()}`,
    ].join('\n');

    const result = await sendWhatsappText(phoneNumber, whatsappText);
    if (result === -1) {
        logger.error(
            {
                event: 'super_admin_test_whatsapp_failed',
                to: phoneNumber,
                requestedBy: input.requestedBy?.id || null,
            },
            'Super admin test WhatsApp failed',
        );

        return {
            code: 502,
            error: true,
            message: 'Failed to send test WhatsApp message',
        };
    }

    logger.info(
        {
            event: 'super_admin_test_whatsapp_sent',
            to: phoneNumber,
            requestedBy: input.requestedBy?.id || null,
        },
        'Super admin test WhatsApp sent',
    );

    return {
        code: 200,
        error: false,
        message: 'Test WhatsApp message sent successfully',
        data: {
            phone_number: phoneNumber,
            sent_at: sentAt.toISOString(),
        },
    };
}
