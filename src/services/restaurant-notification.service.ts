import {
  RestaurantNotificationChannel,
  RestaurantNotificationEvent,
  RestaurantNotificationStatus,
  RestaurantNotificationTrigger,
} from '@prisma/client';
import { logger } from '../config/logger';
import { prisma } from '../prisma/client';
import { restaurantNotificationLogRepo } from '../repositories/restaurant-notification-log.repo';
import { sendGenericEmail } from '../utils/sendEmail';
import { isWhatsappEnqueueAccepted, queueWhatsappText } from '../utils/whatsappSender';
import { renderRestaurantReservationMessage, type RestaurantNotificationChanges } from './restaurant-notification-template.service';

export type RestaurantDeliveryResult = {
  channel: 'EMAIL' | 'WHATSAPP';
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'EXPIRED' | 'CANCELLED';
  providerId?: string;
  jobId?: number;
  reason?: string;
};

type NotifyOptions = {
  event: RestaurantNotificationEvent;
  trigger?: 'AUTOMATIC' | 'MANUAL';
  cancellationActor?: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  changes?: RestaurantNotificationChanges;
};

export type NotifyReservationOptions = NotifyOptions & {
  companyId: number;
  reservationId: number;
};

export type NotifyReservationGuestsOptions = {
  companyId: number;
  reservationId: number;
};

const MAX_ERROR = 500;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function localDate(date: Date, timezone: string) { return new Intl.DateTimeFormat('es-BO', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date); }
function localTime(date: Date, timezone: string) { return new Intl.DateTimeFormat('es-BO', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
function errorSummary(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'No se pudo entregar el mensaje.';
  return message.replace(/[\r\n]+/g, ' ').slice(0, MAX_ERROR);
}
function frontendBaseUrl(): string | null {
  const raw = process.env.FRONTEND_URL;
  if (!raw) {
    if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
    logger.error({ event: 'restaurant_notification_missing_frontend_url' }, 'Restaurant notification skipped because FRONTEND_URL is not configured');
    return null;
  }
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    return url.origin;
  } catch {
    logger.error({ event: 'restaurant_notification_invalid_frontend_url' }, 'Restaurant notification skipped because FRONTEND_URL is invalid');
    return null;
  }
}
function publicUrl(slug: string, code: string) { const base = frontendBaseUrl(); return base ? `${base}/shop/${encodeURIComponent(slug)}/reservation/${encodeURIComponent(code)}` : null; }
function providerId(value: unknown): string | undefined {
  const candidate = (value as any)?.data?.id ?? (value as any)?.data?.messageId ?? (value as any)?.data?.key?.id;
  return typeof candidate === 'string' ? candidate.slice(0, 255) : undefined;
}

function mapOutboxStatusToRestaurantStatus(status: string | undefined): RestaurantDeliveryResult['status'] {
  if (status === 'PROCESSING') return 'PROCESSING';
  if (status === 'SENT') return 'SENT';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'EXPIRED') return 'EXPIRED';
  if (status === 'CANCELLED') return 'CANCELLED';
  return 'PENDING';
}

export function mapWhatsappEnqueueToRestaurantDelivery(response: unknown): Pick<RestaurantDeliveryResult, 'status' | 'reason' | 'providerId' | 'jobId'> {
  if (!response || typeof response !== 'object') {
    return { status: 'FAILED', reason: 'WHATSAPP_TRANSPORT_FAILED' };
  }
  const result = response as { accepted?: boolean; status?: string; reason?: string; jobId?: number; existingStatus?: string };
  const jobLink = typeof result.jobId === 'number' ? { jobId: result.jobId } : {};
  const duplicateReason = result.status === 'DUPLICATE'
    ? `DUPLICATE_${result.existingStatus ?? 'PENDING'}`
    : null;
  if (result.status === 'SKIPPED') {
    return { status: 'SKIPPED', reason: result.reason || 'PROVIDER_DISABLED' };
  }
  if (!isWhatsappEnqueueAccepted(response)) {
    return {
      status: result.status === 'DUPLICATE' ? mapOutboxStatusToRestaurantStatus(result.existingStatus) : 'FAILED',
      ...jobLink,
      reason: result.reason || duplicateReason || 'WHATSAPP_ENQUEUE_FAILED',
    };
  }
  return {
    status: result.status === 'DUPLICATE' ? mapOutboxStatusToRestaurantStatus(result.existingStatus) : 'PENDING',
    ...jobLink,
    reason: duplicateReason || 'QUEUED',
  };
}
function maskRecipient(value: string | null) {
  if (!value) return null;
  if (value.includes('@')) { const [name, domain] = value.split('@'); return `${name.slice(0, 2)}•••@${domain}`; }
  return `${value.slice(0, 3)}•••${value.slice(-2)}`;
}

