import nodemailer from 'nodemailer';
import { logger } from '../config/logger';

export type NotificationProviderMode = 'disabled' | 'sink' | 'remote';
export type NotificationDeliveryStatus = 'SENT' | 'SKIPPED' | 'FAILED';
export type NotificationDeliveryReason =
  | 'LOCAL_SINK'
  | 'REMOTE_SUCCESS'
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'TRANSPORT_FAILED'
  | 'INVALID_RECIPIENT'
  | 'TEMPORARY_ADDRESS';

export interface EmailProviderState {
  enabled: boolean;
  mode: NotificationProviderMode;
  configured: boolean;
  reason: NotificationDeliveryReason | null;
}

export interface EmailDeliveryResult {
  provider: 'email';
  status: NotificationDeliveryStatus;
  reason: NotificationDeliveryReason;
  providerId?: string;
}

export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  html: string;
}

export function isEmailDeliverySuccessful(result: unknown): boolean {
  return Boolean(
    result
      && typeof result === 'object'
      && (result as { provider?: unknown }).provider === 'email'
      && (result as { status?: unknown }).status === 'SENT',
  );
}

export interface LocalEmailDelivery {
  to: string;
  subject: string;
  html: string;
}

type EmailTransport = {
  sendMail(message: { to: string; from: string; subject: string; html: string }): Promise<{ messageId?: string }>;
};

type EmailTransportFactory = (env: NodeJS.ProcessEnv) => EmailTransport;

let remoteTransporter: EmailTransport | null = null;
let remoteTransporterKey: string | null = null;
let emailTransportFactoryForTests: EmailTransportFactory | null = null;
const localEmailDeliveries: LocalEmailDelivery[] = [];

function normalize(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isTrue(value: string | undefined | null): boolean {
  return normalize(value).toLowerCase() === 'true';
}

function resolveMode(env: NodeJS.ProcessEnv): NotificationProviderMode {
  const configured = normalize(env.MAIL_TRANSPORT).toLowerCase();
  if (configured === 'sink') return 'sink';
  if (configured === 'disabled') return 'disabled';
  return 'remote';
}

export function getEmailProviderState(env: NodeJS.ProcessEnv = process.env): EmailProviderState {
  const enabled = isTrue(env.MAIL_ENABLED);
  const mode = enabled ? resolveMode(env) : 'disabled';

  if (!enabled || mode === 'disabled') {
    return { enabled, mode: 'disabled', configured: false, reason: 'PROVIDER_DISABLED' };
  }

  if (mode === 'sink') {
    return { enabled, mode, configured: true, reason: null };
  }

  const host = normalize(env.MAIL_HOST);
  const from = normalize(env.MAIL_FROM);
  const user = normalize(env.MAIL_USER);
  const pass = normalize(env.MAIL_PASS);
  const port = Number.parseInt(normalize(env.MAIL_PORT) || '587', 10);
  const configured = Boolean(host && from && user && pass && Number.isInteger(port) && port > 0 && port < 65_536);

  return {
    enabled,
    mode,
    configured,
    reason: configured ? null : 'PROVIDER_NOT_CONFIGURED',
  };
}

function maskRecipient(value: string): string {
  const [local, domain] = value.split('@');
  if (!local || !domain) return 'invalid';
  return `${local.slice(0, 2)}***@${domain}`;
}

function transportKey(env: NodeJS.ProcessEnv): string {
  return [
    normalize(env.MAIL_HOST),
    normalize(env.MAIL_PORT) || '587',
    normalize(env.MAIL_SECURE).toLowerCase(),
    normalize(env.MAIL_FROM),
    normalize(env.MAIL_USER),
    normalize(env.MAIL_PASS),
  ].join('|');
}

function getRemoteTransporter(env: NodeJS.ProcessEnv): EmailTransport {
  const key = transportKey(env);
  if (remoteTransporter && remoteTransporterKey === key) return remoteTransporter;

  if (emailTransportFactoryForTests) {
    remoteTransporter = emailTransportFactoryForTests(env);
    remoteTransporterKey = key;
    return remoteTransporter;
  }

  const port = Number.parseInt(normalize(env.MAIL_PORT) || '587', 10);
  const secure = isTrue(env.MAIL_SECURE) || port === 465;
  remoteTransporter = nodemailer.createTransport({
    host: normalize(env.MAIL_HOST),
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user: normalize(env.MAIL_USER),
      pass: normalize(env.MAIL_PASS),
    },
    connectionTimeout: Number.parseInt(normalize(env.MAIL_CONNECTION_TIMEOUT_MS) || '15000', 10),
    greetingTimeout: Number.parseInt(normalize(env.MAIL_GREETING_TIMEOUT_MS) || '15000', 10),
    socketTimeout: Number.parseInt(normalize(env.MAIL_SOCKET_TIMEOUT_MS) || '20000', 10),
  }) as unknown as EmailTransport;
  remoteTransporterKey = key;
  return remoteTransporter;
}

