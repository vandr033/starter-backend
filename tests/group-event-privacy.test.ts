import assert from 'node:assert/strict';
import test from 'node:test';

import { createGroupEventSchema, updateGroupEventSchema } from '../src/schemas/group.schema';

const baseEvent = {
  title: 'Link-only workshop',
  is_private: true,
  is_free: true,
  price_cents: 0,
  max_capacity: 12,
  start_at: '2026-10-10T14:00:00.000Z',
  end_at: '2026-10-10T16:00:00.000Z',
};

test('group event creation accepts and preserves link-only visibility', () => {
  const parsed = createGroupEventSchema.parse(baseEvent);
  assert.equal(parsed.is_private, true);
});

test('group event updates can change link-only visibility', () => {
  const parsed = updateGroupEventSchema.parse({ is_private: false });
  assert.equal(parsed.is_private, false);
});
