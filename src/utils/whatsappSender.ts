import { logger } from '../config/logger';
import { getWahaProviderState, wahaClient } from '../services/waha.service';
import {
  isWhatsappEnqueueAccepted,
  getWhatsappEnqueueLifecycleStatus,
  queueWhatsappBatch,
  queueWhatsappCode,
  queueWhatsappGroupMessage,
  queueWhatsappImage,
  queueWhatsappText,
  type WhatsappEnqueueResult,
  type WhatsappImageQueueOptions,
  type WhatsappQueueOptions,
} from '../services/outbound-message.service';
import { type NotificationBranding } from './notificationBranding';

/**
 * Application-facing WhatsApp API.
 *
 * These names remain as compatibility aliases for older integrations, but
 * they now persist an outbox job and return an enqueue result. The only code
 * allowed to call WAHA's transport methods is whatsapp-worker.service.ts.
 */
export const sendWhatsappCode = (
  phone: string,
  code: string,
  options?: WhatsappQueueOptions,
): Promise<WhatsappEnqueueResult> => queueWhatsappCode(phone, code, options);

export const sendWhatsappText = (
  phone: string,
  text: string,
  options?: WhatsappQueueOptions,
): Promise<WhatsappEnqueueResult> => queueWhatsappText(phone, text, options);

export const sendWhatsappImage = (
  phone: string,
  imageUrl: string,
  caption?: string,
  options?: WhatsappImageQueueOptions,
): Promise<WhatsappEnqueueResult> => queueWhatsappImage(phone, imageUrl, caption, options);

export const sendWhatsappGroupMessage = (
  groupJid: string,
  text: string,
  options?: WhatsappQueueOptions,
): Promise<WhatsappEnqueueResult> => queueWhatsappGroupMessage(groupJid, text, options);

export {
  isWhatsappEnqueueAccepted,
  getWhatsappEnqueueLifecycleStatus,
  queueWhatsappBatch,
  queueWhatsappCode,
  queueWhatsappGroupMessage,
  queueWhatsappImage,
  queueWhatsappText,
};

// Deprecated name retained for source compatibility. It describes enqueue
// acceptance now; actual provider submission is tracked on the outbox job.
export function isWhatsappDeliverySuccessful(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const typedResult = result as { accepted?: unknown; status?: unknown; existingStatus?: unknown };
  return typedResult.accepted === true
    && typedResult.status === 'DUPLICATE'
    && typedResult.existingStatus === 'SENT';
}

export const createWhatsappGroup = async (
  name: string,
  participantPhones: string[],
): Promise<{ jid: string; name: string } | null> => {
  const providerState = getWahaProviderState();
  if (providerState.mode !== 'remote' || !providerState.configured) {
    logger.info(
      { event: 'whatsapp_group_creation_skipped', reason: providerState.reason },
      'WhatsApp group creation skipped',
    );
    return null;
  }

  try {
    const group = await wahaClient.createGroup(name, participantPhones);
    return { jid: group.jid, name: group.name };
  } catch (error) {
    logger.error(
      {
        event: 'whatsapp_create_group_error',
        error: error instanceof Error ? error.message : 'Unknown WhatsApp group error',
      },
      'createWhatsappGroup failed',
    );
    return null;
  }
};

export type { NotificationBranding };
