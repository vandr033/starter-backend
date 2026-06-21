import { logger } from '../config/logger';
import { canonicalizePhoneParts, normalizePhoneDigits } from '../utils/phoneNormalization';

const DEFAULT_WAHA_SESSION = 'default';
const DEFAULT_WAHA_TIMEOUT_MS = 15_000;
const DEFAULT_WAHA_MIN_INTERVAL_MS = 5_000;
const DEFAULT_COUNTRY_CODE = '591';

type FetchLike = typeof fetch;
type LoggerLike = Pick<typeof logger, 'debug' | 'info' | 'warn' | 'error'>;
type WahaRequestResponseType = 'default' | 'buffer';

export interface WahaConfig {
  baseUrl: string;
  apiKey: string | null;
  session: string;
  timeoutMs: number;
  minIntervalMs: number;
  defaultCountryCode: string;
}

export interface WahaSendResult<T = unknown> {
  status: number;
  data: T;
  contentType?: string | null;
}

export interface WahaHealthCheckResult {
  ok: boolean;
  session: string;
  sessionExists: boolean;
  sessions: string[];
  raw: unknown;
}

export interface WahaMeInfo {
  id?: string;
  lid?: string;
  jid?: string;
  pushName?: string;
  [key: string]: unknown;
}

export interface WahaSessionInfo {
  name: string;
  status: string;
  me?: WahaMeInfo | null;
  assignedWorker?: string | null;
  presence?: string | null;
  timestamps?: {
    activity?: number | null;
    [key: string]: unknown;
  } | null;
  apps?: unknown[] | null;
  [key: string]: unknown;
}

export interface WahaQRCodeRawValue {
  value?: string;
}

export class WahaRequestError extends Error {
  status?: number;
  responseBody?: unknown;
  operation: string;
  cause?: unknown;

