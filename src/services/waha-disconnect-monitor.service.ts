import { logger } from '../config/logger';
import { sendGenericEmail } from '../utils/sendEmail';
import type { EmailDeliveryResult } from './notification-provider.service';
import {
  WahaRequestError,
  type WahaSessionInfo,
  wahaClient,
} from './waha.service';
import { wakeWhatsappWorker } from './whatsapp-worker-signals';

const DEFAULT_ALERT_EMAIL = 'sebastian.andradeg@outlook.com';
const DEFAULT_MONITOR_INTERVAL_MS = 30_000;
const DISCONNECTED_STATUSES = new Set([
  'FAILED',
  'SCAN_QR_CODE',
  'STOPPED',
]);

type LoggerLike = Pick<typeof logger, 'info' | 'warn' | 'error'>;

interface WahaStatusClient {
  getSessionInfo(sessionName?: string): Promise<{ data: WahaSessionInfo }>;
}

interface WahaDisconnectMonitorOptions {
  client?: WahaStatusClient;
  env?: NodeJS.ProcessEnv;
  logger?: LoggerLike;
  now?: () => Date;
  sendEmail?: (to: string, subject: string, html: string) => Promise<EmailDeliveryResult | void>;
}

function normalizeOptionalString(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeStatus(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : null;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

function buildAlertHtml(params: {
  session: string;
  status: string;
  detectedAt: Date;
}): string {
  return `
    <p>The WAHA WhatsApp session is disconnected and needs attention.</p>
    <ul>
      <li><strong>Session:</strong> ${escapeHtml(params.session)}</li>
      <li><strong>Status:</strong> ${escapeHtml(params.status)}</li>
      <li><strong>Detected at:</strong> ${escapeHtml(params.detectedAt.toISOString())}</li>
    </ul>
    <p>Open the Super Admin WAHA dashboard to restart the session or scan a new QR code.</p>
  `;
}

export function createWahaDisconnectMonitor(options: WahaDisconnectMonitorOptions = {}) {
  const env = options.env ?? process.env;
  const client = options.client ?? wahaClient;
  const log = options.logger ?? logger;
  const now = options.now ?? (() => new Date());
  const emailSender = options.sendEmail ?? sendGenericEmail;
  const session = normalizeOptionalString(env.WAHA_SESSION) || 'default';
  const recipient = normalizeOptionalString(env.WAHA_DISCONNECT_ALERT_EMAIL) || DEFAULT_ALERT_EMAIL;
  const intervalMs = parsePositiveInt(env.WAHA_MONITOR_INTERVAL_MS, DEFAULT_MONITOR_INTERVAL_MS);

  let outageAlertSent = false;
  let lastObservedStatus: string | null = null;
  let timer: NodeJS.Timeout | null = null;
  let checkInFlight: Promise<void> | null = null;

  async function sendDisconnectAlert(status: string): Promise<void> {
    const detectedAt = now();
    const result = await emailSender(
      recipient,
      `Alert: WAHA disconnected (${session})`,
      buildAlertHtml({ session, status, detectedAt }),
    );

    if (result?.status === 'FAILED') {
      throw new Error(`Email delivery failed: ${result.reason}`);
    }

    outageAlertSent = true;
    log.warn(
      {
        event: 'waha_disconnect_alert_sent',
        session,
        status,
        recipient: maskEmail(recipient),
        detectedAt: detectedAt.toISOString(),
        deliveryStatus: result?.status ?? 'SENT',
        deliveryReason: result?.reason ?? 'REMOTE_SUCCESS',
      },
      result?.status === 'SKIPPED'
        ? 'WAHA disconnect alert email skipped'
        : 'WAHA disconnect alert email sent',
    );
  }

  async function performCheck(): Promise<void> {
    let status: string;

    try {
      const response = await client.getSessionInfo(session);
      status = normalizeStatus(response.data?.status) || 'UNKNOWN';
    } catch (error) {
      if (error instanceof WahaRequestError && error.status === 404) {
        status = 'SESSION_NOT_FOUND';
      } else {
        log.error(
          {
            event: 'waha_disconnect_monitor_check_failed',
            session,
            error,
          },
          'Unable to check WAHA session status',
        );
        return;
      }
    }

    const previousStatus = lastObservedStatus;
    lastObservedStatus = status;
    // The worker also polls independently, which is required when it runs in
    // a separate process. In the web process this status transition wakes it
    // immediately after a reconnect instead of waiting for the next poll.
    if (previousStatus !== status) wakeWhatsappWorker();

    if (status === 'WORKING') {
      if (outageAlertSent) {
        log.info(
          {
            event: 'waha_session_reconnected',
            session,
            previousStatus,
          },
          'WAHA session reconnected; disconnect alert state reset',
        );
      }
      outageAlertSent = false;
      return;
    }

    const isDisconnected = DISCONNECTED_STATUSES.has(status) || status === 'SESSION_NOT_FOUND';
    if (!isDisconnected || outageAlertSent) return;

    try {
      await sendDisconnectAlert(status);
    } catch (error) {
      log.error(
        {
          event: 'waha_disconnect_alert_failed',
          session,
          status,
          recipient: maskEmail(recipient),
          error,
        },
        'Unable to send WAHA disconnect alert email',
      );
    }
  }

  function checkNow(): Promise<void> {
    if (checkInFlight) return checkInFlight;

    checkInFlight = performCheck().finally(() => {
      checkInFlight = null;
    });
    return checkInFlight;
  }

  function start(): void {
    if (timer) return;

    log.info(
      {
        event: 'waha_disconnect_monitor_started',
        session,
        intervalMs,
        recipient: maskEmail(recipient),
      },
      'WAHA disconnect monitor started',
    );

    void checkNow();
    timer = setInterval(() => {
      void checkNow();
    }, intervalMs);
    timer.unref();
  }

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return {
    checkNow,
    start,
    stop,
  };
}

export const wahaDisconnectMonitor = createWahaDisconnectMonitor();

export function startWahaDisconnectMonitor(): void {
  wahaDisconnectMonitor.start();
}
