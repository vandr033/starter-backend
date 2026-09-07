import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRestaurantOperatingState,
  servicePeriodCovers,
} from '../src/services/restaurant-schedule.service';
import { getSafeMapUrl, getValidCoordinates } from '../src/utils/coordinates';

test('restaurant service periods drive public state and reservation availability', () => {
  const state = buildRestaurantOperatingState({
    date: '2026-09-07',
    timezone: 'America/La_Paz',
    periods: [
      { day_of_week: 1, start_time: '12:00', end_time: '15:00' },
      { day_of_week: 1, start_time: '18:00', end_time: '22:00' },
    ],
    now: new Date('2026-09-07T16:00:00.000Z'),
  });

  assert.equal(state.isOpen, true);
  assert.equal(state.reservationAvailable, true);
  assert.deepEqual(state.publicPeriods, [
    { start: '12:00', end: '15:00' },
    { start: '18:00', end: '22:00' },
  ]);
  assert.equal(servicePeriodCovers({ day_of_week: 1, start_time: '12:00', end_time: '15:00' }, '12:00', '14:00'), true);
  assert.equal(servicePeriodCovers({ day_of_week: 1, start_time: '12:00', end_time: '15:00' }, '14:30', '16:00'), false);
});

test('no effective service period means closed and no reservation availability', () => {
  const state = buildRestaurantOperatingState({
    date: '2026-09-07',
    timezone: 'America/La_Paz',
    periods: [],
    now: new Date('2026-09-07T16:00:00.000Z'),
  });

  assert.equal(state.isOpen, false);
  assert.equal(state.reservationAvailable, false);
  assert.equal(state.closedReason, 'NO_SERVICE_PERIOD');
  assert.deepEqual(state.publicPeriods, []);
});

test('the same instant is evaluated in the configured restaurant timezone', () => {
  const state = buildRestaurantOperatingState({
    date: '2026-09-07',
    timezone: 'America/La_Paz',
    periods: [{ day_of_week: 1, start_time: '20:00', end_time: '23:00' }],
    now: new Date('2026-09-08T02:30:00.000Z'),
  });

  assert.equal(state.isOpen, true);
});

test('coordinate validation rejects null-like, malformed, and out-of-range values but accepts zero', () => {
  const invalidCases: Array<[unknown, unknown]> = [
    [null, null],
    ['', ''],
    ['null', 'null'],
    ['abc', 'xyz'],
    [91, 0],
    [0, 181],
  ];
  for (const [latitude, longitude] of invalidCases) {
    assert.equal(getValidCoordinates(latitude as never, longitude as never), null);
  }

  assert.deepEqual(getValidCoordinates(0, 0), { latitude: 0, longitude: 0 });
  assert.deepEqual(getValidCoordinates('12.345', '-68.9'), { latitude: 12.345, longitude: -68.9 });
  assert.equal(getSafeMapUrl('null'), null);
  assert.equal(getSafeMapUrl('javascript:alert(1)'), null);
  assert.equal(getSafeMapUrl('https://maps.example.test/place'), 'https://maps.example.test/place');
});