  constructor(
    message: string,
    options: {
      operation: string;
      status?: number;
      responseBody?: unknown;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'WahaRequestError';
    this.operation = options.operation;
    this.status = options.status;
    this.responseBody = options.responseBody;
    this.cause = options.cause;
  }
}

function normalizeOptionalString(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBaseUrl(value?: string | null): string | null {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

function parseNonNegativeInt(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function resolveDefaultCountryCode(
  env: NodeJS.ProcessEnv = process.env,
  override?: string,
): string {
  return (
    normalizePhoneDigits(override || env.WAHA_DEFAULT_COUNTRY_CODE || DEFAULT_COUNTRY_CODE)
    || DEFAULT_COUNTRY_CODE
  );
}

export function resolveWahaConfig(env: NodeJS.ProcessEnv = process.env): WahaConfig {
  const baseUrl = normalizeBaseUrl(env.WAHA_BASE_URL);
  if (!baseUrl) {
    throw new Error('Missing WAHA_BASE_URL env var for the WAHA WhatsApp integration.');
  }

  try {
    new URL(baseUrl);
  } catch {
    throw new Error(`Invalid WAHA_BASE_URL env var: "${baseUrl}".`);
  }

  return {
    baseUrl,
    apiKey: normalizeOptionalString(env.WAHA_API_KEY),
    session: normalizeOptionalString(env.WAHA_SESSION) || DEFAULT_WAHA_SESSION,
    timeoutMs: parseNonNegativeInt(env.WAHA_TIMEOUT_MS, DEFAULT_WAHA_TIMEOUT_MS) || DEFAULT_WAHA_TIMEOUT_MS,
    minIntervalMs: parseNonNegativeInt(env.WAHA_MIN_INTERVAL_MS, DEFAULT_WAHA_MIN_INTERVAL_MS),
    defaultCountryCode: resolveDefaultCountryCode(env),
  };
}

export function assertWahaConfiguration(env: NodeJS.ProcessEnv = process.env): WahaConfig {
  return resolveWahaConfig(env);
}

export function normalizeWhatsappPhoneNumber(
  phone: string,
  options?: { defaultCountryCode?: string; env?: NodeJS.ProcessEnv },
): string {
  const rawPhone = normalizeOptionalString(phone);
  if (!rawPhone) {
    throw new Error('WhatsApp phone number is required.');
  }

  const digits = normalizePhoneDigits(rawPhone);
  if (!digits || digits.length < 6) {
    throw new Error(`Invalid WhatsApp phone number: "${phone}".`);
  }

  const canonical = canonicalizePhoneParts({
    phoneNumber: digits,
    defaultPrefix: resolveDefaultCountryCode(options?.env, options?.defaultCountryCode),
  });

  if (!canonical.fullPhone) {
    throw new Error(`Unable to normalize WhatsApp phone number: "${phone}".`);
  }

  return canonical.fullPhone;
}

export function buildWahaChatId(
  to: string,
  options?: { defaultCountryCode?: string; env?: NodeJS.ProcessEnv },
): string {
  const trimmed = normalizeOptionalString(to);
  if (!trimmed) {
    throw new Error('WhatsApp destination is required.');
  }

  if (/^[^@\s]+@(c|g)\.us$/.test(trimmed)) {
    return trimmed;
  }

  const normalizedPhone = normalizeWhatsappPhoneNumber(trimmed, options);
  return `${normalizedPhone}@c.us`;
}

function maskDestination(destination: string): string {
  const digits = normalizePhoneDigits(destination);
  if (!digits) return destination;
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

function formatErrorLog(error: unknown) {
  if (error instanceof WahaRequestError) {
    return {
      name: error.name,
      message: error.message,
      operation: error.operation,
      status: error.status,
      responseBody: error.responseBody,
      cause: error.cause instanceof Error ? error.cause.message : error.cause,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown WAHA error',
    raw: error,
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

async function parseBufferResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.startsWith('text/')) {
    return parseResponseBody(response);
  }

  return Buffer.from(await response.arrayBuffer());
}

function extractSessionNames(payload: unknown): string[] {
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { sessions?: unknown[] }).sessions)
      ? (payload as { sessions: unknown[] }).sessions
      : [];

  return records
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (!entry || typeof entry !== 'object') return null;
      if (typeof (entry as { name?: unknown }).name === 'string') {
        return (entry as { name: string }).name;
      }
      if (typeof (entry as { session?: unknown }).session === 'string') {
        return (entry as { session: string }).session;
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
}

function resolveSessionName(config: WahaConfig, sessionName?: string | null): string {
  return normalizeOptionalString(sessionName) || config.session;
}

function extractGroupId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const directCandidates = [
    (payload as { id?: unknown }).id,
    (payload as { groupId?: unknown }).groupId,
    (payload as { gid?: unknown }).gid,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const nestedData = (payload as { data?: unknown }).data;
  if (nestedData && typeof nestedData === 'object') {
    const nestedId = (nestedData as { id?: unknown }).id;
    if (typeof nestedId === 'string' && nestedId.trim()) {
      return nestedId.trim();
    }
  }

  return null;
}

function extractGroupName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const candidates = [
    (payload as { subject?: unknown }).subject,
    (payload as { name?: unknown }).name,
    (payload as { groupName?: unknown }).groupName,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const nestedData = (payload as { data?: unknown }).data;
  if (nestedData && typeof nestedData === 'object') {
    const nestedName = (nestedData as { subject?: unknown; name?: unknown }).subject
      ?? (nestedData as { subject?: unknown; name?: unknown }).name;
    if (typeof nestedName === 'string' && nestedName.trim()) {
      return nestedName.trim();
    }
  }

  return null;
}

function inferImageMimeType(imageUrl: string): string {
  const sanitizedUrl = imageUrl.split('?')[0].toLowerCase();
  if (sanitizedUrl.endsWith('.png')) return 'image/png';
  if (sanitizedUrl.endsWith('.webp')) return 'image/webp';
  if (sanitizedUrl.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function inferImageFilename(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    const filename = url.pathname.split('/').filter(Boolean).pop();
    return filename || 'image';
  } catch {
    return 'image';
  }
}

export function createWahaClient(options?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  logger?: LoggerLike;
}) {
  const env = options?.env ?? process.env;
  const fetchImpl = options?.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const log = options?.logger ?? logger;

  let apiKeyWarningLogged = false;
  let lastSendAt = 0;
  let sendQueue: Promise<unknown> = Promise.resolve();
  let sendSequence = 0;

  async function waitForRateLimitWindow(config: WahaConfig) {
    const elapsed = Date.now() - lastSendAt;
    const waitMs = Math.max(0, config.minIntervalMs - elapsed);
    if (waitMs <= 0) return;

    log.debug(
      {
        event: 'whatsapp_send_waiting_for_rate_limit',
        waitMs,
        minIntervalMs: config.minIntervalMs,
      },
      'Waiting before next WhatsApp send',
    );

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  async function request<T>(
    path: string,
    init: RequestInit,
    meta: { operation: string; destination?: string | null },
    configOverride?: WahaConfig,
    responseType: WahaRequestResponseType = 'default',
  ): Promise<WahaSendResult<T>> {
    const config = configOverride ?? resolveWahaConfig(env);
    const url = new URL(path.replace(/^\//, ''), `${config.baseUrl}/`).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (config.apiKey) {
      headers.set('X-Api-Key', config.apiKey);
    } else if (!apiKeyWarningLogged) {
      apiKeyWarningLogged = true;
      log.warn(
        {
          event: 'waha_api_key_missing',
          session: config.session,
        },
        'WAHA_API_KEY is not configured; requests will be sent without X-Api-Key.',
      );
    }

    try {
      const response = await fetchImpl(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const data = responseType === 'buffer'
        ? await parseBufferResponseBody(response)
        : await parseResponseBody(response);

      if (!response.ok) {
        log.error(
          {
            event: 'waha_request_failed',
            operation: meta.operation,
            status: response.status,
            destination: meta.destination ? maskDestination(meta.destination) : null,
            responseBody: data,
          },
          'WAHA request failed',
        );

        throw new WahaRequestError(
          `WAHA request failed with status ${response.status} while ${meta.operation}.`,
          {
            operation: meta.operation,
            status: response.status,
            responseBody: data,
          },
        );
      }

      return {
        status: response.status,
        data: data as T,
        contentType: response.headers.get('content-type'),
      };
    } catch (error) {
      if (error instanceof WahaRequestError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new WahaRequestError(
          `WAHA request timed out after ${config.timeoutMs}ms while ${meta.operation}.`,
          {
            operation: meta.operation,
            cause: error,
          },
        );

        log.error(
          {
            event: 'waha_request_timeout',
            operation: meta.operation,
            destination: meta.destination ? maskDestination(meta.destination) : null,
            timeoutMs: config.timeoutMs,
          },
          'WAHA request timed out',
        );

        throw timeoutError;
      }

      const wrappedError = new WahaRequestError(
        `WAHA request failed while ${meta.operation}.`,
        {
          operation: meta.operation,
          cause: error,
        },
      );

      log.error(
        {
          event: 'waha_request_error',
          operation: meta.operation,
          destination: meta.destination ? maskDestination(meta.destination) : null,
          error: formatErrorLog(error),
        },
        'WAHA request errored',
      );

      throw wrappedError;
    } finally {
      clearTimeout(timeout);
    }
  }

  function enqueueWhatsappSend<T>(
    task: (config: WahaConfig) => Promise<T>,
    meta: { destination: string; messageType: 'text' | 'image' },
  ): Promise<T> {
    const sendId = ++sendSequence;
    const nextTask = sendQueue.then(async () => {
      const config = resolveWahaConfig(env);

      log.info(
        {
          event: 'whatsapp_send_started',
          sendId,
          destination: maskDestination(meta.destination),
          messageType: meta.messageType,
          session: config.session,
        },
        'Starting WhatsApp send',
      );

      await waitForRateLimitWindow(config);
      const startedAt = Date.now();

      try {
        const result = await task(config);
        lastSendAt = Date.now();

        log.info(
          {
            event: 'whatsapp_send_succeeded',
            sendId,
            destination: maskDestination(meta.destination),
            messageType: meta.messageType,
            elapsedMs: lastSendAt - startedAt,
            minIntervalMs: config.minIntervalMs,
          },
          'WhatsApp send succeeded',
        );

        return result;
      } catch (error) {
        lastSendAt = Date.now();

        log.error(
          {
            event: 'whatsapp_send_failed',
            sendId,
            destination: maskDestination(meta.destination),
            messageType: meta.messageType,
            elapsedMs: lastSendAt - startedAt,
            minIntervalMs: config.minIntervalMs,
            error: formatErrorLog(error),
          },
          'WhatsApp send failed',
        );

        throw error;
      }
    });

    sendQueue = nextTask.catch(() => undefined);
    return nextTask;
  }

  async function sendText(to: string, message: string) {
    const text = normalizeOptionalString(message);
    if (!text) {
      throw new Error('WhatsApp message text is required.');
    }

    const chatId = buildWahaChatId(to, { env });
    return enqueueWhatsappSend(
      async (config) => request(
        '/api/sendText',
        {
          method: 'POST',
          body: JSON.stringify({
            session: config.session,
            chatId,
            text,
          }),
        },
        {
          operation: 'sending a WhatsApp text message',
          destination: chatId,
        },
        config,
      ),
      {
        destination: chatId,
        messageType: 'text',
      },
    );
  }

  async function sendImage(to: string, imageUrl: string, caption?: string) {
    const normalizedImageUrl = normalizeOptionalString(imageUrl);
    if (!normalizedImageUrl) {
      throw new Error('WhatsApp image URL is required.');
    }

    const chatId = buildWahaChatId(to, { env });
    const trimmedCaption = normalizeOptionalString(caption);

    return enqueueWhatsappSend(
      async (config) => request(
        '/api/sendImage',
        {
          method: 'POST',
          body: JSON.stringify({
            session: config.session,
            chatId,
            file: {
              mimetype: inferImageMimeType(normalizedImageUrl),
              url: normalizedImageUrl,
              filename: inferImageFilename(normalizedImageUrl),
            },
            ...(trimmedCaption ? { caption: trimmedCaption } : {}),
          }),
        },
        {
          operation: 'sending a WhatsApp image message',
          destination: chatId,
        },
        config,
      ),
      {
        destination: chatId,
        messageType: 'image',
      },
    );
  }

  async function createGroup(name: string, participantPhones: string[]) {
    const groupName = normalizeOptionalString(name);
    if (!groupName) {
      throw new Error('WhatsApp group name is required.');
    }

    const participants = Array.from(
      new Set(
        participantPhones
          .map((phone) => buildWahaChatId(phone, { env }))
          .filter((chatId) => chatId.endsWith('@c.us')),
      ),
    ).map((id) => ({ id }));

    if (participants.length === 0) {
      throw new Error('At least one WhatsApp participant is required to create a group.');
    }

    const config = resolveWahaConfig(env);
    const result = await request<unknown>(
      `/api/${encodeURIComponent(config.session)}/groups`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: groupName,
          participants,
        }),
      },
      {
        operation: 'creating a WhatsApp group',
      },
      config,
    );

    const jid = extractGroupId(result.data);
    if (!jid) {
      throw new WahaRequestError('WAHA group creation did not return a group id.', {
        operation: 'creating a WhatsApp group',
        responseBody: result.data,
      });
    }

    return {
      jid,
      name: extractGroupName(result.data) || groupName,
      raw: result.data,
    };
  }

  async function listSessions() {
    const config = resolveWahaConfig(env);
    return request<unknown>(
      '/api/sessions',
      {
        method: 'GET',
      },
      {
        operation: 'loading WAHA sessions',
      },
      config,
    );
  }

  async function getSessionInfo(sessionName?: string) {
    const config = resolveWahaConfig(env);
    const session = resolveSessionName(config, sessionName);
    return request<WahaSessionInfo>(
      `/api/sessions/${encodeURIComponent(session)}`,
      {
        method: 'GET',
      },
      {
        operation: 'loading WAHA session information',
      },
      config,
    );
  }

  async function getSessionMe(sessionName?: string) {
    const config = resolveWahaConfig(env);
    const session = resolveSessionName(config, sessionName);
    return request<WahaMeInfo | null>(
      `/api/sessions/${encodeURIComponent(session)}/me`,
      {
        method: 'GET',
      },
      {
        operation: 'loading WAHA authenticated account information',
      },
      config,
    );
  }

  async function createSession(sessionName?: string, options?: { start?: boolean }) {
    const config = resolveWahaConfig(env);
    const session = resolveSessionName(config, sessionName);
    return request<WahaSessionInfo>(
      '/api/sessions',
      {
        method: 'POST',
        body: JSON.stringify({
          name: session,
          start: options?.start ?? true,
        }),
      },
      {
        operation: 'creating a WAHA session',
      },
      config,
    );
  }

  async function startSession(sessionName?: string) {
    const config = resolveWahaConfig(env);
    const session = resolveSessionName(config, sessionName);
    return request<WahaSessionInfo>(
      `/api/sessions/${encodeURIComponent(session)}/start`,
      {
        method: 'POST',
      },
      {
        operation: 'starting a WAHA session',
      },
      config,
    );
  }

  async function restartSession(sessionName?: string) {
    const config = resolveWahaConfig(env);
    const session = resolveSessionName(config, sessionName);
    return request<WahaSessionInfo>(
      `/api/sessions/${encodeURIComponent(session)}/restart`,
      {
        method: 'POST',
      },
      {
        operation: 'restarting a WAHA session',
      },
      config,
    );
  }

  async function logoutSession(sessionName?: string) {
    const config = resolveWahaConfig(env);
    const session = resolveSessionName(config, sessionName);
    return request<WahaSessionInfo>(
      `/api/sessions/${encodeURIComponent(session)}/logout`,
      {
        method: 'POST',
      },
      {
        operation: 'logging out a WAHA session',
      },
      config,
    );
  }

  async function getAuthQRCode(
    sessionName?: string,
    options?: { format?: 'image' | 'raw' },
  ) {
    const config = resolveWahaConfig(env);
    const session = resolveSessionName(config, sessionName);
    const format = options?.format === 'raw' ? 'raw' : 'image';
    const suffix = format === 'raw' ? '?format=raw' : '';
    return request<Buffer | WahaQRCodeRawValue>(
      `/api/${encodeURIComponent(session)}/auth/qr${suffix}`,
      {
        method: 'GET',
      },
      {
        operation: 'loading a WAHA authentication QR code',
      },
      config,
      format === 'raw' ? 'default' : 'buffer',
    );
  }

  async function checkSession() {
    const config = resolveWahaConfig(env);
    const response = await listSessions();
    const sessions = extractSessionNames(response.data);

    return {
      ok: true,
      session: config.session,
      sessionExists: sessions.includes(config.session),
      sessions,
      raw: response.data,
    } satisfies WahaHealthCheckResult;
  }

  async function warnIfSessionMissing() {
    try {
      const health = await checkSession();
      if (!health.sessionExists) {
        log.warn(
          {
            event: 'waha_session_missing',
            configuredSession: health.session,
            availableSessions: health.sessions,
          },
          'Configured WAHA session was not found in /api/sessions.',
        );
      }
    } catch (error) {
      log.warn(
        {
          event: 'waha_health_check_failed',
          error: formatErrorLog(error),
        },
        'Unable to verify WAHA session availability.',
      );
    }
  }

  return {
    sendText,
    sendImage,
    createGroup,
    listSessions,
    getSessionInfo,
    getSessionMe,
    createSession,
    startSession,
    restartSession,
    logoutSession,
    getAuthQRCode,
    checkSession,
    warnIfSessionMissing,
  };
}

export const wahaClient = createWahaClient();

export async function warnIfWahaSessionMissing(): Promise<void> {
  await wahaClient.warnIfSessionMissing();
}