/**
 * Replaces the remote email transport for deterministic unit tests. Production
 * code never calls this; resetting it also clears the cached transporter.
 */
export function setEmailTransportFactoryForTests(factory: EmailTransportFactory | null): void {
  emailTransportFactoryForTests = factory;
  remoteTransporter = null;
  remoteTransporterKey = null;
}

export async function deliverEmail(
  message: EmailMessage,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EmailDeliveryResult> {
  const state = getEmailProviderState(env);
  const recipient = normalize(message.to);

  if (!recipient || !recipient.includes('@')) {
    const result: EmailDeliveryResult = {
      provider: 'email',
      status: 'SKIPPED',
      reason: 'INVALID_RECIPIENT',
    };
    logger.warn({ provider: 'email', status: result.status, reason: result.reason }, 'Email delivery skipped');
    return result;
  }

  if (state.mode === 'disabled') {
    const result: EmailDeliveryResult = {
      provider: 'email',
      status: 'SKIPPED',
      reason: 'PROVIDER_DISABLED',
    };
    logger.info({ provider: 'email', status: result.status, reason: result.reason, to: maskRecipient(recipient) }, 'Email delivery skipped');
    return result;
  }

  if (!state.configured) {
    const result: EmailDeliveryResult = {
      provider: 'email',
      status: 'FAILED',
      reason: 'PROVIDER_NOT_CONFIGURED',
    };
    logger.error({ provider: 'email', status: result.status, reason: result.reason, to: maskRecipient(recipient) }, 'Email provider is not configured');
    return result;
  }

  if (state.mode === 'sink') {
    localEmailDeliveries.push({ to: recipient, subject: message.subject, html: message.html });
    const result: EmailDeliveryResult = {
      provider: 'email',
      status: 'SENT',
      reason: 'LOCAL_SINK',
      providerId: 'local-sink',
    };
    logger.info({ provider: 'email', status: result.status, reason: result.reason, to: maskRecipient(recipient) }, 'Email captured by local notification sink');
    return result;
  }

  try {
    const info = await getRemoteTransporter(env).sendMail({
      to: recipient,
      from: normalize(message.from) || normalize(env.MAIL_FROM),
      subject: message.subject,
      html: message.html,
    });
    const result: EmailDeliveryResult = {
      provider: 'email',
      status: 'SENT',
      reason: 'REMOTE_SUCCESS',
      providerId: typeof info.messageId === 'string' ? info.messageId : undefined,
    };
    logger.info({ provider: 'email', status: result.status, to: maskRecipient(recipient), providerId: result.providerId }, 'Email delivered');
    return result;
  } catch (error) {
    const result: EmailDeliveryResult = {
      provider: 'email',
      status: 'FAILED',
      reason: 'TRANSPORT_FAILED',
    };
    logger.error({ provider: 'email', status: result.status, reason: result.reason, to: maskRecipient(recipient), error: error instanceof Error ? { name: error.name, code: (error as Error & { code?: string }).code } : undefined }, 'Email transport failed');
    return result;
  }
}

export function getLocalEmailDeliveries(): LocalEmailDelivery[] {
  return localEmailDeliveries.map((delivery) => ({ ...delivery }));
}

export function clearLocalEmailDeliveries(): void {
  localEmailDeliveries.length = 0;
}
