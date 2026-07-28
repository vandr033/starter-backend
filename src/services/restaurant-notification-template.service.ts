import { RestaurantNotificationEvent } from '@prisma/client';
import { escapeHtml } from '../utils/notificationBranding';

export type RestaurantNotificationChanges = {
  dateChanged?: boolean;
  timeChanged?: boolean;
  partySizeChanged?: boolean;
  notesChanged?: boolean;
};

export type RestaurantTemplateData = {
  event: RestaurantNotificationEvent;
  customerName: string;
  restaurantName: string;
  date: string;
  time: string;
  partySize: number;
  reservationCode: string;
  reservationUrl: string;
  cancellationActor?: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  changes?: RestaurantNotificationChanges;
  supportPhone?: string | null;
};

export type RestaurantRenderedMessage = { subject: string; text: string; html: string };

function lines(data: RestaurantTemplateData): string[] {
  const base = [
    `Hola, ${data.customerName}.`,
    '',
  ];
  if (data.event === 'RESTAURANT_RESERVATION_CREATED') {
    base.push(`Recibimos tu solicitud de reserva en ${data.restaurantName}.`, 'Tu reserva está pendiente de confirmación.');
  } else if (data.event === 'RESTAURANT_RESERVATION_CONFIRMED') {
    base.push(`Tu reserva en ${data.restaurantName} está confirmada.`);
  } else if (data.event === 'RESTAURANT_RESERVATION_CANCELLED') {
    base.push(data.cancellationActor === 'CUSTOMER'
      ? `Tu reserva en ${data.restaurantName} fue cancelada.`
      : `El restaurante canceló tu reserva en ${data.restaurantName}.`);
  } else if (data.event === 'RESTAURANT_RESERVATION_UPDATED') {
    base.push(`Tu reserva en ${data.restaurantName} fue actualizada.`);
    const changed = [
      data.changes?.dateChanged ? `Nueva fecha: ${data.date}` : null,
      data.changes?.timeChanged ? `Nueva hora: ${data.time}` : null,
      data.changes?.partySizeChanged ? `Personas: ${data.partySize}` : null,
      data.changes?.notesChanged ? 'Las notas de tu reserva fueron actualizadas.' : null,
    ].filter(Boolean) as string[];
    base.push(...changed);
  } else {
    base.push(`Recordatorio de tu reserva en ${data.restaurantName}.`);
  }
  if (data.event !== 'RESTAURANT_RESERVATION_UPDATED' || (!data.changes?.dateChanged && !data.changes?.timeChanged && !data.changes?.partySizeChanged)) {
    base.push(`Fecha: ${data.date}`, `Hora: ${data.time}`, `Personas: ${data.partySize}`);
  }
  base.push(`Código: ${data.reservationCode}`);
  if (data.event === 'RESTAURANT_RESERVATION_CONFIRMED') base.push('Puedes ver o cancelar tu reserva aquí:');
  else if (data.event === 'RESTAURANT_RESERVATION_UPDATED' || data.event === 'RESTAURANT_RESERVATION_CREATED') base.push('Puedes consultar los detalles aquí:');
  if (data.event !== 'RESTAURANT_RESERVATION_CANCELLED') base.push(data.reservationUrl);
  if (data.event === 'RESTAURANT_RESERVATION_CANCELLED' && data.cancellationActor !== 'CUSTOMER') {
    base.push('Para más información, comunícate directamente con el restaurante.');
  }
  if (data.supportPhone) base.push(`Contacto: ${data.supportPhone}`);
  return base;
}

function subject(data: RestaurantTemplateData) {
  const prefix: Record<RestaurantNotificationEvent, string> = {
    RESTAURANT_RESERVATION_CREATED: 'Solicitud de reserva recibida',
    RESTAURANT_RESERVATION_CONFIRMED: 'Reserva confirmada',
    RESTAURANT_RESERVATION_UPDATED: 'Reserva actualizada',
    RESTAURANT_RESERVATION_CANCELLED: 'Reserva cancelada',
    RESTAURANT_RESERVATION_REMINDER: 'Recordatorio de reserva',
  };
  return `${prefix[data.event]} — ${data.restaurantName}`;
}

export function renderRestaurantReservationMessage(data: RestaurantTemplateData): RestaurantRenderedMessage {
  const text = lines(data).join('\n');
  const safeLines = lines(data).map((line) => escapeHtml(line));
  const link = `<p><a href="${escapeHtml(data.reservationUrl)}" target="_blank" rel="noopener noreferrer">Ver reserva</a></p>`;
  return { subject: subject(data), text, html: `<p>${safeLines.join('<br/>')}</p>${data.event !== 'RESTAURANT_RESERVATION_CANCELLED' ? link : ''}` };
}
