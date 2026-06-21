import assert from 'node:assert/strict';
import test from 'node:test';
import { createWahaAdminService } from '../src/services/waha-admin.service';
import { WahaRequestError } from '../src/services/waha.service';

const originalSession = process.env.WAHA_SESSION;

function restoreEnv() {
  if (originalSession === undefined) {
    delete process.env.WAHA_SESSION;
  } else {
    process.env.WAHA_SESSION = originalSession;
  }
}

function createClientStub(overrides: Record<string, unknown>) {
  return {
    ...buildDefaultClient(),
    ...overrides,
  } as any;
}

function buildDefaultClient() {
  return {
    async getSessionInfo() {
      throw new Error('getSessionInfo was not stubbed for this test');
    },
    async getSessionMe() {
      return { data: null };
    },
    async createSession() {
      throw new Error('createSession was not stubbed for this test');
    },
    async startSession() {
      throw new Error('startSession was not stubbed for this test');
    },
    async restartSession() {
      throw new Error('restartSession was not stubbed for this test');
    },
    async logoutSession() {
      throw new Error('logoutSession was not stubbed for this test');
    },
    async getAuthQRCode() {
      throw new Error('getAuthQRCode was not stubbed for this test');
    },
  };
}

test.afterEach(() => {
  restoreEnv();
});

test('connected status response includes account details when WAHA session is working', async () => {
  process.env.WAHA_SESSION = 'default';

  const service = createWahaAdminService(
    createClientStub({
      async getSessionInfo() {
        return {
          data: {
            name: 'default',
            status: 'WORKING',
            me: {
              id: '59171234567@c.us',
              pushName: 'PriConPri Bot',
              jid: '59171234567:1@s.whatsapp.net',
            },
          },
        };
      },
    }),
  );

  const result = await service.getSessionStatus();
  const data = result.data as Record<string, any>;

  assert.equal(result.code, 200);
  assert.equal(result.error, false);
  assert.equal(data.session, 'default');
  assert.equal(data.status, 'CONNECTED');
  assert.equal(data.isConnected, true);
  assert.equal(data.needsQr, false);
  assert.equal(data.account?.pushName, 'PriConPri Bot');
  assert.equal(data.account?.id, '59171234567@c.us');
});

test('disconnected status response is returned for stopped sessions', async () => {
  process.env.WAHA_SESSION = 'default';

  const service = createWahaAdminService(
    createClientStub({
      async getSessionInfo() {
        return {
          data: {
            name: 'default',
            status: 'STOPPED',
          },
        };
      },
    }),
  );

  const result = await service.getSessionStatus();
  const data = result.data as Record<string, any>;

  assert.equal(result.code, 200);
  assert.equal(result.error, false);
  assert.equal(data.status, 'DISCONNECTED');
  assert.equal(data.isConnected, false);
  assert.equal(data.needsQr, false);
  assert.match(String(data.message), /stopped|Start/i);
});

test('QR rendering response returns a data URL when WAHA provides an image', async () => {
  process.env.WAHA_SESSION = 'default';

  const service = createWahaAdminService(
    createClientStub({
      async getSessionInfo() {
        return {
          data: {
            name: 'default',
            status: 'SCAN_QR_CODE',
          },
        };
      },
      async getAuthQRCode() {
        return {
          data: Buffer.from('png-bytes'),
          contentType: 'image/png',
        };
      },
    }),
  );

  const result = await service.getQRCode();
  const data = result.data as Record<string, any>;

  assert.equal(result.code, 200);
  assert.equal(data.status, 'QR');
  assert.equal(data.needsQr, true);
  assert.equal(data.qrFormat, 'image');
  assert.match(String(data.qr), /^data:image\/png;base64,/);
});

test('startSession creates the configured WAHA session when it does not exist yet', async () => {
  process.env.WAHA_SESSION = 'default';

  let createCalled = false;

  const service = createWahaAdminService(
    createClientStub({
      async startSession() {
        throw new WahaRequestError('Session not found', {
          operation: 'starting a WAHA session',
          status: 404,
        });
      },
      async createSession() {
        createCalled = true;
        return {
          data: {
            name: 'default',
            status: 'STARTING',
          },
        };
      },
      async getSessionInfo() {
        return {
          data: {
            name: 'default',
            status: 'STARTING',
          },
        };
      },
    }),
  );

  const result = await service.startSession();
  const data = result.data as Record<string, any>;

  assert.equal(createCalled, true);
  assert.equal(result.code, 200);
  assert.equal(data.status, 'STARTING');
});

test('WAHA API errors are surfaced as error responses for the dashboard', async () => {
  process.env.WAHA_SESSION = 'default';

  const service = createWahaAdminService(
    createClientStub({
      async getSessionInfo() {
        throw new WahaRequestError('Upstream failed', {
          operation: 'loading WAHA session information',
          status: 502,
          responseBody: { error: 'bad gateway' },
        });
      },
    }),
  );

  const result = await service.getSessionStatus();
  const data = result.data as Record<string, any>;

  assert.equal(result.code, 502);
  assert.equal(result.error, true);
  assert.equal(data.status, 'ERROR');
  assert.equal(data.isConnected, false);
  assert.match(String(result.message), /unavailable|Unable|WAHA/i);
});
