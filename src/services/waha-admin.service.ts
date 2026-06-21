import { MensajeApi } from '../types/MensajeApi';
import {
  WahaRequestError,
  type WahaMeInfo,
  type WahaQRCodeRawValue,
  type WahaSessionInfo,
  wahaClient,
} from './waha.service';

export type WahaAdminDashboardStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'QR'
  | 'STARTING'
  | 'ERROR';

export interface WahaAdminDashboardState {
  session: string;
  status: WahaAdminDashboardStatus;
  isConnected: boolean;
  needsQr: boolean;
  qr: string | null;
  account: Record<string, unknown> | null;
  message: string;
  lastCheckedAt: string;
  sessionExists: boolean;
  upstreamStatus: string | null;
  qrFormat?: 'image' | 'raw' | null;
}

interface WahaAdminClient {
  getSessionInfo(sessionName?: string): Promise<{ data: WahaSessionInfo }>;
  getSessionMe(sessionName?: string): Promise<{ data: WahaMeInfo | null }>;
  createSession(sessionName?: string, options?: { start?: boolean }): Promise<{ data: WahaSessionInfo }>;
  startSession(sessionName?: string): Promise<{ data: WahaSessionInfo }>;
  restartSession(sessionName?: string): Promise<{ data: WahaSessionInfo }>;
  logoutSession(sessionName?: string): Promise<{ data: WahaSessionInfo }>;
  getAuthQRCode(
    sessionName?: string,
    options?: { format?: 'image' | 'raw' },
  ): Promise<{ data: Buffer | WahaQRCodeRawValue; contentType?: string | null }>;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getConfiguredSession(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeOptionalString(env.WAHA_SESSION) || 'default';
}

function isNotFoundError(error: unknown): error is WahaRequestError {
  return error instanceof WahaRequestError && error.status === 404;
}

function buildState(
  session: string,
  overrides: Partial<WahaAdminDashboardState>,
): WahaAdminDashboardState {
  return {
    session,
    status: 'DISCONNECTED',
    isConnected: false,
    needsQr: false,
    qr: null,
    account: null,
    message: 'WAHA session is disconnected.',
    lastCheckedAt: new Date().toISOString(),
    sessionExists: true,
    upstreamStatus: null,
    qrFormat: null,
    ...overrides,
  };
}

function normalizeAccount(info?: WahaSessionInfo | null, me?: WahaMeInfo | null) {
  const source = me ?? info?.me;
  if (!source || typeof source !== 'object') return null;

  const account: Record<string, unknown> = {};
  for (const key of ['id', 'pushName', 'jid', 'lid']) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      account[key] = value.trim();
    }
  }

  return Object.keys(account).length > 0 ? account : null;
}

