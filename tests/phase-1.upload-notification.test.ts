import assert from 'node:assert/strict';
import multer from 'multer';
import test from 'node:test';
import { errorHandler } from '../src/middlewares/error';
import {
  clearLocalEmailDeliveries,
  deliverEmail,
  getEmailProviderState,
  getLocalEmailDeliveries,
  setEmailTransportFactoryForTests,
} from '../src/services/notification-provider.service';
import {
  getWahaProviderState,
  isWahaDeliverySuccessful,
} from '../src/services/waha.service';
import {
  isWhatsappEnqueueAccepted,
  queueWhatsappCode,
  queueWhatsappText,
} from '../src/utils/whatsappSender';
import type { OutboundMessageRepository } from '../src/services/outbound-message.repository';
import { sendGenericEmail } from '../src/utils/sendEmail';
import {
  PUBLIC_UPLOAD_MAX_BYTES,
  PUBLIC_UPLOAD_MIME_TYPES,
  validateUploadFile,
} from '../src/utils/upload-validation';
import { UploadSecurityError, UPLOAD_ERROR_CODES } from '../src/utils/upload-errors';
import {
  buildStorageDeleteToken,
  verifyStorageDeleteToken,
} from '../src/utils/storageDeleteToken';

const ENV_KEYS = [
  'MAIL_ENABLED',
  'MAIL_TRANSPORT',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_SECURE',
  'MAIL_FROM',
  'MAIL_USER',
  'MAIL_PASS',
  'MAIL_CONNECTION_TIMEOUT_MS',
  'MAIL_GREETING_TIMEOUT_MS',
  'MAIL_SOCKET_TIMEOUT_MS',
  'WAHA_ENABLED',
  'WAHA_TRANSPORT',
  'WAHA_BASE_URL',
  'WAHA_API_KEY',
  'WAHA_SESSION',
  'WAHA_MIN_INTERVAL_MS',
  'WAHA_TIMEOUT_MS',
  'WAHA_DEFAULT_COUNTRY_CODE',
  'STORAGE_DELETE_TOKEN_SECRET',
  'BETTER_AUTH_SECRET',
  'JWT_SECRET',
  'AUTH_SECRET',
  'SESSION_SECRET',
];

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<string, string | undefined>;
const originalFetch = globalThis.fetch;

function restoreEnvironment(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
  clearLocalEmailDeliveries();
  setEmailTransportFactoryForTests(null);
}

function setEnvironment(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function pngFile(overrides: Partial<{ mimetype: string; originalname: string; buffer: Buffer }> = {}) {
  return {
    buffer: overrides.buffer ?? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimetype: overrides.mimetype ?? 'image/png',
    originalname: overrides.originalname ?? 'proof.png',
  };
}

function assertUploadError(action: () => unknown, expected: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof UploadSecurityError);
    assert.equal(error.errorCode, expected);
    return true;
  });
}

test.afterEach(() => {
  restoreEnvironment();
});

test('public upload validation requires allowed MIME, safe names, and matching signatures', () => {
  const valid = validateUploadFile(pngFile(), {
    maxBytes: PUBLIC_UPLOAD_MAX_BYTES,
    allowedMimeTypes: PUBLIC_UPLOAD_MIME_TYPES,
  });
  assert.deepEqual(valid, { mimeType: 'image/png', extension: 'png', size: 8 });

  assertUploadError(
    () => validateUploadFile(pngFile({ mimetype: 'text/plain' })),
    UPLOAD_ERROR_CODES.TYPE_NOT_ALLOWED,
  );
  assertUploadError(
    () => validateUploadFile(pngFile({ mimetype: 'image/jpeg' })),
    UPLOAD_ERROR_CODES.SIGNATURE_INVALID,
  );
  assertUploadError(
    () => validateUploadFile(pngFile({ originalname: '../proof.png' })),
    UPLOAD_ERROR_CODES.FILENAME_INVALID,
  );
  assertUploadError(
    () => validateUploadFile(pngFile({ originalname: 'proof.jpg' })),
    UPLOAD_ERROR_CODES.SIGNATURE_INVALID,
  );
  assertUploadError(
    () => validateUploadFile({ ...pngFile(), buffer: Buffer.alloc(PUBLIC_UPLOAD_MAX_BYTES + 1) }),
    UPLOAD_ERROR_CODES.TOO_LARGE,
  );
});

