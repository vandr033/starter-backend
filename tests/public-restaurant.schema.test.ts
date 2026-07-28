import assert from 'node:assert/strict';
import test from 'node:test';
import { generateRestaurantReservationCode } from '../src/services/restaurant-reservation.service';
import {
  cancelPublicRestaurantReservationSchema,
  createPublicRestaurantReservationSchema,
  publicRestaurantAvailabilitySchema,
  publicRestaurantCodeSchema,
} from '../src/schemas/public-restaurant.schema';

test('public restaurant request accepts only customer-controlled reservation fields', () => {
  const valid = createPublicRestaurantReservationSchema.safeParse({
    date: '2026-08-15', time: '20:30', partySize: 4,
    customer: { name: 'Ada Lovelace', phone: '+59170000000', email: 'ada@example.com' }, notes: 'Cena familiar',
  });
  assert.equal(valid.success, true);
  const unsafe = createPublicRestaurantReservationSchema.safeParse({
    date: '2026-08-15', time: '20:30', partySize: 4, customer: { name: 'Ada Lovelace' }, tableId: 1,
  });
  assert.equal(unsafe.success, false);
});

test('public availability and cancellation inputs are bounded', () => {
  assert.equal(publicRestaurantAvailabilitySchema.safeParse({ date: '2026-08-15', partySize: '4' }).success, true);
  assert.equal(publicRestaurantAvailabilitySchema.safeParse({ date: '2026-08-15', partySize: 101 }).success, false);
  assert.equal(cancelPublicRestaurantReservationSchema.safeParse({ reason: 'Cambio de planes' }).success, true);
  assert.equal(cancelPublicRestaurantReservationSchema.safeParse({ reason: 'x'.repeat(501) }).success, false);
});

test('public reservation codes are non-sequential URL-safe tokens', () => {
  const first = generateRestaurantReservationCode(); const second = generateRestaurantReservationCode();
  assert.equal(first.length, 24); assert.match(first, /^[A-Za-z0-9_-]+$/); assert.notEqual(first, second);
  assert.equal(publicRestaurantCodeSchema.safeParse(first).success, true);
});
