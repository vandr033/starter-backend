import test from 'node:test';
import assert from 'node:assert/strict';
import { FreeEventRegistrationStatus } from '@prisma/client';
import {
  buildFreeEventConfirmationContent,
  checkInFreeEventByReservationCode,
  getFreeRegistrationByReservationCode,
  isFreeRegistrationEligibleForCodeCheckIn,
  shouldGenerateFreeEventReservationCode,
} from '../src/services/free-event-registration.service';
import { generateUniqueSixDigitCode } from '../src/services/group-ticket.service';
import { prisma } from '../src/prisma/client';

test('free-event reservation code generation uses 6-character output', async () => {
  const code = await generateUniqueSixDigitCode({
    exists: async () => false,
    candidateFactory: () => '123456',
    maxAttempts: 1,
  });

  assert.equal(code, '123456');
  assert.equal(code.length, 6);
});

test('free-event reservation code generation retries on collision and stores unique code', async () => {
  const candidates = ['111111', '111111', '222222'];
  let index = 0;

  const code = await generateUniqueSixDigitCode({
    exists: async (candidate) => candidate === '111111',
    candidateFactory: () => {
      const next = candidates[index];
      index += 1;
      return next ?? '333333';
    },
    maxAttempts: 5,
  });

  assert.equal(code, '222222');
  assert.equal(index, 3);
});

test('free-event reservation code generation fails clearly when max attempts are exhausted', async () => {
  await assert.rejects(
    async () => generateUniqueSixDigitCode({
      exists: async () => true,
      candidateFactory: () => '111111',
      maxAttempts: 2,
    }),
    /Unable to generate a unique ticket code/,
  );
});

test('free-event code generation is enabled only for successful registration statuses', () => {
  assert.equal(shouldGenerateFreeEventReservationCode(FreeEventRegistrationStatus.CONFIRMED), true);
  assert.equal(shouldGenerateFreeEventReservationCode(FreeEventRegistrationStatus.PENDING), true);
  assert.equal(shouldGenerateFreeEventReservationCode(FreeEventRegistrationStatus.INTERESTED), false);
});

test('free-event check-in eligibility excludes interested records', () => {
  assert.equal(isFreeRegistrationEligibleForCodeCheckIn(FreeEventRegistrationStatus.CONFIRMED), true);
  assert.equal(isFreeRegistrationEligibleForCodeCheckIn(FreeEventRegistrationStatus.PENDING), true);
  assert.equal(isFreeRegistrationEligibleForCodeCheckIn(FreeEventRegistrationStatus.INTERESTED), false);
});

test('free-event confirmation content includes event name + reservation code in spanish', () => {
  const content = buildFreeEventConfirmationContent({
    locale: 'es',
    eventTitle: 'Prueba evento',
    firstName: 'Sebastian',
    reservationCode: '654321',
  });

  assert.match(content.whatsappMessage, /Prueba evento/);
  assert.match(content.whatsappMessage, /654321/);
  assert.match(content.whatsappMessage, /check-in/i);
  assert.match(content.emailHtml, /654321/);
});

test('free-event confirmation content includes event name + reservation code in english', () => {
  const content = buildFreeEventConfirmationContent({
    locale: 'en',
    eventTitle: 'Production Class',
    firstName: 'Sebastian',
    reservationCode: '112233',
  });

  assert.match(content.whatsappMessage, /Production Class/);
  assert.match(content.whatsappMessage, /112233/);
  assert.match(content.whatsappMessage, /check-in/i);
  assert.match(content.emailHtml, /112233/);
});

test('free-event check-in lookup filters by reservation code and valid statuses only', async () => {
  const freeRegModel = prisma.freeEventRegistration as {
    findFirst: (args: unknown) => Promise<unknown>;
  };
  const originalFindFirst = freeRegModel.findFirst;
  let capturedArgs: any = null;

  try {
    freeRegModel.findFirst = async (args: unknown) => {
      capturedArgs = args;
      return null;
    };

    const result = await getFreeRegistrationByReservationCode(10, 20, 'ABC123');
    assert.equal(result.code, 404);
    assert.equal(result.error, true);
    assert.equal(capturedArgs.where.company_id, 10);
    assert.equal(capturedArgs.where.group_event_id, 20);
    assert.equal(capturedArgs.where.reservation_code, 'ABC123');
    assert.deepEqual(capturedArgs.where.status, { in: ['CONFIRMED', 'PENDING'] });
  } finally {
    freeRegModel.findFirst = originalFindFirst;
  }
});

test('free-event check-in by reservation code marks first scan as valid then already used', async () => {
  const freeRegModel = prisma.freeEventRegistration as {
    findFirst: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
  const originalFindFirst = freeRegModel.findFirst;
  const originalUpdate = freeRegModel.update;
  let checkedInAt: Date | null = null;

  try {
    freeRegModel.findFirst = async () => ({
      id: 99,
      status: 'CONFIRMED',
      reservation_code: '445566',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      phone_prefix: '591',
      phone_number: '777777',
      checked_in_at: checkedInAt,
      checked_in_method: checkedInAt ? 'MANUAL' : null,
      user: null,
      group_event: {
        id: 20,
        title: 'Evento de prueba',
        start_at: new Date('2026-03-30T12:00:00.000Z'),
        end_at: new Date('2026-03-30T13:00:00.000Z'),
      },
    });

    freeRegModel.update = async () => {
      checkedInAt = new Date('2026-03-31T00:00:00.000Z');
      return {
        id: 99,
        reservation_code: '445566',
        checked_in_at: checkedInAt,
        checked_in_method: 'MANUAL',
        status: 'CONFIRMED',
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
        phone_prefix: '591',
        phone_number: '777777',
        group_event_id: 20,
      };
    };

    const first = await checkInFreeEventByReservationCode(10, 20, '445566', 'MANUAL' as any);
    assert.equal(first.code, 200);
    assert.equal(first.error, false);
    assert.equal((first.data as any)?.scan_status, 'VALID');

    const second = await checkInFreeEventByReservationCode(10, 20, '445566', 'MANUAL' as any);
    assert.equal(second.code, 200);
    assert.equal(second.error, false);
    assert.equal((second.data as any)?.scan_status, 'ALREADY_USED');
  } finally {
    freeRegModel.findFirst = originalFindFirst;
    freeRegModel.update = originalUpdate;
  }
});