test('Multer size failures are normalized to a stable controlled client error', () => {
  let statusCode = 200;
  let payload: unknown;
  const response = {
    status(value: number) {
      statusCode = value;
      return response;
    },
    json(value: unknown) {
      payload = value;
      return response;
    },
  };

  errorHandler(new multer.MulterError('LIMIT_FILE_SIZE'), {} as never, response as never, (() => undefined) as never);

  assert.equal(statusCode, 413);
  assert.deepEqual(payload, {
    code: 413,
    error: true,
    errorCode: UPLOAD_ERROR_CODES.TOO_LARGE,
    reason: UPLOAD_ERROR_CODES.TOO_LARGE,
    message: 'El archivo supera el límite permitido.',
  });

  errorHandler(new multer.MulterError('LIMIT_UNEXPECTED_FILE'), {} as never, response as never, (() => undefined) as never);
  assert.equal(statusCode, 400);
  assert.deepEqual(payload, {
    code: 400,
    error: true,
    errorCode: UPLOAD_ERROR_CODES.MULTIPART_INVALID,
    reason: UPLOAD_ERROR_CODES.MULTIPART_INVALID,
    message: 'La carga del archivo no tiene un formato válido.',
  });
});

test('email provider states fail closed and never construct a remote transport when disabled or incomplete', async () => {
  let factoryCalls = 0;
  setEmailTransportFactoryForTests(() => {
    factoryCalls += 1;
    throw new Error('remote transport must not be constructed');
  });

  const disabledEnv = {
    ...process.env,
    MAIL_ENABLED: 'false',
    MAIL_TRANSPORT: 'smtp',
    MAIL_HOST: 'smtp.gmail.com',
    MAIL_FROM: 'noreply@example.test',
    MAIL_USER: 'user',
    MAIL_PASS: 'pass',
  };
  assert.deepEqual(getEmailProviderState(disabledEnv), {
    enabled: false,
    mode: 'disabled',
    configured: false,
    reason: 'PROVIDER_DISABLED',
  });
  const disabled = await deliverEmail({
    to: 'person@example.test',
    subject: 'disabled',
    html: '<p>disabled</p>',
  }, disabledEnv);
  assert.deepEqual(disabled, {
    provider: 'email',
    status: 'SKIPPED',
    reason: 'PROVIDER_DISABLED',
  });

  const incompleteEnv = {
    ...disabledEnv,
    MAIL_ENABLED: 'true',
    MAIL_TRANSPORT: 'smtp',
    MAIL_HOST: '',
    MAIL_FROM: '',
    MAIL_USER: '',
    MAIL_PASS: '',
  };
  assert.equal(getEmailProviderState(incompleteEnv).reason, 'PROVIDER_NOT_CONFIGURED');
  const incomplete = await deliverEmail({
    to: 'person@example.test',
    subject: 'incomplete',
    html: '<p>incomplete</p>',
  }, incompleteEnv);
  assert.deepEqual(incomplete, {
    provider: 'email',
    status: 'FAILED',
    reason: 'PROVIDER_NOT_CONFIGURED',
  });
  assert.equal(factoryCalls, 0);
});

test('email sink and configured remote transport produce explicit delivery outcomes', async () => {
  clearLocalEmailDeliveries();
  setEnvironment({ MAIL_ENABLED: 'true', MAIL_TRANSPORT: 'sink' });
  const sinkEnv = {
    ...process.env,
    MAIL_ENABLED: 'true',
    MAIL_TRANSPORT: 'sink',
  };
  const sinkResult = await sendGenericEmail('person@example.test', 'sink subject', '<p>sink</p>');
  assert.deepEqual(sinkResult, {
    provider: 'email',
    status: 'SENT',
    reason: 'LOCAL_SINK',
    providerId: 'local-sink',
  });
  assert.equal(getLocalEmailDeliveries().length, 1);

  const directSinkResult = await deliverEmail({
    to: 'person@example.test',
    subject: 'sink subject 2',
    html: '<p>sink 2</p>',
  }, sinkEnv);
  assert.equal(directSinkResult.status, 'SENT');
  assert.equal(directSinkResult.reason, 'LOCAL_SINK');
  assert.equal(getLocalEmailDeliveries().length, 2);

  const remoteEnv = {
    ...sinkEnv,
    MAIL_TRANSPORT: 'smtp',
    MAIL_HOST: 'mail.example.test',
    MAIL_PORT: '2525',
    MAIL_FROM: 'noreply@example.test',
    MAIL_USER: 'user',
    MAIL_PASS: 'pass',
  };
  let sentMessage: unknown;
  setEmailTransportFactoryForTests(() => ({
    async sendMail(message) {
      sentMessage = message;
      return { messageId: 'remote-test-1' };
    },
  }));
  const remoteResult = await deliverEmail({
    to: 'person@example.test',
    subject: 'remote subject',
    html: '<p>remote</p>',
  }, remoteEnv);
  assert.deepEqual(remoteResult, {
    provider: 'email',
    status: 'SENT',
    reason: 'REMOTE_SUCCESS',
    providerId: 'remote-test-1',
  });
  assert.deepEqual(sentMessage, {
    to: 'person@example.test',
    from: 'noreply@example.test',
    subject: 'remote subject',
    html: '<p>remote</p>',
  });

  for (const failure of [
    Object.assign(new Error('simulated SMTP timeout'), { code: 'ETIMEDOUT' }),
    Object.assign(new Error('simulated SMTP 4xx'), { responseCode: 421 }),
    Object.assign(new Error('simulated SMTP 5xx'), { responseCode: 550 }),
  ]) {
    setEmailTransportFactoryForTests(() => ({
      async sendMail() {
        throw failure;
      },
    }));
    const failedResult = await deliverEmail({
      to: 'person@example.test',
      subject: 'failure',
      html: '<p>failure</p>',
    }, remoteEnv);
    assert.deepEqual(failedResult, {
      provider: 'email',
      status: 'FAILED',
      reason: 'TRANSPORT_FAILED',
    });
  }
});

