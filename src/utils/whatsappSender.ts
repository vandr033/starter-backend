import { logger } from '../config/logger';
import { wahaClient } from '../services/waha.service';
import {
  appendCompanyContactLine,
  getCompanyNotificationBranding,
  mergeBranding,
  type NotificationBranding,
} from './notificationBranding';

function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return trimmed;
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-2)}`;
}

function buildErrorLog(error: unknown) {
  if (error instanceof Error) {
    const errorWithCause = error as Error & {
      cause?: unknown;
      code?: string | number;
      status?: number;
    };

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: errorWithCause.code,
      status: errorWithCause.status,
      cause: errorWithCause.cause,
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown WhatsApp sender error',
    raw: error,
  };
}

async function buildBrandedText(
  text: string,
  options?: { companyId?: number; branding?: NotificationBranding | null },
): Promise<string> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error('WhatsApp message text is required.');
  }

  const companyBranding = options?.companyId
    ? await getCompanyNotificationBranding(options.companyId)
    : null;
  const branding = mergeBranding(companyBranding, options?.branding);

  return branding
    ? appendCompanyContactLine(trimmedText, branding)
    : trimmedText.includes('Priconpri')
      ? trimmedText
      : `${trimmedText}\n\nPriconpri`;
}

export const sendWhatsappCode = async (phone: string, code: string) => {
  return sendWhatsappText(phone, `Priconpri\n\nTu codigo de verificacion es: ${code}`);
};

export const sendWhatsappText = async (
  phone: string,
  text: string,
  options?: { companyId?: number; branding?: NotificationBranding | null },
) => {
  try {
    const brandedText = await buildBrandedText(text, options);
    return await wahaClient.sendText(phone, brandedText);
  } catch (error) {
    logger.error(
      {
        event: 'whatsapp_text_send_failed',
        phone: maskPhone(phone),
        error: buildErrorLog(error),
      },
      'sendWhatsappText returned failure',
    );
    return -1;
  }
};

export const createWhatsappGroup = async (
  name: string,
  participantPhones: string[],
): Promise<{ jid: string; name: string } | null> => {
  try {
    const group = await wahaClient.createGroup(name, participantPhones);
    return {
      jid: group.jid,
      name: group.name,
    };
  } catch (error) {
    logger.error(
      {
        event: 'whatsapp_create_group_error',
        error: buildErrorLog(error),
      },
      'createWhatsappGroup threw',
    );
    return null;
  }
};

export const sendWhatsappGroupMessage = async (groupJid: string, text: string) => {
  return sendWhatsappText(groupJid, text);
};

export const sendWhatsappImage = async (
  phone: string,
  imageUrl: string,
  caption?: string,
  options?: { companyId?: number; branding?: NotificationBranding | null },
) => {
  try {
    const brandedCaption = caption
      ? await buildBrandedText(caption, options)
      : undefined;

    return await wahaClient.sendImage(phone, imageUrl, brandedCaption);
  } catch (error) {
    logger.error(
      {
        event: 'whatsapp_image_send_failed',
        phone: maskPhone(phone),
        imageUrl,
        error: buildErrorLog(error),
      },
      'sendWhatsappImage returned failure',
    );
    return -1;
  }
};