async function startLog(companyId: number, reservationId: number, event: RestaurantNotificationEvent, trigger: RestaurantNotificationTrigger, channel: RestaurantNotificationChannel, recipient: string | null, dedupKey: string, reservationGuestId?: number | null) {
  if (trigger === RestaurantNotificationTrigger.AUTOMATIC) {
    if (await restaurantNotificationLogRepo.hasAutomaticSend(companyId, reservationId, event, dedupKey)) return null;
    return restaurantNotificationLogRepo.claimAutomatic({
      company_id: companyId,
      reservation_id: reservationId,
      reservation_guest_id: reservationGuestId ?? null,
      event,
      trigger,
      channel,
      recipient,
      status: RestaurantNotificationStatus.PENDING,
      dedup_key: dedupKey,
      dedup_claim_key: `${companyId}:reservation:${reservationId}:${event}:${dedupKey}:${channel}`,
    });
  }
  return restaurantNotificationLogRepo.create({
    company_id: companyId,
    reservation_id: reservationId,
    reservation_guest_id: reservationGuestId ?? null,
    event,
    trigger,
    channel,
    recipient,
    status: RestaurantNotificationStatus.PENDING,
    dedup_key: dedupKey,
  });
}

async function finishLog(companyId: number, reservationId: number, event: RestaurantNotificationEvent, channel: RestaurantNotificationChannel, logId: number, result: RestaurantDeliveryResult) {
  try {
    await restaurantNotificationLogRepo.finalize(companyId, logId, {
      status: result.status as RestaurantNotificationStatus,
      provider_id: result.providerId,
      error_code: result.status === 'FAILED' ? 'DELIVERY_FAILED' : result.status === 'SKIPPED' ? result.reason?.slice(0, 100) : null,
      error_message: result.reason?.slice(0, MAX_ERROR),
      sent_at: result.status === 'SENT' ? new Date() : null,
    });
  } catch (error) {
    logger.error({ companyId, reservationId, event, channel, logId, err: error }, 'Restaurant notification log finalization failed');
  }
}

async function startWaitlistLog(companyId: number, waitlistId: number, event: RestaurantNotificationEvent, channel: RestaurantNotificationChannel, recipient: string | null, dedupKey: string) {
  const previous = await prisma.restaurantNotificationLog.findFirst({ where: { company_id: companyId, waitlist_id: waitlistId, event, trigger: RestaurantNotificationTrigger.AUTOMATIC, dedup_key: dedupKey, status: RestaurantNotificationStatus.SENT }, select: { id: true } });
  if (previous) return null;
  return restaurantNotificationLogRepo.claimAutomatic({ company_id: companyId, waitlist_id: waitlistId, event, trigger: RestaurantNotificationTrigger.AUTOMATIC, channel, recipient, status: RestaurantNotificationStatus.PENDING, dedup_key: dedupKey, dedup_claim_key: `${companyId}:waitlist:${waitlistId}:${event}:${dedupKey}:${channel}` });
}

async function deliverWaitlistChannel(args: { companyId: number; waitlistId: number; event: RestaurantNotificationEvent; channel: RestaurantNotificationChannel; recipient: string | null; dedupKey: string }, send: (logId: number) => Promise<RestaurantDeliveryResult>) {
  const log = await startWaitlistLog(args.companyId, args.waitlistId, args.event, args.channel, args.recipient, args.dedupKey);
  if (!log) return { channel: args.channel as 'WHATSAPP' | 'EMAIL', status: 'SKIPPED' as const, reason: 'DUPLICATE_EVENT' };
  let result: RestaurantDeliveryResult;
  try { result = await send(log.id); } catch (error) { result = { channel: args.channel as 'WHATSAPP' | 'EMAIL', status: 'FAILED', reason: errorSummary(error) }; }
  if (!result.jobId) await finishLog(args.companyId, args.waitlistId, args.event, args.channel, log.id, result);
  return result;
}

