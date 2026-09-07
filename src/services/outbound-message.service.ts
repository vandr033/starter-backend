import { createHash, randomUUID } from 'node:crypto';
import {
  OutboundMessageChannel,
  OutboundMessageStatus,
  OutboundMessageType,
  Prisma,
} from '@prisma/client';
import { logger } from '../config/logger';
import {
  buildWahaChatId,
  getWahaProviderState,
  normalizeWhatsappPhoneNumber,
} from './waha.service';
import {
  createOutboundMessageRepository,
  outboundMessageRepository,
  type ClaimedOutboundJob,
  type CreateOutboundBatchInput,
  type CreateOutboundJobInput,
  type OutboundBatchProgress,
  type OutboundMessageRepository,
} from './outbound-message.repository';
import { wakeWhatsappWorker } from './whatsapp-worker-signals';
import {
  appendCompanyContactLine,
  getCompanyNotificationBranding,
  mergeBranding,
  type NotificationBranding,
} from '../utils/notificationBranding';

export type WhatsappEnqueueStatus = 'QUEUED' | 'DUPLICATE' | 'SKIPPED' | 'REJECTED';
export type WhatsappEnqueueLifecycleStatus = OutboundMessageStatus | 'SKIPPED';

export interface WhatsappEnqueueResult {
  accepted: boolean;
  status: WhatsappEnqueueStatus;
  jobId?: number;
  batchId?: string;
  reason?: string;
  existingStatus?: OutboundMessageStatus;
}

export interface WhatsappBatchEnqueueResult {
  accepted: boolean;
  status: WhatsappEnqueueStatus;
  batchId?: string;
  total: number;
  queued: number;
  pending?: number;
  duplicates: number;
  rejected: number;
  skipped: number;
  reason?: string;
}

export interface WhatsappQueueOptions {
  companyId?: number;
  branding?: NotificationBranding | null;
  sourceType?: string;
  sourceId?: string | null;
  dedupeKey?: string;
  expiresAt?: Date | null;
  maxAttempts?: number;
  batchId?: string | null;
  restaurantNotificationLogId?: number | null;
  bookingNotificationAttemptId?: number | null;
  installmentReminderLogId?: number | null;
  groupTicketId?: number | null;
}

export interface WhatsappImageQueueOptions extends WhatsappQueueOptions {
  fallbackText?: string;
  fallbackDedupeKey?: string;
}

export interface WhatsappBatchItem {
  recipient: string;
  text: string;
  sourceType?: string;
  sourceId?: string | null;
  dedupeKey?: string;
  expiresAt?: Date | null;
}

export interface WhatsappBatchOptions {
  companyId?: number;
  branding?: NotificationBranding | null;
  sourceType: string;
  sourceId?: string | null;
  idempotencyKey: string;
  createdByUserId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  maxAttempts?: number;
}

export interface WhatsappQueueDependencies {
  repository?: OutboundMessageRepository;
  providerState?: ReturnType<typeof getWahaProviderState>;
}

function safeSourceType(value?: string): string {
  const normalized = value?.trim() || 'WHATSAPP_MESSAGE';
  return normalized.slice(0, 64);
}

function safeSourceId(value?: string | null): string | null {
  if (!value) return null;
  return value.trim().slice(0, 191) || null;
}

function safeMaxAttempts(value?: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return 8;
  return Math.min(20, Math.floor(value));
}

function safeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) return `wa-batch:${randomUUID()}`;
  if (normalized.length <= 191) return normalized;
  return `wa-batch:${hashDedupeKey(normalized)}`;
}

export function hashDedupeKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildDedupeKey(value: string | undefined, fallback: string): string {
  return hashDedupeKey(value?.trim() || fallback);
}

function buildBrandedTextWithBranding(text: string, branding?: NotificationBranding | null): string {
  const trimmedText = text.trim();
  if (!trimmedText) throw new Error('WhatsApp message text is required.');

  return branding
    ? appendCompanyContactLine(trimmedText, branding)
    : trimmedText.includes('Priconpri')
      ? trimmedText
      : `${trimmedText}\n\nPriconpri`;
}

