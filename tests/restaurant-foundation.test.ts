import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopPlan } from '@prisma/client';
import { isPlanFeatureEnabled } from '../src/config/plan-capabilities';
import {
  createRestaurantServicePeriodSchema,
  createRestaurantTableSchema,
  updateRestaurantSettingsSchema,
} from '../src/schemas/restaurant.schema';

test('Restaurant Lite is available on BUSINESS and PRO but not STARTER', () => {
  assert.equal(isPlanFeatureEnabled(ShopPlan.STARTER, 'RESTAURANT_MODULE'), false);
  assert.equal(isPlanFeatureEnabled(ShopPlan.BUSINESS, 'RESTAURANT_MODULE'), true);
  assert.equal(isPlanFeatureEnabled(ShopPlan.PRO, 'RESTAURANT_MODULE'), true);
});

test('restaurant settings reject invalid party-size ranges', () => {
  const result = updateRestaurantSettingsSchema.safeParse({
    average_dining_minutes: 90, slot_interval_minutes: 30, minimum_advance_minutes: 0,
    maximum_advance_days: 30, auto_confirm_reservations: true, allow_customer_cancellation: true,
    cancellation_limit_minutes: 120, minimum_party_size: 6, maximum_party_size: 4,
    require_phone: true, require_email: false, allow_walk_ins: true,
  });
  assert.equal(result.success, false);
});

test('service periods reject overnight times and accept adjacent daytime times', () => {
  assert.equal(createRestaurantServicePeriodSchema.safeParse({ day_of_week: 1, start_time: '22:00', end_time: '02:00' }).success, false);
  assert.equal(createRestaurantServicePeriodSchema.safeParse({ day_of_week: 1, start_time: '12:00', end_time: '15:00' }).success, true);
  assert.equal(createRestaurantServicePeriodSchema.safeParse({ day_of_week: 1, start_time: '15:00', end_time: '17:00' }).success, true);
});

test('table capacity validation requires a valid range', () => {
  assert.equal(createRestaurantTableSchema.safeParse({ dining_area_id: 1, name: 'T1', minimum_seats: 4, maximum_seats: 2 }).success, false);
  assert.equal(createRestaurantTableSchema.safeParse({ dining_area_id: 1, name: 'T1', minimum_seats: 2, maximum_seats: 4 }).success, true);
});