function toDataUrl(contentType: string | null | undefined, buffer: Buffer): string {
  const mimeType = normalizeOptionalString(contentType) || 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function getErrorStatusCode(error: unknown): number {
  if (error instanceof WahaRequestError && typeof error.status === 'number') {
    return error.status >= 400 && error.status <= 599 ? error.status : 502;
  }

  return 502;
}

function getHumanErrorMessage(error: unknown): string {
  if (error instanceof WahaRequestError) {
    if (error.status === 401 || error.status === 403) {
      return 'WAHA rejected the request. Verify WAHA_API_KEY and session permissions.';
    }
    if (error.status === 404) {
      return 'The configured WAHA session was not found.';
    }
    if (error.status && error.status >= 500) {
      return 'WAHA is unavailable right now. Try again in a moment.';
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unable to reach WAHA right now.';
}

async function loadSessionInfo(
  client: WahaAdminClient,
  session: string,
): Promise<WahaSessionInfo | null> {
  try {
    const response = await client.getSessionInfo(session);
    return response.data;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function loadConnectedAccount(
  client: WahaAdminClient,
  session: string,
  info: WahaSessionInfo,
): Promise<Record<string, unknown> | null> {
  if (normalizeAccount(info)) {
    return normalizeAccount(info);
  }

  try {
    const me = await client.getSessionMe(session);
    return normalizeAccount(info, me.data);
  } catch {
    return normalizeAccount(info);
  }
}

async function loadQrData(
  client: WahaAdminClient,
  session: string,
): Promise<Pick<WahaAdminDashboardState, 'qr' | 'qrFormat'>> {
  try {
    const response = await client.getAuthQRCode(session, { format: 'image' });
    if (Buffer.isBuffer(response.data)) {
      return {
        qr: toDataUrl(response.contentType, response.data),
        qrFormat: 'image',
      };
    }
  } catch {
    // Fall back to raw QR below.
  }

  try {
    const response = await client.getAuthQRCode(session, { format: 'raw' });
    const rawValue = response.data && typeof response.data === 'object'
      ? normalizeOptionalString((response.data as WahaQRCodeRawValue).value)
      : null;

    return {
      qr: rawValue,
      qrFormat: rawValue ? 'raw' : null,
    };
  } catch {
    return {
      qr: null,
      qrFormat: null,
    };
  }
}

async function inspectSession(
  client: WahaAdminClient,
  session: string,
  options?: { includeQr?: boolean },
): Promise<WahaAdminDashboardState> {
  const info = await loadSessionInfo(client, session);
  if (!info) {
    return buildState(session, {
      sessionExists: false,
      status: 'DISCONNECTED',
      message: `WAHA session "${session}" does not exist yet. Start the session to generate a QR code.`,
    });
  }

  const upstreamStatus = normalizeOptionalString(info.status);

  if (upstreamStatus === 'WORKING') {
    const account = await loadConnectedAccount(client, session, info);
    return buildState(session, {
      status: 'CONNECTED',
      isConnected: true,
      needsQr: false,
      account,
      message: 'WAHA session is connected.',
      upstreamStatus,
    });
  }

  if (upstreamStatus === 'STARTING') {
    return buildState(session, {
      status: 'STARTING',
      message: 'WAHA session is starting. A QR code will appear as soon as the device is ready.',
      upstreamStatus,
    });
  }

  if (upstreamStatus === 'SCAN_QR_CODE') {
    const qrData = options?.includeQr ? await loadQrData(client, session) : { qr: null, qrFormat: null };
    return buildState(session, {
      status: 'QR',
      needsQr: true,
      qr: qrData.qr,
      qrFormat: qrData.qrFormat,
      message: 'Scan this QR code with WhatsApp to connect the configured WAHA session.',
      upstreamStatus,
    });
  }

  if (upstreamStatus === 'STOPPED' || upstreamStatus === 'FAILED') {
    return buildState(session, {
      status: 'DISCONNECTED',
      message: upstreamStatus === 'FAILED'
        ? 'WAHA reported a failed session state. Restart the session to generate a fresh QR code.'
        : 'WAHA session is stopped. Start the session to generate a QR code.',
      upstreamStatus,
    });
  }

  return buildState(session, {
    status: 'ERROR',
    message: upstreamStatus
      ? `WAHA returned an unrecognized session status: ${upstreamStatus}.`
      : 'WAHA did not return a recognizable session status.',
    upstreamStatus,
  });
}

function buildSuccessResponse(state: WahaAdminDashboardState): MensajeApi {
  return new MensajeApi({
    code: 200,
    error: false,
    message: state.message,
    data: state,
  });
}

function buildErrorResponse(
  session: string,
  error: unknown,
  fallbackMessage: string,
): MensajeApi {
  const message = getHumanErrorMessage(error) || fallbackMessage;
  return new MensajeApi({
    code: getErrorStatusCode(error),
    error: true,
    message,
    technicalMessage: error instanceof Error ? error.message : undefined,
    data: buildState(session, {
      status: 'ERROR',
      sessionExists: true,
      message,
    }),
  });
}

export function createWahaAdminService(client: WahaAdminClient = wahaClient) {
  async function getSessionStatus(): Promise<MensajeApi> {
    const session = getConfiguredSession();

    try {
      const state = await inspectSession(client, session, { includeQr: false });
      return buildSuccessResponse(state);
    } catch (error) {
      return buildErrorResponse(session, error, 'Unable to load WAHA session status.');
    }
  }

  async function getQRCode(): Promise<MensajeApi> {
    const session = getConfiguredSession();

    try {
      const state = await inspectSession(client, session, { includeQr: true });
      return buildSuccessResponse(state);
    } catch (error) {
      return buildErrorResponse(session, error, 'Unable to load the WAHA QR code.');
    }
  }

  async function startSession(): Promise<MensajeApi> {
    const session = getConfiguredSession();

    try {
      try {
        await client.startSession(session);
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }

        await client.createSession(session, { start: true });
      }

      const state = await inspectSession(client, session, { includeQr: true });
      return buildSuccessResponse(state);
    } catch (error) {
      return buildErrorResponse(session, error, 'Unable to start the WAHA session.');
    }
  }

  async function restartSession(): Promise<MensajeApi> {
    const session = getConfiguredSession();

    try {
      await client.restartSession(session);
      const state = await inspectSession(client, session, { includeQr: true });
      return buildSuccessResponse(state);
    } catch (error) {
      return buildErrorResponse(session, error, 'Unable to restart the WAHA session.');
    }
  }

  async function logoutSession(): Promise<MensajeApi> {
    const session = getConfiguredSession();

    try {
      await client.logoutSession(session);
      const state = await inspectSession(client, session, { includeQr: true });
      return buildSuccessResponse(state);
    } catch (error) {
      return buildErrorResponse(session, error, 'Unable to log out the WAHA session.');
    }
  }

  return {
    getSessionStatus,
    getQRCode,
    startSession,
    restartSession,
    logoutSession,
  };
}

export const wahaAdminService = createWahaAdminService();

export const getSessionStatus = () => wahaAdminService.getSessionStatus();
export const getQRCode = () => wahaAdminService.getQRCode();
export const startSession = () => wahaAdminService.startSession();
export const restartSession = () => wahaAdminService.restartSession();
export const logoutSession = () => wahaAdminService.logoutSession();
