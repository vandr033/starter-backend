import test from 'node:test';
import assert from 'node:assert/strict';
import { FreeEventRegistrationStatus } from '@prisma/client';
import {
  buildFreeEventOutcomeMeta,
  canSafelyAssociateRegistration,
  classifyFreeEventAccountCase,
  duplicateMessageForStatus,
} from '../src/services/free-event-registration.service';
import { canSafelyMatchOrphanFreeRegistration } from '../src/services/group-booking.service';

test('1) createAccount=false + event available => positive event outcome', () => {
  const outcome = buildFreeEventOutcomeMeta(false);
  assert.equal(outcome.eventOutcome, 'REGISTERED');
  assert.equal(outcome.modalType, 'POSITIVE');
});

test('2) createAccount=true + no existing email/phone + event available => account creation path + positive modal', () => {
  const accountCase = classifyFreeEventAccountCase(null, null);
  const outcome = buildFreeEventOutcomeMeta(false);
  assert.equal(accountCase, 'NONE');
  assert.equal(outcome.modalType, 'POSITIVE');
});

test('3) createAccount=true + no existing email/phone + event sold out => account creation path + negative modal', () => {
  const accountCase = classifyFreeEventAccountCase(null, null);
  const outcome = buildFreeEventOutcomeMeta(true);
  assert.equal(accountCase, 'NONE');
  assert.equal(outcome.eventOutcome, 'INTERESTED');
  assert.equal(outcome.modalType, 'NEGATIVE');
});

test('4) createAccount=true + email exists + phone not => ACCOUNT_FOUND_BY_EMAIL case', () => {
  const accountCase = classifyFreeEventAccountCase('user-email', null);
  assert.equal(accountCase, 'EMAIL_ONLY');
});

test('5) createAccount=true + phone exists + email not + sold out => ACCOUNT_FOUND_BY_PHONE + negative modal', () => {
  const accountCase = classifyFreeEventAccountCase(null, 'user-phone');
  const outcome = buildFreeEventOutcomeMeta(true);
  assert.equal(accountCase, 'PHONE_ONLY');
  assert.equal(outcome.modalType, 'NEGATIVE');
});

test('6) createAccount=true + email/phone belong to same user => ACCOUNT_ALREADY_EXISTS case', () => {
  const accountCase = classifyFreeEventAccountCase('same-user', 'same-user');
  assert.equal(accountCase, 'SAME_USER');
});

test('7) createAccount=true + email/phone belong to different users => ACCOUNT_CONFLICT_PHONE_EMAIL case', () => {
  const accountCase = classifyFreeEventAccountCase('user-email', 'user-phone');
  assert.equal(accountCase, 'CONFLICT');
});

test('8) duplicate event registration/interest maps correctly', () => {
  assert.equal(
    duplicateMessageForStatus(FreeEventRegistrationStatus.CONFIRMED),
    'DUPLICATE_REGISTRATION',
  );
  assert.equal(
    duplicateMessageForStatus(FreeEventRegistrationStatus.PENDING),
    'DUPLICATE_REGISTRATION',
  );
  assert.equal(
    duplicateMessageForStatus(FreeEventRegistrationStatus.INTERESTED),
    'DUPLICATE_INTEREST',
  );
});

test('9) reservation lookup safety requires strong identity match for orphan free registrations', () => {
  const identityEmails = new Set(['owner@example.com']);
  const identityPhones = [{ number: '777777', prefix: '591' }];

  const emailOnlyMatch = canSafelyAssociateRegistration({
    registrationEmail: 'owner@example.com',
    registrationPhonePrefix: '591',
    registrationPhoneNumber: '123123',
    identityEmails,
    identityPhoneVariants: identityPhones,
  });

  const fullMatch = canSafelyAssociateRegistration({
    registrationEmail: 'owner@example.com',
    registrationPhonePrefix: '591',
    registrationPhoneNumber: '777777',
    identityEmails,
    identityPhoneVariants: identityPhones,
  });

  const groupBookingFullMatch = canSafelyMatchOrphanFreeRegistration({
    registrationEmail: 'owner@example.com',
    registrationPhonePrefix: '591',
    registrationPhoneNumber: '777777',
    identityEmails,
    identityPhoneVariants: identityPhones,
  });

  assert.equal(emailOnlyMatch, false);
  assert.equal(fullMatch, true);
  assert.equal(groupBookingFullMatch, true);
});
