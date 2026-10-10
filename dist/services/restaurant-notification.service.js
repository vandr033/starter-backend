"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapWhatsappEnqueueToRestaurantDelivery = mapWhatsappEnqueueToRestaurantDelivery;
exports.notifyRestaurantReservation = notifyRestaurantReservation;
exports.notifyRestaurantReservationGuests = notifyRestaurantReservationGuests;
exports.notifyRestaurantWaitlist = notifyRestaurantWaitlist;
exports.resendRestaurantReservationConfirmation = resendRestaurantReservationConfirmation;
exports.listRestaurantNotificationHistory = listRestaurantNotificationHistory;
const client_1 = require("@prisma/client");
const logger_1 = require("../config/logger");
const client_2 = require("../prisma/client");
const restaurant_notification_log_repo_1 = require("../repositories/restaurant-notification-log.repo");
const sendEmail_1 = require("../utils/sendEmail");
const whatsappSender_1 = require("../utils/whatsappSender");
const restaurant_notification_template_service_1 = require("./restaurant-notification-template.service");
const MAX_ERROR = 500;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function localDate(date, timezone) { return new Intl.DateTimeFormat('es-BO', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date); }
function localTime(date, timezone) { return new Intl.DateTimeFormat('es-BO', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
function errorSummary(error) {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'No se pudo entregar el mensaje.';
    return message.replace(/[\r\n]+/g, ' ').slice(0, MAX_ERROR);
}
function frontendBaseUrl() {
    const raw = process.env.FRONTEND_URL;
    if (!raw) {
        if (process.env.NODE_ENV !== 'production')
            return 'http://localhost:3000';
        logger_1.logger.error({ event: 'restaurant_notification_missing_frontend_url' }, 'Restaurant notification skipped because FRONTEND_URL is not configured');
        return null;
    }
    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol))
            throw new Error('protocol');
        return url.origin;
    }
    catch {
        logger_1.logger.error({ event: 'restaurant_notification_invalid_frontend_url' }, 'Restaurant notification skipped because FRONTEND_URL is invalid');
        return null;
    }
}
function publicUrl(slug, code) { const base = frontendBaseUrl(); return base ? `${base}/shop/${encodeURIComponent(slug)}/reservation/${encodeURIComponent(code)}` : null; }
function providerId(value) {
    const candidate = value?.data?.id ?? value?.data?.messageId ?? value?.data?.key?.id;
    return typeof candidate === 'string' ? candidate.slice(0, 255) : undefined;
}
function mapOutboxStatusToRestaurantStatus(status) {
    if (status === 'PROCESSING')
        return 'PROCESSING';
    if (status === 'SENT')
        return 'SENT';
    if (status === 'FAILED')
        return 'FAILED';
    if (status === 'EXPIRED')
        return 'EXPIRED';
    if (status === 'CANCELLED')
        return 'CANCELLED';
    return 'PENDING';
}
function mapWhatsappEnqueueToRestaurantDelivery(response) {
    if (!response || typeof response !== 'object') {
        return { status: 'FAILED', reason: 'WHATSAPP_TRANSPORT_FAILED' };
    }
    const result = response;
    const jobLink = typeof result.jobId === 'number' ? { jobId: result.jobId } : {};
    const duplicateReason = result.status === 'DUPLICATE'
        ? `DUPLICATE_${result.existingStatus ?? 'PENDING'}`
        : null;
    if (result.status === 'SKIPPED') {
        return { status: 'SKIPPED', reason: result.reason || 'PROVIDER_DISABLED' };
    }
    if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(response)) {
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
function maskRecipient(value) {
    if (!value)
        return null;
    if (value.includes('@')) {
        const [name, domain] = value.split('@');
        return `${name.slice(0, 2)}•••@${domain}`;
    }
    return `${value.slice(0, 3)}•••${value.slice(-2)}`;
}
async function startLog(companyId, reservationId, event, trigger, channel, recipient, dedupKey, reservationGuestId) {
    if (trigger === client_1.RestaurantNotificationTrigger.AUTOMATIC) {
        if (await restaurant_notification_log_repo_1.restaurantNotificationLogRepo.hasAutomaticSend(companyId, reservationId, event, dedupKey))
            return null;
        return restaurant_notification_log_repo_1.restaurantNotificationLogRepo.claimAutomatic({
            company_id: companyId,
            reservation_id: reservationId,
            reservation_guest_id: reservationGuestId ?? null,
            event,
            trigger,
            channel,
            recipient,
            status: client_1.RestaurantNotificationStatus.PENDING,
            dedup_key: dedupKey,
            dedup_claim_key: `${companyId}:reservation:${reservationId}:${event}:${dedupKey}:${channel}`,
        });
    }
    return restaurant_notification_log_repo_1.restaurantNotificationLogRepo.create({
        company_id: companyId,
        reservation_id: reservationId,
        reservation_guest_id: reservationGuestId ?? null,
        event,
        trigger,
        channel,
        recipient,
        status: client_1.RestaurantNotificationStatus.PENDING,
        dedup_key: dedupKey,
    });
}
async function finishLog(companyId, reservationId, event, channel, logId, result) {
    try {
        await restaurant_notification_log_repo_1.restaurantNotificationLogRepo.finalize(companyId, logId, {
            status: result.status,
            provider_id: result.providerId,
            error_code: result.status === 'FAILED' ? 'DELIVERY_FAILED' : result.status === 'SKIPPED' ? result.reason?.slice(0, 100) : null,
            error_message: result.reason?.slice(0, MAX_ERROR),
            sent_at: result.status === 'SENT' ? new Date() : null,
        });
    }
    catch (error) {
        logger_1.logger.error({ companyId, reservationId, event, channel, logId, err: error }, 'Restaurant notification log finalization failed');
    }
}
async function startWaitlistLog(companyId, waitlistId, event, channel, recipient, dedupKey) {
    const previous = await client_2.prisma.restaurantNotificationLog.findFirst({ where: { company_id: companyId, waitlist_id: waitlistId, event, trigger: client_1.RestaurantNotificationTrigger.AUTOMATIC, dedup_key: dedupKey, status: client_1.RestaurantNotificationStatus.SENT }, select: { id: true } });
    if (previous)
        return null;
    return restaurant_notification_log_repo_1.restaurantNotificationLogRepo.claimAutomatic({ company_id: companyId, waitlist_id: waitlistId, event, trigger: client_1.RestaurantNotificationTrigger.AUTOMATIC, channel, recipient, status: client_1.RestaurantNotificationStatus.PENDING, dedup_key: dedupKey, dedup_claim_key: `${companyId}:waitlist:${waitlistId}:${event}:${dedupKey}:${channel}` });
}
async function deliverWaitlistChannel(args, send) {
    const log = await startWaitlistLog(args.companyId, args.waitlistId, args.event, args.channel, args.recipient, args.dedupKey);
    if (!log)
        return { channel: args.channel, status: 'SKIPPED', reason: 'DUPLICATE_EVENT' };
    let result;
    try {
        result = await send(log.id);
    }
    catch (error) {
        result = { channel: args.channel, status: 'FAILED', reason: errorSummary(error) };
    }
    if (!result.jobId)
        await finishLog(args.companyId, args.waitlistId, args.event, args.channel, log.id, result);
    return result;
}
async function deliverChannel(args, send) {
    const log = await startLog(args.companyId, args.reservationId, args.event, args.trigger, args.channel, args.recipient, args.dedupKey, args.reservationGuestId);
    if (!log)
        return { channel: args.channel, status: 'SKIPPED', reason: 'DUPLICATE_EVENT' };
    let result;
    try {
        result = await send(log.id);
    }
    catch (error) {
        result = { channel: args.channel, status: 'FAILED', reason: errorSummary(error) };
    }
    if (!result.jobId)
        await finishLog(args.companyId, args.reservationId, args.event, args.channel, log.id, result);
    return result;
}
async function notifyRestaurantReservation({ companyId, reservationId, ...options }) {
    const reservation = await client_2.prisma.restaurantReservation.findFirst({
        where: { id: reservationId, company_id: companyId },
        select: {
            id: true, company_id: true, reservation_code: true, start_time: true, party_size: true, customer_name: true, customer_phone: true, customer_email: true, updated_at: true,
            company: { select: { slug: true, name: true, timezone: true, phone: true, phone_prefix: true, company_settings: { select: { send_email_notifications: true, send_whatsapp_notifications: true } } } },
        },
    });
    if (!reservation)
        return [];
    const trigger = options.trigger === 'MANUAL' ? client_1.RestaurantNotificationTrigger.MANUAL : client_1.RestaurantNotificationTrigger.AUTOMATIC;
    const dedupKey = `${options.event}:${reservation.updated_at.toISOString()}`;
    const url = publicUrl(reservation.company.slug, reservation.reservation_code);
    const message = (0, restaurant_notification_template_service_1.renderRestaurantReservationMessage)({
        event: options.event, customerName: reservation.customer_name, restaurantName: reservation.company.name,
        date: localDate(reservation.start_time, reservation.company.timezone), time: localTime(reservation.start_time, reservation.company.timezone),
        partySize: reservation.party_size, reservationCode: reservation.reservation_code,
        reservationUrl: url || '', cancellationActor: options.cancellationActor,
        changes: options.changes, supportPhone: reservation.company.phone || null,
    });
    const settings = reservation.company.company_settings;
    const whatsappEnabled = settings?.send_whatsapp_notifications ?? false;
    const emailEnabled = settings?.send_email_notifications ?? true;
    const results = [];
    const phone = reservation.customer_phone?.replace(/\D/g, '') || null;
    const whatsapp = await deliverChannel({ companyId: reservation.company_id, reservationId: reservation.id, event: options.event, trigger, channel: client_1.RestaurantNotificationChannel.WHATSAPP, recipient: phone, dedupKey }, async (logId) => {
        if (!url)
            return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_PUBLIC_BASE_URL' };
        if (!whatsappEnabled)
            return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
        if (!phone)
            return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_RECIPIENT' };
        if (phone.length < 6)
            return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'INVALID_RECIPIENT' };
        const response = await (0, whatsappSender_1.queueWhatsappText)(phone, message.text, {
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
    const mail = await deliverChannel({ companyId: reservation.company_id, reservationId: reservation.id, event: options.event, trigger, channel: client_1.RestaurantNotificationChannel.EMAIL, recipient: email, dedupKey }, async () => {
        if (!url)
            return { channel: 'EMAIL', status: 'SKIPPED', reason: 'MISSING_PUBLIC_BASE_URL' };
        if (!emailEnabled)
            return { channel: 'EMAIL', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
        if (!email)
            return { channel: 'EMAIL', status: 'SKIPPED', reason: 'MISSING_RECIPIENT' };
        if (!emailPattern.test(email))
            return { channel: 'EMAIL', status: 'SKIPPED', reason: 'INVALID_RECIPIENT' };
        const response = await (0, sendEmail_1.sendGenericEmail)(email, message.subject, message.html, { companyId: reservation.company_id });
        return { channel: 'EMAIL', status: response.status, reason: response.reason, providerId: response.providerId };
    });
    results.push(mail);
    for (const result of results)
        logger_1.logger.info({ reservationId: reservation.id, companyId: reservation.company_id, event: options.event, channel: result.channel, status: result.status, providerId: result.providerId }, 'Restaurant notification delivery result');
    return results;
}
async function notifyRestaurantReservationGuests({ companyId, reservationId }) {
    const reservation = await client_2.prisma.restaurantReservation.findFirst({
        where: { id: reservationId, company_id: companyId },
        select: {
            id: true, company_id: true, reservation_code: true, start_time: true, party_size: true,
            customer_name: true, status: true, updated_at: true,
            guests: { select: { id: true, name: true, whatsapp_phone: true } },
            company: { select: { slug: true, name: true, timezone: true, phone: true, company_settings: { select: { send_whatsapp_notifications: true } } } },
        },
    });
    if (!reservation?.guests.length)
        return [];
    const whatsappEnabled = reservation.company.company_settings?.send_whatsapp_notifications ?? false;
    return Promise.all(reservation.guests.map(async (guest) => {
        const dedupKey = `GUEST_INVITATION:${reservation.updated_at.toISOString()}:${guest.id}`;
        const result = await deliverChannel({ companyId: reservation.company_id, reservationId: reservation.id, event: client_1.RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED, trigger: client_1.RestaurantNotificationTrigger.AUTOMATIC, channel: client_1.RestaurantNotificationChannel.WHATSAPP, recipient: guest.whatsapp_phone, dedupKey, reservationGuestId: guest.id }, async (logId) => {
            if (!whatsappEnabled)
                return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
            const statusLine = reservation.status === 'CONFIRMED' ? 'La reserva está confirmada.' : 'La reserva está pendiente de confirmación.';
            const text = [
                `Hola, ${guest.name}.`, '',
                `${reservation.customer_name} te agregó como acompañante a una reserva en ${reservation.company.name}.`, statusLine,
                `Fecha: ${localDate(reservation.start_time, reservation.company.timezone)}`,
                `Hora: ${localTime(reservation.start_time, reservation.company.timezone)}`,
                `Personas: ${reservation.party_size}`,
                reservation.company.phone ? `Contacto: ${reservation.company.phone}` : null,
            ].join('\n');
            const response = await (0, whatsappSender_1.queueWhatsappText)(guest.whatsapp_phone, text, {
                companyId: reservation.company_id,
                sourceType: 'RESTAURANT_GUEST_INVITATION',
                sourceId: String(guest.id),
                dedupeKey: `restaurant-guest:${reservation.id}:${guest.id}:${dedupKey}`,
                expiresAt: reservation.start_time,
                restaurantNotificationLogId: logId,
            });
            return { channel: 'WHATSAPP', ...mapWhatsappEnqueueToRestaurantDelivery(response) };
        });
        logger_1.logger.info({ reservationId: reservation.id, companyId: reservation.company_id, guestId: guest.id, channel: result.channel, status: result.status, providerId: result.providerId }, 'Restaurant guest invitation delivery result');
        return result;
    }));
}
async function notifyRestaurantWaitlist(input) {
    const entry = await client_2.prisma.restaurantWaitlist.findFirst({ where: { id: input.waitlistId, company_id: input.companyId }, select: { id: true, guest_name: true, phone: true, email: true, party_size: true, estimated_wait_minutes: true, quoted_ready_at: true, company: { select: { name: true, phone: true, company_settings: { select: { send_email_notifications: true, send_whatsapp_notifications: true } } } } } });
    if (!entry)
        return [];
    const triggerKey = `${input.event}:${entry.quoted_ready_at?.toISOString() || entry.estimated_wait_minutes}`;
    const settings = entry.company.company_settings;
    const phone = entry.phone?.replace(/\D/g, '') || null;
    const text = input.event === client_1.RestaurantNotificationEvent.WAITLIST_TABLE_READY
        ? `Hola, ${entry.guest_name}. Tu mesa en ${entry.company.name} está lista. Acercate al restaurante${entry.company.phone ? ` o comunicate al ${entry.company.phone}` : ''}.`
        : `Hola, ${entry.guest_name}. Te agregamos a la lista de espera de ${entry.company.name}. Tiempo aproximado: ${entry.estimated_wait_minutes} minutos para ${entry.party_size} personas.`;
    const results = [];
    const whatsapp = await deliverWaitlistChannel({ companyId: input.companyId, waitlistId: input.waitlistId, event: input.event, channel: client_1.RestaurantNotificationChannel.WHATSAPP, recipient: phone, dedupKey: triggerKey }, async (logId) => {
        if (!(settings?.send_whatsapp_notifications ?? false))
            return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
        if (!phone)
            return { channel: 'WHATSAPP', status: 'SKIPPED', reason: 'MISSING_RECIPIENT' };
        const response = await (0, whatsappSender_1.queueWhatsappText)(phone, text, {
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
    const mail = await deliverWaitlistChannel({ companyId: input.companyId, waitlistId: input.waitlistId, event: input.event, channel: client_1.RestaurantNotificationChannel.EMAIL, recipient: email, dedupKey: triggerKey }, async () => {
        if (!(settings?.send_email_notifications ?? true))
            return { channel: 'EMAIL', status: 'SKIPPED', reason: 'CHANNEL_DISABLED' };
        if (!email || !emailPattern.test(email))
            return { channel: 'EMAIL', status: 'SKIPPED', reason: email ? 'INVALID_RECIPIENT' : 'MISSING_RECIPIENT' };
        const response = await (0, sendEmail_1.sendGenericEmail)(email, input.event === client_1.RestaurantNotificationEvent.WAITLIST_TABLE_READY ? 'Tu mesa está lista' : 'Lista de espera registrada', `<p>${text}</p>`, { companyId: input.companyId });
        return { channel: 'EMAIL', status: response.status, reason: response.reason, providerId: response.providerId };
    });
    results.push(mail);
    return results;
}
async function resendRestaurantReservationConfirmation(companyId, reservationId) {
    const reservation = await client_2.prisma.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, select: { id: true, status: true } });
    if (!reservation)
        return { code: 404, error: true, message: 'No encontramos la reserva.' };
    if (reservation.status !== 'PENDING' && reservation.status !== 'CONFIRMED')
        return { code: 409, error: true, message: 'No se puede reenviar una reserva que ya está en curso o finalizada.' };
    const event = reservation.status === 'PENDING' ? client_1.RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED : client_1.RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED;
    const results = await notifyRestaurantReservation({ companyId, reservationId: reservation.id, event, trigger: 'MANUAL' });
    return { code: 200, error: false, message: 'Reenvío procesado.', data: { reservationId, results } };
}
async function listRestaurantNotificationHistory(companyId, reservationId) {
    const reservation = await client_2.prisma.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, select: { id: true } });
    if (!reservation)
        return { code: 404, error: true, message: 'No encontramos la reserva.' };
    const logs = await restaurant_notification_log_repo_1.restaurantNotificationLogRepo.list(companyId, reservationId);
    return { code: 200, error: false, message: 'Operación realizada correctamente.', data: logs.map((log) => ({ ...log, recipient: maskRecipient(log.recipient) })) };
}
