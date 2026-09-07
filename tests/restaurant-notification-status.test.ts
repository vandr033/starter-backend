import assert from 'node:assert/strict';
import test from 'node:test';
import { mapWhatsappEnqueueToRestaurantDelivery } from '../src/services/restaurant-notification.service';

test('restaurant notification keeps a newly queued WhatsApp job pending', () => {
  assert.deepEqual(
    mapWhatsappEnqueueToRestaurantDelivery({ accepted: true, status: 'QUEUED', jobId: 41 }),
    { status: 'PENDING', jobId: 41, reason: 'QUEUED' },
  );
});

test('restaurant notification mirrors an existing durable lifecycle on duplicate enqueue', () => {
  assert.deepEqual(
    mapWhatsappEnqueueToRestaurantDelivery({ accepted: true, status: 'DUPLICATE', existingStatus: 'PROCESSING', jobId: 42 }),
    { status: 'PROCESSING', jobId: 42, reason: 'DUPLICATE_PROCESSING' },
  );
  assert.deepEqual(
    mapWhatsappEnqueueToRestaurantDelivery({ accepted: true, status: 'DUPLICATE', existingStatus: 'SENT', jobId: 43 }),
    { status: 'SENT', jobId: 43, reason: 'DUPLICATE_SENT' },
  );
  assert.deepEqual(
    mapWhatsappEnqueueToRestaurantDelivery({ accepted: true, status: 'DUPLICATE', existingStatus: 'EXPIRED', jobId: 44 }),
    { status: 'EXPIRED', jobId: 44, reason: 'DUPLICATE_EXPIRED' },
  );
});

test('restaurant notification preserves skipped and rejected enqueue outcomes', () => {
  assert.deepEqual(
    mapWhatsappEnqueueToRestaurantDelivery({ accepted: false, status: 'SKIPPED', reason: 'CHANNEL_DISABLED' }),
    { status: 'SKIPPED', reason: 'CHANNEL_DISABLED' },
  );
  assert.deepEqual(
    mapWhatsappEnqueueToRestaurantDelivery({ accepted: false, status: 'REJECTED', reason: 'QUEUE_REJECTED' }),
    { status: 'FAILED', reason: 'QUEUE_REJECTED' },
  );
});
