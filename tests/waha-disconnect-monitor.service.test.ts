import assert from 'node:assert/strict';
import test from 'node:test';
import { createWahaDisconnectMonitor } from '../src/services/waha-disconnect-monitor.service';
import { WahaRequestError } from '../src/services/waha.service';

function createLoggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
  } as any;
}

test('sends one email for a continuous WAHA outage and another after reconnection', async () => {
  let status = 'WORKING';
  const emails: Array<{ to: string; subject: string; html: string }> = [];
  const monitor = createWahaDisconnectMonitor({
    env: {
      WAHA_SESSION: 'default',
      WAHA_DISCONNECT_ALERT_EMAIL: 'sebastian.andradeg@outlook.com',
    } as NodeJS.ProcessEnv,
    logger: createLoggerStub(),
    now: () => new Date('2026-09-03T15:00:00.000Z'),
    client: {
      async getSessionInfo() {
        return { data: { name: 'default', status } };
      },
    },
    async sendEmail(to, subject, html) {
      emails.push({ to, subject, html });
    },
  });

  await monitor.checkNow();
  status = 'STOPPED';
  await monitor.checkNow();
  status = 'SCAN_QR_CODE';
  await monitor.checkNow();

  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'sebastian.andradeg@outlook.com');
  assert.match(emails[0].subject, /WAHA disconnected/);
  assert.match(emails[0].html, /STOPPED/);
  assert.match(emails[0].html, /2026-09-03T15:00:00.000Z/);

  status = 'WORKING';
  await monitor.checkNow();
  status = 'FAILED';
  await monitor.checkNow();

  assert.equal(emails.length, 2);
  assert.match(emails[1].html, /FAILED/);
});

test('alerts when the configured WAHA session is already disconnected at startup', async () => {
  const recipients: string[] = [];
  const monitor = createWahaDisconnectMonitor({
    env: {} as NodeJS.ProcessEnv,
    logger: createLoggerStub(),
    client: {
      async getSessionInfo() {
        return { data: { name: 'default', status: 'STOPPED' } };
      },
    },
    async sendEmail(to) {
      recipients.push(to);
    },
  });

  await monitor.checkNow();

  assert.deepEqual(recipients, ['sebastian.andradeg@outlook.com']);
});

test('treats a missing WAHA session as a disconnect', async () => {
  const messages: string[] = [];
  const monitor = createWahaDisconnectMonitor({
    env: {} as NodeJS.ProcessEnv,
    logger: createLoggerStub(),
    client: {
      async getSessionInfo() {
        throw new WahaRequestError('Not found', {
          operation: 'loading WAHA session information',
          status: 404,
        });
      },
    },
    async sendEmail(_to, _subject, html) {
      messages.push(html);
    },
  });

  await monitor.checkNow();

  assert.equal(messages.length, 1);
  assert.match(messages[0], /SESSION_NOT_FOUND/);
});

test('retries the alert on the next check when email delivery fails', async () => {
  let attempts = 0;
  const monitor = createWahaDisconnectMonitor({
    env: {} as NodeJS.ProcessEnv,
    logger: createLoggerStub(),
    client: {
      async getSessionInfo() {
        return { data: { name: 'default', status: 'FAILED' } };
      },
    },
    async sendEmail() {
      attempts += 1;
      if (attempts === 1) throw new Error('SMTP unavailable');
    },
  });

  await monitor.checkNow();
  await monitor.checkNow();
  await monitor.checkNow();

  assert.equal(attempts, 2);
});

test('does not claim a disconnect when the WAHA status check itself fails', async () => {
  let emailsSent = 0;
  const monitor = createWahaDisconnectMonitor({
    env: {} as NodeJS.ProcessEnv,
    logger: createLoggerStub(),
    client: {
      async getSessionInfo() {
        throw new WahaRequestError('Timed out', {
          operation: 'loading WAHA session information',
        });
      },
    },
    async sendEmail() {
      emailsSent += 1;
    },
  });

  await monitor.checkNow();

  assert.equal(emailsSent, 0);
});