test('WhatsApp provider states skip safely, support a sink, and queue remote work', async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('network must not be reached');
  }) as typeof fetch;

  setEnvironment({
    WAHA_ENABLED: 'false',
    WAHA_TRANSPORT: 'remote',
    WAHA_BASE_URL: 'https://waha.example.test',
  });
  assert.equal(getWahaProviderState().reason, 'PROVIDER_DISABLED');
  const repository = {
    async createJob() {
      return { job: { id: 1, status: 'PENDING' }, duplicate: false };
    },
  } as unknown as OutboundMessageRepository;
  const disabled = await queueWhatsappText('71234567', 'disabled', {}, {
    repository,
    providerState: getWahaProviderState(),
  });
  assert.equal(disabled.status, 'SKIPPED');
  assert.equal(disabled.reason, 'PROVIDER_DISABLED');
  assert.equal(fetchCalls, 0);
  assert.equal(isWahaDeliverySuccessful(disabled), false);
  assert.equal(isWhatsappEnqueueAccepted(disabled), false);
  const disabledCode = await queueWhatsappCode('71234567', '123456', {}, {
    repository,
    providerState: getWahaProviderState(),
  });
  assert.equal(isWhatsappEnqueueAccepted(disabledCode), false);

  setEnvironment({ WAHA_ENABLED: 'true', WAHA_TRANSPORT: 'remote', WAHA_BASE_URL: undefined });
  const incomplete = await queueWhatsappText('71234567', 'incomplete', {}, {
    repository,
    providerState: getWahaProviderState(),
  });
  assert.equal(incomplete.status, 'REJECTED');
  assert.equal(incomplete.reason, 'PROVIDER_NOT_CONFIGURED');
  assert.equal(fetchCalls, 0);

  setEnvironment({ WAHA_ENABLED: 'true', WAHA_TRANSPORT: 'sink' });
  const sink = await queueWhatsappText('71234567', 'sink', {}, {
    repository,
    providerState: getWahaProviderState(),
  });
  assert.equal(sink.status, 'QUEUED');
  assert.equal(isWhatsappEnqueueAccepted(sink), true);
  assert.equal(fetchCalls, 0);

  setEnvironment({
    WAHA_ENABLED: 'true',
    WAHA_TRANSPORT: 'remote',
    WAHA_BASE_URL: 'https://waha.example.test',
    WAHA_MIN_INTERVAL_MS: '0',
    WAHA_TIMEOUT_MS: '100',
  });
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ error: 'upstream failure' }), { status: 502 });
  }) as typeof fetch;
  const queued = await queueWhatsappText('71234567', 'failure', {}, {
    repository,
    providerState: getWahaProviderState(),
  });
  assert.equal(queued.status, 'QUEUED');
  assert.equal(fetchCalls, 0);
});

test('storage delete tokens are path-bound and reject forged or mismatched paths', () => {
  process.env.STORAGE_DELETE_TOKEN_SECRET = 'phase-1-test-secret';
  const path = 'uploads/7/qr/proof.png';
  const token = buildStorageDeleteToken(path);
  assert.equal(verifyStorageDeleteToken(token, path), true);
  assert.equal(verifyStorageDeleteToken(token, 'uploads/8/qr/proof.png'), false);
  assert.equal(verifyStorageDeleteToken(`${token}x`, path), false);
});
