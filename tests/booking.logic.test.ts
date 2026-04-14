import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentStatus } from '@prisma/client';
import { resolveBookingPaymentStatus } from '../src/services/booking.service';

test('booking payment status keeps unpaid bookings distinct from proof-based payments', () => {
  assert.equal(resolveBookingPaymentStatus('NONE'), PaymentStatus.UNPAID);
  assert.equal(resolveBookingPaymentStatus('CASH'), PaymentStatus.PENDING_CONFIRMATION);
  assert.equal(resolveBookingPaymentStatus('QR'), PaymentStatus.PENDING_CONFIRMATION);
});

test('booking payment status stays conservative for unknown payment methods', () => {
  assert.equal(resolveBookingPaymentStatus('CARD'), PaymentStatus.PENDING_CONFIRMATION);
});

