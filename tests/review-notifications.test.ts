import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reviewNotificationDependencies,
  sendReviewRequestReminder,
} from '../src/utils/reviewNotifications';

const originalCompanyHasCapability =
  reviewNotificationDependencies.companyHasCapability;

test.afterEach(() => {
  reviewNotificationDependencies.companyHasCapability =
    originalCompanyHasCapability;
});

test('review request automation is blocked without Mensajeria Pro', async () => {
  reviewNotificationDependencies.companyHasCapability = async () => false;

  const result = await sendReviewRequestReminder({
    companyId: 41,
    bookingId: 91041,
    customerEmail: 'cliente@example.com',
    customerPhone: null,
    customerPhonePrefix: null,
    customerName: 'Cliente',
    companyName: 'Salon Demo',
    companySlug: 'salon-demo',
  });

  assert.equal(result.sent, false);
  assert.equal(result.reason, 'Feature not available on current plan');
});
