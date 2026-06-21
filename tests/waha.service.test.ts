import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WahaRequestError,
  assertWahaConfiguration,
  buildWahaChatId,
  createWahaClient,
  normalizeWhatsappPhoneNumber,
} from '../src/services/waha.service';
import { sendWhatsappText } from '../src/utils/whatsappSender';

const ENV_KEYS = [
  'WAHA_BASE_URL',
  'WAHA_API_KEY',
  'WAHA_SESSION',
  'WAHA_MIN_INTERVAL_MS',
  'WAHA_DEFAULT_COUNTRY_CODE',
];

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<string, string | undefined>;
const originalFetch = globalThis.fetch;

function restoreTestEnvironment() {
  for (const key of ENV_KEYS) {
    const originalValue = originalEnv[key];
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }

  globalThis.fetch = originalFetch;
}

function createLoggerSpy() {
  const debugLogs: Array<{ payload: unknown; message: string }> = [];
  const infoLogs: Array<{ payload: unknown; message: string }> = [];
  const warnLogs: Array<{ payload: unknown; message: string }> = [];
  const errorLogs: Array<{ payload: unknown; message: string }> = [];

  const pushLog = (
    target: Array<{ payload: unknown; message: string }>,
    args: unknown[],
  ) => {
    target.push({
      payload: args[0],
      message: typeof args[1] === 'string' ? args[1] : '',
    });
  };

  return {
    debugLogs,
    infoLogs,
    warnLogs,
    errorLogs,
    logger: {
      debug(...args: unknown[]) {
        pushLog(debugLogs, args);
      },
      info(...args: unknown[]) {
        pushLog(infoLogs, args);
      },
      warn(...args: unknown[]) {
        pushLog(warnLogs, args);
      },
      error(...args: unknown[]) {
        pushLog(errorLogs, args);
      },
    },
  };
}

test.afterEach(() => {
  restoreTestEnvironment();
});

test('normalizes WhatsApp phone numbers with a default country code', () => {
  assert.equal(normalizeWhatsappPhoneNumber('+591 (712) 34567'), '59171234567');
  assert.equal(normalizeWhatsappPhoneNumber('71234567'), '59171234567');
  assert.equal(
    normalizeWhatsappPhoneNumber('(555) 123-4567', { defaultCountryCode: '1' }),
    '15551234567',
  );
});

test('formats WAHA chat ids for contacts and preserves existing group ids', () => {
  assert.equal(buildWahaChatId('59171234567'), '59171234567@c.us');
  assert.equal(buildWahaChatId('+591 71234567'), '59171234567@c.us');
  assert.equal(buildWahaChatId('120363025973600000@g.us'), '120363025973600000@g.us');
});

test('sendText maps the existing payload to WAHA /api/sendText', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const { logger } = createLoggerSpy();

  const client = createWahaClient({
    env: {
      WAHA_BASE_URL: 'https://waha.priconpri.com',
      WAHA_API_KEY: 'test-api-key',
      WAHA_SESSION: 'default',
      WAHA_MIN_INTERVAL_MS: '0',
    } as NodeJS.ProcessEnv,
    logger,
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ id: 'msg-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await client.sendText('+591 71234567', 'Hello from WAHA');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, 'https://waha.priconpri.com/api/sendText');

  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(headers.get('X-Api-Key'), 'test-api-key');

  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    session: 'default',
    chatId: '59171234567@c.us',
    text: 'Hello from WAHA',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { id: 'msg-1' });
});

test('throws a clear configuration error when WAHA_BASE_URL is missing', () => {
  assert.throws(
    () => assertWahaConfiguration({ WAHA_BASE_URL: '' } as NodeJS.ProcessEnv),
    /WAHA_BASE_URL/,
  );
});

test('surfaces WAHA API error responses with status and response details', async () => {
  const { logger, errorLogs } = createLoggerSpy();

  const client = createWahaClient({
    env: {
      WAHA_BASE_URL: 'https://waha.priconpri.com',
      WAHA_API_KEY: 'test-api-key',
      WAHA_SESSION: 'default',
      WAHA_MIN_INTERVAL_MS: '0',
    } as NodeJS.ProcessEnv,
    logger,
    fetchImpl: async () => new Response(JSON.stringify({ error: 'upstream failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await assert.rejects(
    () => client.sendText('59171234567', 'Hello from WAHA'),
    (error: unknown) => {
      assert.ok(error instanceof WahaRequestError);
      assert.equal(error.status, 502);
      assert.deepEqual(error.responseBody, { error: 'upstream failed' });
      assert.match(error.message, /status 502/);
      return true;
    },
  );

  assert.ok(
    errorLogs.some((entry) => String(entry.message).includes('WAHA request failed')),
  );
});

test('sendWhatsappText keeps the legacy helper contract for existing flows', async () => {
  process.env.WAHA_BASE_URL = 'https://waha.priconpri.com';
  process.env.WAHA_API_KEY = 'test-api-key';
  process.env.WAHA_SESSION = 'default';
  process.env.WAHA_MIN_INTERVAL_MS = '0';

  let capturedPayload: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    capturedPayload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'compat-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const successResult = await sendWhatsappText('71234567', 'Mensaje de prueba');
  assert.notEqual(successResult, -1);
  assert.equal(capturedPayload?.['chatId'], '59171234567@c.us');
  assert.match(String(capturedPayload?.['text']), /Mensaje de prueba/);
  assert.match(String(capturedPayload?.['text']), /Priconpri/);

  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;

  const failedResult = await sendWhatsappText('71234567', 'Segundo mensaje');
  assert.equal(failedResult, -1);
});