async function buildBrandedText(
  text: string,
  options?: { companyId?: number; branding?: NotificationBranding | null },
): Promise<string> {
  const companyBranding = options?.companyId
    ? await getCompanyNotificationBranding(options.companyId)
    : null;
  return buildBrandedTextWithBranding(text, mergeBranding(companyBranding, options?.branding));
}

function resolveRecipient(recipient: string): string {
  return buildWahaChatId(recipient);
}

function rejection(error: unknown, reason = 'QUEUE_REJECTED'): WhatsappEnqueueResult {
  const message = error instanceof Error ? error.message : reason;
  logger.error(
    {
      event: 'whatsapp_enqueue_rejected',
      reason,
      error: message.slice(0, 300),
    },
    'WhatsApp message could not be persisted to the outbox',
  );
  return { accepted: false, status: 'REJECTED', reason };
}

function batchRejection(error: unknown, total: number): WhatsappBatchEnqueueResult {
  const reason = error instanceof Error ? error.message : 'QUEUE_REJECTED';
  logger.error(
    {
      event: 'whatsapp_batch_enqueue_rejected',
      reason: reason.slice(0, 300),
    },
    'WhatsApp batch could not be persisted to the outbox',
  );
  return {
    accepted: false,
    status: 'REJECTED',
    total,
    queued: 0,
    duplicates: 0,
    rejected: total,
    skipped: 0,
    reason: 'QUEUE_REJECTED',
  };
}

function getRepository(dependencies?: WhatsappQueueDependencies): OutboundMessageRepository {
  return dependencies?.repository ?? outboundMessageRepository;
}

function getProviderState(dependencies?: WhatsappQueueDependencies) {
  return dependencies?.providerState ?? getWahaProviderState();
}

export async function queueWhatsappText(
  recipient: string,
  text: string,
  options: WhatsappQueueOptions = {},
  dependencies?: WhatsappQueueDependencies,
): Promise<WhatsappEnqueueResult> {
  const providerState = getProviderState(dependencies);
  if (providerState.mode === 'disabled') {
    logger.info(
      { event: 'whatsapp_delivery_skipped', reason: providerState.reason },
      'WhatsApp delivery skipped because the provider is disabled',
    );
    return { accepted: false, status: 'SKIPPED', reason: providerState.reason ?? 'PROVIDER_DISABLED' };
  }
  if (!providerState.configured) {
    return { accepted: false, status: 'REJECTED', reason: providerState.reason ?? 'PROVIDER_NOT_CONFIGURED' };
  }

  try {
    const chatId = resolveRecipient(recipient);
    const brandedText = await buildBrandedText(text, options);
    const sourceType = safeSourceType(options.sourceType);
    const dedupeKey = buildDedupeKey(
      options.dedupeKey,
      `${sourceType}:${options.sourceId ?? ''}:${chatId}:${brandedText}`,
    );
    const result = await getRepository(dependencies).createJob({
      companyId: options.companyId ?? null,
      channel: OutboundMessageChannel.WHATSAPP,
      messageType: OutboundMessageType.TEXT,
      recipient: chatId,
      payload: { text: brandedText },
      sourceType,
      sourceId: safeSourceId(options.sourceId),
      batchId: options.batchId ?? null,
      dedupeKey,
      maxAttempts: safeMaxAttempts(options.maxAttempts),
      expiresAt: options.expiresAt ?? null,
      restaurantNotificationLogId: options.restaurantNotificationLogId ?? null,
      bookingNotificationAttemptId: options.bookingNotificationAttemptId ?? null,
      installmentReminderLogId: options.installmentReminderLogId ?? null,
      groupTicketId: options.groupTicketId ?? null,
    });

    const status: WhatsappEnqueueStatus = result.duplicate ? 'DUPLICATE' : 'QUEUED';
    wakeWhatsappWorker();
    return {
      accepted: true,
      status,
      jobId: result.job.id,
      existingStatus: result.duplicate ? result.job.status : undefined,
      reason: providerState.configured ? undefined : providerState.reason ?? 'PROVIDER_NOT_CONFIGURED',
    };
  } catch (error) {
    return rejection(error);
  }
}