async function deliverChannel(args: { companyId: number; reservationId: number; event: RestaurantNotificationEvent; trigger: RestaurantNotificationTrigger; channel: RestaurantNotificationChannel; recipient: string | null; dedupKey: string; reservationGuestId?: number | null }, send: (logId: number) => Promise<RestaurantDeliveryResult>) {
  const log = await startLog(args.companyId, args.reservationId, args.event, args.trigger, args.channel, args.recipient, args.dedupKey, args.reservationGuestId);
  if (!log) return { channel: args.channel as 'WHATSAPP' | 'EMAIL', status: 'SKIPPED' as const, reason: 'DUPLICATE_EVENT' };
  let result: RestaurantDeliveryResult;
  try {
    result = await send(log.id);
  } catch (error) {
    result = { channel: args.channel as 'WHATSAPP' | 'EMAIL', status: 'FAILED', reason: errorSummary(error) };
  }
  if (!result.jobId) await finishLog(args.companyId, args.reservationId, args.event, args.channel, log.id, result);
  return result;
}

export async function notifyRestaurantReservation({ companyId, reservationId, ...options }: NotifyReservationOptions): Promise<RestaurantDeliveryResult[]> {
  const reservation = await prisma.restaurantReservation.findFirst({
    where: { id: reservationId, company_id: companyId },
    select: {
      id: true, company_id: true, reservation_code: true, start_time: true, party_size: true, customer_name: true, customer_phone: true, customer_email: true, updated_at: true,
      company: { select: { slug: true, name: true, timezone: true, phone: true, phone_prefix: true, company_settings: { select: { send_email_notifications: true, send_whatsapp_notifications: true } } } },
    },
  });
  if (!reservation) return [];
  const trigger = options.trigger === 'MANUAL' ? RestaurantNotificationTrigger.MANUAL : RestaurantNotificationTrigger.AUTOMATIC;
  const dedupKey = `${options.event}:${reservation.updated_at.toISOString()}`;
  const url = publicUrl(reservation.company.slug, reservation.reservation_code);
  const message = renderRestaurantReservationMessage({
    event: options.event, customerName: reservation.customer_name, restaurantName: reservation.company.name,
    date: localDate(reservation.start_time, reservation.company.timezone), time: localTime(reservation.start_time, reservation.company.timezone),
    partySize: reservation.party_size, reservationCode: reservation.reservation_code,
    reservationUrl: url || '', cancellationActor: options.cancellationActor,
    changes: options.changes, supportPhone: reservation.company.phone || null,
  });
  const settings = reservation.company.company_settings;
  const whatsappEnabled = settings?.send_whatsapp_notifications ?? false;
  const emailEnabled = settings?.send_email_notifications ?? true;
  const results: RestaurantDeliveryResult[] = [];
  const phone = reservation.customer_phone?.replace(/\D/g, '') || null;
  const whatsapp = await deliverChannel({ companyId: reservation.company_id, reservationId: reservation.id, event: options.event, trigger, channel: RestaurantNotificationChannel.WHATSAPP, recipient: phone, dedupKey }, async (logId) => {
    if (!url) return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_PUBLIC_BASE_URL' };
    if (!whatsappEnabled) return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
    if (!phone) return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_RECIPIENT' };
    if (phone.length < 6) return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'INVALID_RECIPIENT' };
    const response = await queueWhatsappText(phone, message.text, {
      companyId: reservation.company_id,
      sourceType: 'RESTAURANT_RESERVATION_NOTIFICATION',
      sourceId: String(reservation.id),
      dedupeKey: `restaurant-reservation:${reservation.id}:${options.event}:${dedupKey}`,
      expiresAt: reservation.start_time,
      restaurantNotificationLogId: logId,
    });
    return { channel: 'WHATSAPP', ...mapWhatsappEnqueueToRestaurantDelivery(response) };
  });
  results.push(whatsapp);
  const email = reservation.customer_email?.trim().toLowerCase() || null;
  const mail = await deliverChannel({ companyId: reservation.company_id, reservationId: reservation.id, event: options.event, trigger, channel: RestaurantNotificationChannel.EMAIL, recipient: email, dedupKey }, async () => {
    if (!url) return { channel: 'EMAIL', status: 'SKIPPED', reason: 'MISSING_PUBLIC_BASE_URL' };
    if (!emailEnabled) return { channel: 'EMAIL', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
    if (!email) return { channel: 'EMAIL', status: 'SKIPPED', reason: 'MISSING_RECIPIENT' };
    if (!emailPattern.test(email)) return { channel: 'EMAIL', status: 'SKIPPED', reason: 'INVALID_RECIPIENT' };
    const response = await sendGenericEmail(email, message.subject, message.html, { companyId: reservation.company_id });
    return { channel: 'EMAIL', status: response.status, reason: response.reason, providerId: response.providerId };
  });
  results.push(mail);
  for (const result of results) logger.info({ reservationId: reservation.id, companyId: reservation.company_id, event: options.event, channel: result.channel, status: result.status, providerId: result.providerId }, 'Restaurant notification delivery result');
  return results;
}

