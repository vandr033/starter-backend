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
import { sendWhatsappText } from '../utils/whatsappSender';
import { renderRestaurantReservationMessage, type RestaurantNotificationChanges } from './restaurant-notification-template.service';

export type RestaurantDeliveryResult = {
  channel: 'EMAIL' | 'WHATSAPP';
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  providerId?: string;
  reason?: string;
};

type NotifyOptions = {
  event: RestaurantNotificationEvent;
  trigger?: 'AUTOMATIC' | 'MANUAL';
  cancellationActor?: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  changes?: RestaurantNotificationChanges;
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
  // Backend-generated customer links have one trusted source. Do not derive it
  // from request headers or a browser-facing NEXT_PUBLIC_* variable.
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
function maskRecipient(value: string | null) {
  if (!value) return null;
  if (value.includes('@')) { const [name, domain] = value.split('@'); return `${name.slice(0, 2)}•••@${domain}`; }
  return `${value.slice(0, 3)}•••${value.slice(-2)}`;
}

async function persist(companyId: number, reservationId: number, event: RestaurantNotificationEvent, trigger: RestaurantNotificationTrigger, channel: RestaurantNotificationChannel, recipient: string | null, result: RestaurantDeliveryResult, dedupKey: string) {
  try {
    await restaurantNotificationLogRepo.create({
      company_id: companyId, reservation_id: reservationId, event, trigger, channel, recipient,
      status: result.status as RestaurantNotificationStatus, provider_id: result.providerId,
      error_code: result.status === 'FAILED' ? 'DELIVERY_FAILED' : result.status === 'SKIPPED' ? result.reason?.slice(0, 100) : null,
      error_message: result.reason?.slice(0, MAX_ERROR), dedup_key: dedupKey,
      sent_at: result.status === 'SENT' ? new Date() : null,
    });
  } catch (error) {
    logger.error({ companyId, reservationId, event, channel, err: error }, 'Restaurant notification log persistence failed');
  }
}

export async function notifyRestaurantReservation(reservationId: number, options: NotifyOptions): Promise<RestaurantDeliveryResult[]> {
  const reservation = await prisma.restaurantReservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true, company_id: true, reservation_code: true, start_time: true, party_size: true, customer_name: true, customer_phone: true, customer_email: true, updated_at: true,
      company: { select: { slug: true, name: true, timezone: true, phone: true, phone_prefix: true, company_settings: { select: { send_email_notifications: true, send_whatsapp_notifications: true } } } },
    },
  });
  if (!reservation) return [];
  const trigger = options.trigger === 'MANUAL' ? RestaurantNotificationTrigger.MANUAL : RestaurantNotificationTrigger.AUTOMATIC;
  const dedupKey = `${options.event}:${reservation.updated_at.toISOString()}`;
  if (trigger === RestaurantNotificationTrigger.AUTOMATIC && await restaurantNotificationLogRepo.hasAutomaticSend(reservation.id, options.event, dedupKey)) {
    return [
      { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'DUPLICATE_EVENT' },
      { channel: 'EMAIL', status: 'SKIPPED', reason: 'DUPLICATE_EVENT' },
    ];
  }
  const url = publicUrl(reservation.company.slug, reservation.reservation_code);
  if (!url) {
    const results: RestaurantDeliveryResult[] = [
      { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_PUBLIC_BASE_URL' },
      { channel: 'EMAIL', status: 'SKIPPED', reason: 'MISSING_PUBLIC_BASE_URL' },
    ];
    await Promise.all(results.map((result) => persist(reservation.company_id, reservation.id, options.event, trigger, result.channel, null, result, dedupKey)));
    return results;
  }
  const message = renderRestaurantReservationMessage({
    event: options.event, customerName: reservation.customer_name, restaurantName: reservation.company.name,
    date: localDate(reservation.start_time, reservation.company.timezone), time: localTime(reservation.start_time, reservation.company.timezone),
    partySize: reservation.party_size, reservationCode: reservation.reservation_code,
    reservationUrl: url, cancellationActor: options.cancellationActor,
    changes: options.changes, supportPhone: reservation.company.phone || null,
  });
  const settings = reservation.company.company_settings;
  const whatsappEnabled = settings?.send_whatsapp_notifications ?? false;
  const emailEnabled = settings?.send_email_notifications ?? true;
  const results: RestaurantDeliveryResult[] = [];

  // Restaurant reservations persist the complete E.164-style digits. Do not add the
  // restaurant's own prefix again: guests may use a different country prefix.
  const phone = reservation.customer_phone?.replace(/\D/g, '') || null;
  let whatsapp: RestaurantDeliveryResult;
  if (!whatsappEnabled) whatsapp = { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
  else if (!phone) whatsapp = { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_RECIPIENT' };
  else if (phone.length < 6) whatsapp = { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'INVALID_RECIPIENT' };
  else if (!process.env.WAHA_BASE_URL) whatsapp = { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_PROVIDER_CONFIGURATION' };
  else {
    try {
      const response = await sendWhatsappText(phone, message.text, { companyId: reservation.company_id });
      whatsapp = response === -1 ? { channel: 'WHATSAPP', status: 'FAILED', reason: 'El proveedor de WhatsApp rechazó o no pudo entregar el mensaje.' } : { channel: 'WHATSAPP', status: 'SENT', providerId: providerId(response) };
    } catch (error) { whatsapp = { channel: 'WHATSAPP', status: 'FAILED', reason: errorSummary(error) }; }
  }
  await persist(reservation.company_id, reservation.id, options.event, trigger, RestaurantNotificationChannel.WHATSAPP, phone, whatsapp, dedupKey);
  results.push(whatsapp);

  const email = reservation.customer_email?.trim().toLowerCase() || null;
  let mail: RestaurantDeliveryResult;
  if (!emailEnabled) mail = { channel: 'EMAIL', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
  else if (!email) mail = { channel: 'EMAIL', status: 'SKIPPED', reason: 'MISSING_RECIPIENT' };
  else if (!emailPattern.test(email)) mail = { channel: 'EMAIL', status: 'SKIPPED', reason: 'INVALID_RECIPIENT' };
  else if (!process.env.MAIL_FROM || !process.env.MAIL_HOST) mail = { channel: 'EMAIL', status: 'SKIPPED', reason: 'MISSING_PROVIDER_CONFIGURATION' };
  else {
    try { await sendGenericEmail(email, message.subject, message.html, { companyId: reservation.company_id }); mail = { channel: 'EMAIL', status: 'SENT' }; }
    catch (error) { mail = { channel: 'EMAIL', status: 'FAILED', reason: errorSummary(error) }; }
  }
  await persist(reservation.company_id, reservation.id, options.event, trigger, RestaurantNotificationChannel.EMAIL, email, mail, dedupKey);
  results.push(mail);
  for (const result of results) logger.info({ reservationId: reservation.id, companyId: reservation.company_id, event: options.event, channel: result.channel, status: result.status, providerId: result.providerId }, 'Restaurant notification delivery result');
  return results;
}

export async function notifyRestaurantReservationGuests(reservationId: number): Promise<RestaurantDeliveryResult[]> {
  const reservation = await prisma.restaurantReservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true, company_id: true, reservation_code: true, start_time: true, party_size: true,
      customer_name: true, status: true, updated_at: true,
      guests: { select: { id: true, name: true, whatsapp_phone: true } },
      company: { select: { slug: true, name: true, timezone: true, phone: true, company_settings: { select: { send_whatsapp_notifications: true } } } },
    },
  });
  if (!reservation?.guests.length) return [];

  const whatsappEnabled = reservation.company.company_settings?.send_whatsapp_notifications ?? false;
  const results = await Promise.all(reservation.guests.map(async (guest) => {
    const dedupKey = `GUEST_INVITATION:${reservation.updated_at.toISOString()}:${guest.id}`;
    if (await restaurantNotificationLogRepo.hasAutomaticSend(reservation.id, RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED, dedupKey)) {
      return { channel: 'WHATSAPP' as const, status: 'SKIPPED' as const, reason: 'DUPLICATE_EVENT' };
    }

    let result: RestaurantDeliveryResult;
    if (!whatsappEnabled) result = { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
    else if (!process.env.WAHA_BASE_URL) result = { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_PROVIDER_CONFIGURATION' };
    else {
      const statusLine = reservation.status === 'CONFIRMED' ? 'La reserva está confirmada.' : 'La reserva está pendiente de confirmación.';
      const text = [
        `Hola, ${guest.name}.`,
        '',
        `${reservation.customer_name} te agregó como acompañante a una reserva en ${reservation.company.name}.`,
        statusLine,
        `Fecha: ${localDate(reservation.start_time, reservation.company.timezone)}`,
        `Hora: ${localTime(reservation.start_time, reservation.company.timezone)}`,
        `Personas: ${reservation.party_size}`,
        reservation.company.phone ? `Contacto: ${reservation.company.phone}` : null,
      ].join('\n');
      try {
        const response = await sendWhatsappText(guest.whatsapp_phone, text, { companyId: reservation.company_id });
        result = response === -1
          ? { channel: 'WHATSAPP', status: 'FAILED', reason: 'El proveedor de WhatsApp rechazó o no pudo entregar el mensaje.' }
          : { channel: 'WHATSAPP', status: 'SENT', providerId: providerId(response) };
      } catch (error) {
        result = { channel: 'WHATSAPP', status: 'FAILED', reason: errorSummary(error) };
      }
    }

    await persist(reservation.company_id, reservation.id, RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED, RestaurantNotificationTrigger.AUTOMATIC, RestaurantNotificationChannel.WHATSAPP, guest.whatsapp_phone, result, dedupKey);
    if (result.status === 'SENT') {
      await prisma.restaurantReservationGuest.update({ where: { id: guest.id }, data: { invited_at: new Date() } });
    }
    logger.info({ reservationId: reservation.id, companyId: reservation.company_id, guestId: guest.id, channel: result.channel, status: result.status, providerId: result.providerId }, 'Restaurant guest invitation delivery result');
    return result;
  }));
  return results;
}

export async function resendRestaurantReservationConfirmation(companyId: number, reservationId: number) {
  const reservation = await prisma.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, select: { id: true, status: true } });
  if (!reservation) return { code: 404, error: true, message: 'No encontramos la reserva.' };
  if (reservation.status !== 'PENDING' && reservation.status !== 'CONFIRMED') return { code: 409, error: true, message: 'No se puede reenviar una reserva que ya está en curso o finalizada.' };
  const event = reservation.status === 'PENDING' ? RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED : RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED;
  const results = await notifyRestaurantReservation(reservation.id, { event, trigger: 'MANUAL' });
  return { code: 200, error: false, message: 'Reenvío procesado.', data: { reservationId, results } };
}

export async function listRestaurantNotificationHistory(companyId: number, reservationId: number) {
  const reservation = await prisma.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, select: { id: true } });
  if (!reservation) return { code: 404, error: true, message: 'No encontramos la reserva.' };
  const logs = await restaurantNotificationLogRepo.list(companyId, reservationId);
  return { code: 200, error: false, message: 'Operación realizada correctamente.', data: logs.map((log) => ({ ...log, recipient: maskRecipient(log.recipient) })) };
}