export async function queueWhatsappCode(
  recipient: string,
  code: string,
  options: WhatsappQueueOptions = {},
  dependencies?: WhatsappQueueDependencies,
): Promise<WhatsappEnqueueResult> {
  return queueWhatsappText(
    recipient,
    `Priconpri\n\nTu codigo de verificacion es: ${code}`,
    {
      ...options,
      sourceType: options.sourceType ?? 'WHATSAPP_OTP',
      dedupeKey: options.dedupeKey ?? `WHATSAPP_OTP:${options.sourceId ?? recipient}:${code}`,
    },
    dependencies,
  );
}

export async function queueWhatsappImage(
  recipient: string,
  imageUrl: string,
  caption?: string,
  options: WhatsappImageQueueOptions = {},
  dependencies?: WhatsappQueueDependencies,
): Promise<WhatsappEnqueueResult> {
  const providerState = getProviderState(dependencies);
  if (providerState.mode === 'disabled') {
    logger.info(
      { event: 'whatsapp_delivery_skipped', reason: providerState.reason },
      'WhatsApp image delivery skipped because the provider is disabled',
    );
    return { accepted: false, status: 'SKIPPED', reason: providerState.reason ?? 'PROVIDER_DISABLED' };
  }
  if (!providerState.configured) {
    return { accepted: false, status: 'REJECTED', reason: providerState.reason ?? 'PROVIDER_NOT_CONFIGURED' };
  }

  try {
    const chatId = resolveRecipient(recipient);
    const normalizedImageUrl = imageUrl.trim();
    if (!normalizedImageUrl) throw new Error('WhatsApp image URL is required.');
    const companyBranding = options.companyId
      ? await getCompanyNotificationBranding(options.companyId)
      : null;
    const branding = mergeBranding(companyBranding, options.branding);
    const brandedCaption = caption ? buildBrandedTextWithBranding(caption, branding) : undefined;
    const fallbackText = options.fallbackText
      ? buildBrandedTextWithBranding(options.fallbackText, branding)
      : undefined;
    const sourceType = safeSourceType(options.sourceType);
    const dedupeKey = buildDedupeKey(
      options.dedupeKey,
      `${sourceType}:${options.sourceId ?? ''}:${chatId}:${normalizedImageUrl}:${brandedCaption ?? ''}`,
    );
    const result = await getRepository(dependencies).createJob({
      companyId: options.companyId ?? null,
      channel: OutboundMessageChannel.WHATSAPP,
      messageType: OutboundMessageType.IMAGE,
      recipient: chatId,
      payload: {
        imageUrl: normalizedImageUrl,
        ...(brandedCaption ? { caption: brandedCaption } : {}),
        ...(fallbackText
          ? {
              fallbackText,
              fallbackDedupeKey: options.fallbackDedupeKey
                ?? `${options.dedupeKey ?? dedupeKey}:fallback`,
            }
          : {}),
      },
      sourceType,
      sourceId: safeSourceId(options.sourceId),
      batchId: options.batchId ?? null,
      dedupeKey,
      maxAttempts: safeMaxAttempts(options.maxAttempts),
      expiresAt: options.expiresAt ?? null,
      restaurantNotificationLogId: options.restaurantNotificationLogId ?? null,
      bookingNotificationAttemptId: options.bookingNotificationAttemptId ?? null,
      installmentReminderLogId: options.installmentReminderLogId ?? null,
      groupTicketId: options.groupTicketId ?? null,
    });

    const status: WhatsappEnqueueStatus = result.duplicate ? 'DUPLICATE' : 'QUEUED';
    wakeWhatsappWorker();
    return {
      accepted: true,
      status,
      jobId: result.job.id,
      existingStatus: result.duplicate ? result.job.status : undefined,
      reason: providerState.configured ? undefined : providerState.reason ?? 'PROVIDER_NOT_CONFIGURED',
    };
  } catch (error) {
    return rejection(error);
  }
}