export async function notifyRestaurantReservationGuests({ companyId, reservationId }: NotifyReservationGuestsOptions): Promise<RestaurantDeliveryResult[]> {
  const reservation = await prisma.restaurantReservation.findFirst({
    where: { id: reservationId, company_id: companyId },
    select: {
      id: true, company_id: true, reservation_code: true, start_time: true, party_size: true,
      customer_name: true, status: true, updated_at: true,
      guests: { select: { id: true, name: true, whatsapp_phone: true } },
      company: { select: { slug: true, name: true, timezone: true, phone: true, company_settings: { select: { send_whatsapp_notifications: true } } } },
    },
  });
  if (!reservation?.guests.length) return [];
  const whatsappEnabled = reservation.company.company_settings?.send_whatsapp_notifications ?? false;
  return Promise.all(reservation.guests.map(async (guest) => {
    const dedupKey = `GUEST_INVITATION:${reservation.updated_at.toISOString()}:${guest.id}`;
    const result = await deliverChannel({ companyId: reservation.company_id, reservationId: reservation.id, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED, trigger: RestaurantNotificationTrigger.AUTOMATIC, channel: RestaurantNotificationChannel.WHATSAPP, recipient: guest.whatsapp_phone, dedupKey, reservationGuestId: guest.id }, async (logId) => {
      if (!whatsappEnabled) return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
      const statusLine = reservation.status === 'CONFIRMED' ? 'La reserva está confirmada.' : 'La reserva está pendiente de confirmación.';
      const text = [
        `Hola, ${guest.name}.`, '',
        `${reservation.customer_name} te agregó como acompañante a una reserva en ${reservation.company.name}.`, statusLine,
        `Fecha: ${localDate(reservation.start_time, reservation.company.timezone)}`,
        `Hora: ${localTime(reservation.start_time, reservation.company.timezone)}`,
        `Personas: ${reservation.party_size}`,
        reservation.company.phone ? `Contacto: ${reservation.company.phone}` : null,
      ].join('\n');
      const response = await queueWhatsappText(guest.whatsapp_phone, text, {
        companyId: reservation.company_id,
        sourceType: 'RESTAURANT_GUEST_INVITATION',
        sourceId: String(guest.id),
        dedupeKey: `restaurant-guest:${reservation.id}:${guest.id}:${dedupKey}`,
        expiresAt: reservation.start_time,
        restaurantNotificationLogId: logId,
      });
      return { channel: 'WHATSAPP', ...mapWhatsappEnqueueToRestaurantDelivery(response) };
    });
    logger.info({ reservationId: reservation.id, companyId: reservation.company_id, guestId: guest.id, channel: result.channel, status: result.status, providerId: result.providerId }, 'Restaurant guest invitation delivery result');
    return result;
  }));
}

