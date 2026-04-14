import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublicUploadToken,
  verifyPublicUploadToken,
} from '../src/utils/public-upload-token';

test('public upload token validates a matching company and purpose', () => {
  const token = createPublicUploadToken(42, 'BOOKING_PROOF', 60);
  const result = verifyPublicUploadToken(token, {
    companyId: 42,
    purpose: 'BOOKING_PROOF',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.companyId, 42);
    assert.equal(result.payload.purpose, 'BOOKING_PROOF');
  }
});

test('public upload token rejects company mismatches', () => {
  const token = createPublicUploadToken(42, 'BOOKING_PROOF', 60);
  const result = verifyPublicUploadToken(token, {
    companyId: 7,
    purpose: 'BOOKING_PROOF',
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'Upload token does not match company',
  });
});

test('public upload token rejects expired tokens', () => {
  const token = createPublicUploadToken(42, 'BOOKING_PROOF', -1);
  const result = verifyPublicUploadToken(token, {
    companyId: 42,
    purpose: 'BOOKING_PROOF',
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'Upload token expired',
  });
});