export async function queueWhatsappGroupMessage(
  groupJid: string,
  text: string,
  options: WhatsappQueueOptions = {},
  dependencies?: WhatsappQueueDependencies,
): Promise<WhatsappEnqueueResult> {
  return queueWhatsappText(groupJid, text, {
    ...options,
    sourceType: options.sourceType ?? 'WHATSAPP_GROUP_MESSAGE',
  }, dependencies);
}

export async function queueWhatsappBatch(
  items: WhatsappBatchItem[],
  options: WhatsappBatchOptions,
  dependencies?: WhatsappQueueDependencies,
): Promise<WhatsappBatchEnqueueResult> {
  const total = items.length;
  const providerState = getProviderState(dependencies);
  if (providerState.mode === 'disabled') {
    logger.info(
      { event: 'whatsapp_batch_skipped', reason: providerState.reason, total },
      'WhatsApp batch skipped because the provider is disabled',
    );
    return {
      accepted: false,
      status: 'SKIPPED',
      total,
      queued: 0,
      duplicates: 0,
      rejected: 0,
      skipped: total,
      reason: providerState.reason ?? 'PROVIDER_DISABLED',
    };
  }
  if (!providerState.configured) {
    return {
      accepted: false,
      status: 'REJECTED',
      total,
      queued: 0,
      duplicates: 0,
      rejected: total,
      skipped: 0,
      reason: providerState.reason ?? 'PROVIDER_NOT_CONFIGURED',
    };
  }

  const jobs: CreateOutboundJobInput[] = [];
  let rejected = 0;
  let branding: NotificationBranding | null = options.branding ?? null;
  try {
    const companyBranding = options.companyId
      ? await getCompanyNotificationBranding(options.companyId)
      : null;
    branding = mergeBranding(companyBranding, options.branding);
  } catch (error) {
    return batchRejection(error, total);
  }
  for (const item of items) {
    try {
      const chatId = resolveRecipient(item.recipient);
      const brandedText = buildBrandedTextWithBranding(item.text, branding);
      const sourceType = safeSourceType(item.sourceType ?? options.sourceType);
      const dedupeKey = buildDedupeKey(
        item.dedupeKey,
        `${options.idempotencyKey}:${sourceType}:${item.sourceId ?? options.sourceId ?? ''}:${chatId}:${brandedText}`,
      );
      jobs.push({
        companyId: options.companyId ?? null,
        channel: OutboundMessageChannel.WHATSAPP,
        messageType: OutboundMessageType.TEXT,
        recipient: chatId,
        payload: { text: brandedText },
        sourceType,
        sourceId: safeSourceId(item.sourceId ?? options.sourceId),
        dedupeKey,
        maxAttempts: safeMaxAttempts(options.maxAttempts),
        expiresAt: item.expiresAt ?? null,
      });
    } catch {
      rejected += 1;
    }
  }

  if (jobs.length === 0) {
    return {
      accepted: false,
      status: 'REJECTED',
      total,
      queued: 0,
      duplicates: 0,
      rejected,
      skipped: 0,
      reason: 'NO_VALID_RECIPIENTS',
    };
  }

  try {
    const input: CreateOutboundBatchInput = {
      companyId: options.companyId ?? null,
      channel: OutboundMessageChannel.WHATSAPP,
      sourceType: safeSourceType(options.sourceType),
      sourceId: safeSourceId(options.sourceId),
      idempotencyKey: safeIdempotencyKey(options.idempotencyKey),
      createdByUserId: options.createdByUserId ?? null,
      metadata: options.metadata ?? null,
      jobs,
    };
    const repository = getRepository(dependencies);
    const result = await repository.createBatchAndJobs(input);
    const queued = result.createdJobCount;
    const duplicates = Math.max(0, jobs.length - queued);
    let pending = queued;
    try {
      pending = (await repository.getBatchProgress(result.batchId))?.pending ?? queued;
    } catch (error) {
      logger.warn(
        { event: 'whatsapp_batch_progress_unavailable', batchId: result.batchId, error: error instanceof Error ? error.message : 'Unknown error' },
        'WhatsApp batch was queued but its initial progress could not be read',
      );
    }
    wakeWhatsappWorker();
    return {
      accepted: true,
      status: result.duplicateBatch ? 'DUPLICATE' : 'QUEUED',
      batchId: result.batchId,
      total,
      queued,
      pending,
      duplicates,
      rejected,
      skipped: 0,
      reason: providerState.configured ? undefined : providerState.reason ?? 'PROVIDER_NOT_CONFIGURED',
    };
  } catch (error) {
    return batchRejection(error, total);
  }
}