export async function notifyRestaurantWaitlist(input: { companyId: number; waitlistId: number; event: RestaurantNotificationEvent }): Promise<RestaurantDeliveryResult[]> {
  const entry = await prisma.restaurantWaitlist.findFirst({ where: { id: input.waitlistId, company_id: input.companyId }, select: { id: true, guest_name: true, phone: true, email: true, party_size: true, estimated_wait_minutes: true, quoted_ready_at: true, company: { select: { name: true, phone: true, company_settings: { select: { send_email_notifications: true, send_whatsapp_notifications: true } } } } } });
  if (!entry) return [];
  const triggerKey = `${input.event}:${entry.quoted_ready_at?.toISOString() || entry.estimated_wait_minutes}`;
  const settings = entry.company.company_settings;
  const phone = entry.phone?.replace(/\D/g, '') || null;
  const text = input.event === RestaurantNotificationEvent.WAITLIST_TABLE_READY
    ? `Hola, ${entry.guest_name}. Tu mesa en ${entry.company.name} está lista. Acercate al restaurante${entry.company.phone ? ` o comunicate al ${entry.company.phone}` : ''}.`
    : `Hola, ${entry.guest_name}. Te agregamos a la lista de espera de ${entry.company.name}. Tiempo aproximado: ${entry.estimated_wait_minutes} minutos para ${entry.party_size} personas.`;
  const results: RestaurantDeliveryResult[] = [];
  const whatsapp = await deliverWaitlistChannel({ companyId: input.companyId, waitlistId: input.waitlistId, event: input.event, channel: RestaurantNotificationChannel.WHATSAPP, recipient: phone, dedupKey: triggerKey }, async (logId) => {
    if (!(settings?.send_whatsapp_notifications ?? false)) return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
    if (!phone) return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_RECIPIENT' };
    const response = await queueWhatsappText(phone, text, {
      companyId: input.companyId,
      sourceType: 'RESTAURANT_WAITLIST_NOTIFICATION',
      sourceId: String(input.waitlistId),
      dedupeKey: `restaurant-waitlist:${input.waitlistId}:${input.event}:${triggerKey}`,
      restaurantNotificationLogId: logId,
    });
    return { channel: 'WHATSAPP', ...mapWhatsappEnqueueToRestaurantDelivery(response) };
  });
  results.push(whatsapp);
  const email = entry.email?.trim().toLowerCase() || null;
  const mail = await deliverWaitlistChannel({ companyId: input.companyId, waitlistId: input.waitlistId, event: input.event, channel: RestaurantNotificationChannel.EMAIL, recipient: email, dedupKey: triggerKey }, async () => {
    if (!(settings?.send_email_notifications ?? true)) return { channel: 'EMAIL', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
    if (!email || !emailPattern.test(email)) return { channel: 'EMAIL', status: 'SKIPPED', reason: email ? 'INVALID_RECIPIENT' : 'MISSING_RECIPIENT' };
    const response = await sendGenericEmail(email, input.event === RestaurantNotificationEvent.WAITLIST_TABLE_READY ? 'Tu mesa está lista' : 'Lista de espera registrada', `<p>${text}</p>`, { companyId: input.companyId });
    return { channel: 'EMAIL', status: response.status, reason: response.reason, providerId: response.providerId };
  });
  results.push(mail);
  return results;
}

export async function resendRestaurantReservationConfirmation(companyId: number, reservationId: number) {
  const reservation = await prisma.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, select: { id: true, status: true } });
  if (!reservation) return { code: 404, error: true, message: 'No encontramos la reserva.' };
  if (reservation.status !== 'PENDING' && reservation.status !== 'CONFIRMED') return { code: 409, error: true, message: 'No se puede reenviar una reserva que ya está en curso o finalizada.' };
  const event = reservation.status === 'PENDING' ? RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED : RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED;
  const results = await notifyRestaurantReservation({ companyId, reservationId: reservation.id, event, trigger: 'MANUAL' });
  return { code: 200, error: false, message: 'Reenvío procesado.', data: { reservationId, results } };
}

export async function listRestaurantNotificationHistory(companyId: number, reservationId: number) {
  const reservation = await prisma.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, select: { id: true } });
  if (!reservation) return { code: 404, error: true, message: 'No encontramos la reserva.' };
  const logs = await restaurantNotificationLogRepo.list(companyId, reservationId);
  return { code: 200, error: false, message: 'Operación realizada correctamente.', data: logs.map((log) => ({ ...log, recipient: maskRecipient(log.recipient) })) };
}
