import assert from 'node:assert/strict';
import test from 'node:test';
import { RestaurantNotificationEvent } from '@prisma/client';
import { renderRestaurantReservationMessage } from '../src/services/restaurant-notification-template.service';
import { restaurantMetricsQuerySchema } from '../src/schemas/restaurant-reservation.schema';

const base = {
  customerName: 'Ada', restaurantName: 'Casa Ada', date: 'sábado, 15 de agosto de 2026', time: '20:00', partySize: 4,
  reservationCode: 'code_123', reservationUrl: 'https://app.example.com/shop/casa-ada/reservation/code_123',
};

test('pending and confirmed restaurant templates never use misleading wording', () => {
  const pending = renderRestaurantReservationMessage({ ...base, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED });
  const confirmed = renderRestaurantReservationMessage({ ...base, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED });
  assert.match(pending.text, /pendiente de confirmación/);
  assert.doesNotMatch(pending.text, /está confirmada/);
  assert.match(confirmed.text, /está confirmada/);
});

test('update template only describes customer-facing changes', () => {
  const message = renderRestaurantReservationMessage({ ...base, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_UPDATED, changes: { timeChanged: true } });
  assert.match(message.text, /Nueva hora/);
  assert.doesNotMatch(message.text, /Nueva fecha/);
});

test('customer and restaurant cancellations have distinct Spanish wording', () => {
  const customer = renderRestaurantReservationMessage({ ...base, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CANCELLED, cancellationActor: 'CUSTOMER' });
  const admin = renderRestaurantReservationMessage({ ...base, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CANCELLED, cancellationActor: 'ADMIN' });
  assert.match(customer.text, /Tu reserva.*fue cancelada/);
  assert.match(admin.text, /El restaurante canceló/);
});

test('metrics input only accepts local ISO date bounds', () => {
  assert.equal(restaurantMetricsQuerySchema.safeParse({ dateFrom: '2026-08-01', dateTo: '2026-08-31' }).success, true);
  assert.equal(restaurantMetricsQuerySchema.safeParse({ dateFrom: '08/01/2026' }).success, false);
});
