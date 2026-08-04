import assert from 'node:assert/strict';
import test from 'node:test';
import { copyShiftSchema, createRestaurantShiftSchema, replaceShiftAssignmentsSchema, relocateRestaurantReservationSchema, tableCombinationSchema, tableStateSchema, waiterInternalNoteSchema, waiterReservationStatusSchema } from '../src/schemas/restaurant-shift.schema';

test('shift input requires a same-day, timezone-aware operating window', () => {
  assert.equal(createRestaurantShiftSchema.safeParse({ name: 'Friday dinner', shift_date: '2026-08-07', start_time: '18:00', end_time: '23:30', timezone: 'America/La_Paz' }).success, true);
  assert.equal(createRestaurantShiftSchema.safeParse({ name: 'Invalid', shift_date: '2026-08-07', start_time: '23:30', end_time: '01:00' }).success, false);
});

test('shift copy and assignment payloads are bounded and structurally valid', () => {
  assert.equal(copyShiftSchema.safeParse({ shift_date: '2026-08-08' }).success, true);
  assert.equal(copyShiftSchema.safeParse({ shift_date: '08/08/2026' }).success, false);
  assert.equal(replaceShiftAssignmentsSchema.safeParse({ assignments: [{ table_id: 1, user_id: 'staff-1' }] }).success, true);
  assert.equal(replaceShiftAssignmentsSchema.safeParse({ assignments: [{ table_id: 0, user_id: 'staff-1' }] }).success, false);
});

test('combination and relocation inputs cannot reference ambiguous targets', () => {
  assert.equal(tableCombinationSchema.safeParse({ name: 'T1 + T2', table_ids: [1, 2] }).success, true);
  assert.equal(tableCombinationSchema.safeParse({ name: 'T1', table_ids: [1] }).success, false);
  assert.equal(relocateRestaurantReservationSchema.safeParse({ table_id: 1 }).success, true);
  assert.equal(relocateRestaurantReservationSchema.safeParse({ table_id: 1, combination_id: 2 }).success, false);
  assert.equal(relocateRestaurantReservationSchema.safeParse({}).success, false);
});

test('waiter actions are restricted to arrival and seating and notes need an owner', () => {
  assert.equal(waiterReservationStatusSchema.safeParse({ status: 'ARRIVED' }).success, true);
  assert.equal(waiterReservationStatusSchema.safeParse({ status: 'COMPLETED' }).success, false);
  assert.equal(waiterInternalNoteSchema.safeParse({ note: 'High chair', table_id: 3 }).success, true);
  assert.equal(waiterInternalNoteSchema.safeParse({ note: 'High chair' }).success, false);
});

test('blocked table state requires an operational reason', () => {
  assert.equal(tableStateSchema.safeParse({ status: 'BLOCKED' }).success, false);
  assert.equal(tableStateSchema.safeParse({ status: 'BLOCKED', blocked_reason: 'Broken leg' }).success, true);
  assert.equal(tableStateSchema.safeParse({ status: 'CLEANING' }).success, true);
});
