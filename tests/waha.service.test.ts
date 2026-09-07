import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WahaRequestError,
  assertWahaConfiguration,
  buildWahaChatId,
  createWahaClient,
  getWahaProviderState,
  normalizeWhatsappPhoneNumber,
} from '../src/services/waha.service';
import { queueWhatsappText } from '../src/utils/whatsappSender';

const ENV_KEYS = [
  'WAHA_ENABLED',
  'WAHA_TRANSPORT',
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

  const result = await client.sendTextNow('+591 71234567', 'Hello from WAHA');

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
    () => client.sendTextNow('59171234567', 'Hello from WAHA'),
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

test('queueWhatsappText persists acceptance without making a provider call', async () => {
  process.env.WAHA_ENABLED = 'true';
  process.env.WAHA_TRANSPORT = 'remote';
  process.env.WAHA_BASE_URL = 'https://waha.priconpri.com';
  process.env.WAHA_API_KEY = 'test-api-key';
  process.env.WAHA_SESSION = 'default';
  process.env.WAHA_MIN_INTERVAL_MS = '0';

  let createCalls = 0;
  const repository = {
    async createJob(input: Record<string, unknown>) {
      createCalls += 1;
      return {
        job: { id: createCalls, status: 'PENDING' },
        duplicate: createCalls > 1,
        input,
      };
    },
  } as any;
  const providerState = getWahaProviderState();

  const first = await queueWhatsappText('71234567', 'Mensaje de prueba', {
    sourceType: 'TEST',
    sourceId: '1',
    dedupeKey: 'compat-1',
  }, { repository, providerState });
  const second = await queueWhatsappText('71234567', 'Segundo mensaje', {
    sourceType: 'TEST',
    sourceId: '1',
    dedupeKey: 'compat-1',
  }, { repository, providerState });

  assert.equal(first.status, 'QUEUED');
  assert.equal(second.status, 'DUPLICATE');
  assert.equal(createCalls, 2);
});