export function isWhatsappEnqueueAccepted(result: unknown): boolean {
  if (!result || typeof result !== 'object' || !('accepted' in result)) return false;
  const typedResult = result as {
    accepted?: unknown;
    status?: unknown;
    existingStatus?: unknown;
  };
  if (typedResult.accepted !== true) return false;
  if (typedResult.status === 'QUEUED') return true;
  if (typedResult.status !== 'DUPLICATE') return false;
  return typedResult.existingStatus === undefined
    || typedResult.existingStatus === OutboundMessageStatus.PENDING
    || typedResult.existingStatus === OutboundMessageStatus.PROCESSING
    || typedResult.existingStatus === OutboundMessageStatus.SENT;
}

/**
 * Translate an enqueue response into the durable job lifecycle without
 * treating persistence as provider delivery. A rejected enqueue has no job
 * to advance, so callers may use FAILED for their own attempt record.
 */
export function getWhatsappEnqueueLifecycleStatus(result: unknown): WhatsappEnqueueLifecycleStatus {
  if (!result || typeof result !== 'object') return OutboundMessageStatus.FAILED;
  const typedResult = result as {
    accepted?: unknown;
    status?: unknown;
    existingStatus?: unknown;
  };
  if (typedResult.status === 'SKIPPED') return 'SKIPPED';
  if (typedResult.status === 'DUPLICATE') {
    const existingStatus = typedResult.existingStatus;
    if (Object.values(OutboundMessageStatus).includes(existingStatus as OutboundMessageStatus)) {
      return existingStatus as OutboundMessageStatus;
    }
    return typedResult.accepted === true
      ? OutboundMessageStatus.PENDING
      : OutboundMessageStatus.FAILED;
  }
  if (typedResult.status === 'QUEUED' && typedResult.accepted === true) {
    return OutboundMessageStatus.PENDING;
  }
  return OutboundMessageStatus.FAILED;
}

export async function getWhatsappBatchProgress(
  batchId: string,
  companyId?: number,
  repository: OutboundMessageRepository = outboundMessageRepository,
): Promise<OutboundBatchProgress | null> {
  return repository.getBatchProgress(batchId, companyId);
}

export async function getWhatsappJob(
  jobId: number,
  companyId?: number,
  repository: OutboundMessageRepository = outboundMessageRepository,
): Promise<ClaimedOutboundJob | null> {
  return repository.findJobById(jobId, companyId);
}

export async function retryWhatsappJob(
  jobId: number,
  companyId?: number,
  repository: OutboundMessageRepository = outboundMessageRepository,
): Promise<ClaimedOutboundJob | null> {
  const job = await repository.retryJob(jobId, companyId);
  if (job) wakeWhatsappWorker();
  return job;
}

export async function retryWhatsappBatch(
  batchId: string,
  companyId?: number,
  repository: OutboundMessageRepository = outboundMessageRepository,
): Promise<number> {
  const count = await repository.retryBatch(batchId, companyId);
  if (count > 0) wakeWhatsappWorker();
  return count;
}

export async function cancelWhatsappJob(
  jobId: number,
  companyId?: number,
  repository: OutboundMessageRepository = outboundMessageRepository,
): Promise<boolean> {
  return repository.cancelJob(jobId, companyId);
}

export async function cancelWhatsappBatch(
  batchId: string,
  companyId?: number,
  repository: OutboundMessageRepository = outboundMessageRepository,
): Promise<number> {
  return repository.cancelBatch(batchId, companyId);
}

export function normalizeWhatsappRecipient(phone: string): string {
  return normalizeWhatsappPhoneNumber(phone);
}

// Kept exported for tests and for small integrations that need the same
// repository instance as the application process.
export { createOutboundMessageRepository };
