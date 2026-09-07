import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { isCompanyAvailableNow } from '../utils/company-availability';
import { UploadSecurityError, UPLOAD_ERROR_CODES } from '../utils/upload-errors';
import { PUBLIC_UPLOAD_MAX_BYTES, PUBLIC_UPLOAD_MIME_TYPES, canonicalUploadMimeType } from '../utils/upload-validation';
import { StorageService } from './storage.service';

export const UPLOAD_PURPOSES = {
  BOOKING_QR_PROOF: 'BOOKING_QR_PROOF',
  ORDER_PAYMENT_PROOF: 'ORDER_PAYMENT_PROOF',
  RESTAURANT_DEPOSIT_PROOF: 'RESTAURANT_DEPOSIT_PROOF',
  GROUP_PAYMENT_PROOF: 'GROUP_PAYMENT_PROOF',
} as const;

export type UploadPurpose = typeof UPLOAD_PURPOSES[keyof typeof UPLOAD_PURPOSES];

const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 10 * 60;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 30 * 60;

type UploadIntentClaims = {
  v: number;
  companyId: number;
  purpose: UploadPurpose;
  contextId: string | null;
  maxBytes: number;
  allowedMimeTypes: string[];
  expiresAt: string;
  nonce: string;
};

type UploadIntentContext = {
  type?: unknown;
  id?: unknown;
  enrollmentId?: unknown;
  installmentId?: unknown;
  orderNumber?: unknown;
  reservationCode?: unknown;
};

export type IssuedUploadIntent = {
  uploadIntent: string;
  expiresAt: string;
  maxBytes: number;
  allowedMimeTypes: string[];
  purpose: UploadPurpose;
  contextId: string | null;
};

export type ConsumedUploadIntent = UploadIntentClaims & {
  databaseId: number;
};

const PURPOSE_CONFIG: Record<UploadPurpose, { maxBytes: number; allowedMimeTypes: string[] }> = {
  BOOKING_QR_PROOF: { maxBytes: PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: [...PUBLIC_UPLOAD_MIME_TYPES] },
  ORDER_PAYMENT_PROOF: { maxBytes: PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: [...PUBLIC_UPLOAD_MIME_TYPES] },
  RESTAURANT_DEPOSIT_PROOF: { maxBytes: PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: [...PUBLIC_UPLOAD_MIME_TYPES] },
  GROUP_PAYMENT_PROOF: { maxBytes: PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: [...PUBLIC_UPLOAD_MIME_TYPES] },
};

let developmentSecret: string | null = null;

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = [
    env.UPLOAD_INTENT_SECRET,
    env.BETTER_AUTH_SECRET,
    env.AUTH_SECRET,
    env.SESSION_SECRET,
    env.JWT_SECRET,
  ]
    .map((value) => value?.trim())
    .find((value) => Boolean(value));

  if (configured) return configured;
  if (env.NODE_ENV === 'production') {
    throw new Error('UPLOAD_INTENT_SECRET (or an auth secret) must be configured in production');
  }

  developmentSecret ??= randomBytes(32).toString('hex');
  return developmentSecret;
}

function parseTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.UPLOAD_INTENT_TTL_SECONDS || '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, parsed));
}

function base64UrlEncode(value: string | Buffer): string {
  return (typeof value === 'string' ? Buffer.from(value, 'utf8') : value).toString('base64url');
}

function base64UrlDecode(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    return null;
  }
}

function sign(payload: string, env: NodeJS.ProcessEnv = process.env): string {
  return base64UrlEncode(createHmac('sha256', getSecret(env)).update(payload).digest());
}

function safeSignatureCompare(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function isUploadPurpose(value: unknown): value is UploadPurpose {
  return typeof value === 'string' && Object.values(UPLOAD_PURPOSES).includes(value as UploadPurpose);
}

function invalidIntent(status = 400): UploadSecurityError {
  return new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_INVALID, status);
}

function parseClaims(token: string, env: NodeJS.ProcessEnv = process.env): UploadIntentClaims {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== `upi${TOKEN_VERSION}`) throw invalidIntent();

  const [prefix, payload, signature] = parts;
  if (!payload || !signature || !safeSignatureCompare(signature, sign(payload, env))) throw invalidIntent();

  const decoded = base64UrlDecode(payload);
  if (!decoded) throw invalidIntent();

  let value: Partial<UploadIntentClaims>;
  try {
    value = JSON.parse(decoded.toString('utf8')) as Partial<UploadIntentClaims>;
  } catch {
    throw invalidIntent();
  }

  const allowedMimeTypes = Array.isArray(value.allowedMimeTypes)
    ? value.allowedMimeTypes.filter((mime): mime is string => typeof mime === 'string').map(canonicalUploadMimeType)
    : [];
  const expiresAt = normalizedString(value.expiresAt);

  if (
    prefix !== `upi${TOKEN_VERSION}`
    || value.v !== TOKEN_VERSION
    || !positiveInteger(value.companyId)
    || !isUploadPurpose(value.purpose)
    || (value.contextId !== null && typeof value.contextId !== 'string')
    || !positiveInteger(value.maxBytes)
    || allowedMimeTypes.length === 0
    || !expiresAt
    || !normalizedString(value.nonce)
  ) {
    throw invalidIntent();
  }

  const parsedExpiry = new Date(expiresAt);
  if (!Number.isFinite(parsedExpiry.getTime())) throw invalidIntent();

  return {
    v: TOKEN_VERSION,
    companyId: value.companyId as number,
    purpose: value.purpose as UploadPurpose,
    contextId: value.contextId ?? null,
    maxBytes: value.maxBytes as number,
    allowedMimeTypes: Array.from(new Set(allowedMimeTypes)),
    expiresAt: parsedExpiry.toISOString(),
    nonce: value.nonce as string,
  };
}

async function findAvailableCompany(slug: string) {
  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, slug: true, is_active: true, deleted_at: true, availableUntil: true },
  });
  if (!company || !isCompanyAvailableNow(company)) throw invalidIntent(404);
  return company;
}

function contextRecord(value: unknown): UploadIntentContext {
  return value && typeof value === 'object' ? value as UploadIntentContext : {};
}

async function resolveContext(params: {
  companyId: number;
  purpose: UploadPurpose;
  context: unknown;
  reservationCode?: string | null;
  accessToken?: string | null;
  authUserId?: string | null;
}): Promise<string | null> {
  const context = contextRecord(params.context);
  const type = normalizedString(context.type)?.toUpperCase() || null;

  if (params.purpose === UPLOAD_PURPOSES.BOOKING_QR_PROOF) {
    if (type && type !== 'BOOKING') throw invalidIntent();
    if (params.authUserId) return `BOOKING:${params.authUserId}`;

    // Guest booking pages may upload before sign-in. Bind that upload to a
    // browser-generated flow context so the later authenticated handoff does
    // not have to fall back to an unscoped anonymous booking context.
    const anonymousFlowId = normalizedString(context.id);
    if (!anonymousFlowId) return null;
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(anonymousFlowId)) throw invalidIntent();
    return `BOOKING:${anonymousFlowId}`;
  }

  if (params.purpose === UPLOAD_PURPOSES.GROUP_PAYMENT_PROOF) {
    if (type === 'EVENT') {
      const id = positiveInteger(context.id);
      const event = id
        ? await prisma.groupEvent.findFirst({ where: { id, company_id: params.companyId, status: 'PUBLISHED', deleted_at: null }, select: { id: true } })
        : null;
      if (!event) throw invalidIntent(404);
      return `EVENT:${event.id}`;
    }

    if (type === 'CLASS') {
      const id = positiveInteger(context.id);
      const groupClass = id
        ? await prisma.groupClass.findFirst({ where: { id, company_id: params.companyId, status: 'PUBLISHED', deleted_at: null }, select: { id: true } })
        : null;
      if (!groupClass) throw invalidIntent(404);
      return `CLASS:${groupClass.id}`;
    }

    if (type === 'INSTALLMENT') {
      const enrollmentId = positiveInteger(context.enrollmentId);
      const installmentId = positiveInteger(context.installmentId);
      if (!enrollmentId || !installmentId || !params.authUserId) throw invalidIntent();
      const installment = await prisma.enrollmentInstallment.findFirst({
        where: { id: installmentId, enrollment_id: enrollmentId },
        select: { id: true, payment_status: true, enrollment: { select: { company_id: true, user_id: true } } },
      });
      if (!installment || installment.enrollment.company_id !== params.companyId || installment.enrollment.user_id !== params.authUserId || installment.payment_status === 'PAID') {
        throw invalidIntent(404);
      }
      return `INSTALLMENT:${enrollmentId}:${installment.id}`;
    }

    throw invalidIntent();
  }

  if (params.purpose === UPLOAD_PURPOSES.RESTAURANT_DEPOSIT_PROOF) {
    const reservationCode = normalizedString(params.reservationCode) || normalizedString(context.reservationCode);
    if (!reservationCode) throw invalidIntent();
    const reservation = await prisma.restaurantReservation.findFirst({
      where: { company_id: params.companyId, reservation_code: reservationCode },
      select: { id: true, status: true, deposit: { select: { status: true } } },
    });
    if (!reservation || ['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(reservation.status) || !reservation.deposit || ['APPROVED', 'WAIVED', 'REFUNDED', 'EXPIRED'].includes(reservation.deposit.status)) {
      throw invalidIntent(404);
    }
    return `RESERVATION:${reservation.id}`;
  }

  if (params.purpose === UPLOAD_PURPOSES.ORDER_PAYMENT_PROOF) {
    if (type === 'CHECKOUT') {
      if (!params.authUserId) throw invalidIntent(401);
      return `CHECKOUT:${params.authUserId}`;
    }

    if (type === 'ORDER') {
      const orderNumber = normalizedString(context.orderNumber);
      if (!orderNumber) throw invalidIntent();
      const order = await prisma.commerceOrder.findFirst({
        where: { company_id: params.companyId, order_number: orderNumber },
        select: {
          id: true,
          payment_method: true,
          payment_status: true,
          public_access_token: true,
          customer_profile: { select: { user_id: true } },
        },
      });
      const accessToken = normalizedString(params.accessToken);
      const authorized = Boolean(
        order
        && ((params.authUserId && order.customer_profile?.user_id === params.authUserId) || (accessToken && order.public_access_token === accessToken)),
      );
      if (!order || !authorized || !['QR', 'MANUAL'].includes(order.payment_method) || !['AWAITING_PAYMENT', 'PAYMENT_REJECTED'].includes(order.payment_status)) {
        throw invalidIntent(404);
      }
      return `ORDER:${order.id}`;
    }

    throw invalidIntent();
  }

  throw invalidIntent();
}

export async function issueUploadIntent(params: {
  slug: string;
  purpose: unknown;
  context?: unknown;
  reservationCode?: string | null;
  accessToken?: string | null;
  authUserId?: string | null;
}): Promise<IssuedUploadIntent> {
  if (!isUploadPurpose(params.purpose)) throw invalidIntent();
  const company = await findAvailableCompany(params.slug);
  const contextId = await resolveContext({
    companyId: company.id,
    purpose: params.purpose,
    context: params.context,
    reservationCode: params.reservationCode,
    accessToken: params.accessToken,
    authUserId: params.authUserId,
  });
  const config = PURPOSE_CONFIG[params.purpose];
  const expiresAt = new Date(Date.now() + parseTtlSeconds() * 1000);
  const claims: UploadIntentClaims = {
    v: TOKEN_VERSION,
    companyId: company.id,
    purpose: params.purpose,
    contextId,
    maxBytes: config.maxBytes,
    allowedMimeTypes: config.allowedMimeTypes,
    expiresAt: expiresAt.toISOString(),
    nonce: randomBytes(24).toString('base64url'),
  };
  const payload = base64UrlEncode(JSON.stringify(claims));
  const token = `upi${TOKEN_VERSION}.${payload}.${sign(payload)}`;

  await prisma.uploadIntent.create({
    data: {
      company_id: company.id,
      purpose: claims.purpose,
      context_id: claims.contextId,
      nonce: claims.nonce,
      token_hash: hashToken(token),
      max_bytes: claims.maxBytes,
      allowed_mime_types: claims.allowedMimeTypes as Prisma.InputJsonValue,
      expires_at: expiresAt,
    },
  });

  return {
    uploadIntent: token,
    expiresAt: expiresAt.toISOString(),
    maxBytes: claims.maxBytes,
    allowedMimeTypes: claims.allowedMimeTypes,
    purpose: claims.purpose,
    contextId: claims.contextId,
  };
}

export async function consumeUploadIntent(
  token: string,
  options: { expectedPurpose: UploadPurpose | readonly UploadPurpose[]; companyId?: number; contextId?: string | null },
): Promise<ConsumedUploadIntent> {
  if (typeof token !== 'string' || !token.trim()) throw invalidIntent();
  const claims = parseClaims(token);
  const expectedPurposes = Array.isArray(options.expectedPurpose) ? options.expectedPurpose : [options.expectedPurpose];
  const expectedMimeTypes = PURPOSE_CONFIG[claims.purpose].allowedMimeTypes;

  if (!expectedPurposes.includes(claims.purpose) || claims.companyId !== (options.companyId ?? claims.companyId) || (options.contextId !== undefined && claims.contextId !== options.contextId) || claims.maxBytes !== PURPOSE_CONFIG[claims.purpose].maxBytes || JSON.stringify(claims.allowedMimeTypes) !== JSON.stringify(expectedMimeTypes)) {
    throw invalidIntent();
  }

  const now = new Date();
  const expiresAt = new Date(claims.expiresAt);
  if (expiresAt.getTime() <= now.getTime()) throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_EXPIRED, 410);

  const stored = await prisma.uploadIntent.findUnique({ where: { nonce: claims.nonce } });
  if (!stored || stored.token_hash !== hashToken(token) || stored.company_id !== claims.companyId || stored.purpose !== claims.purpose || stored.context_id !== claims.contextId) {
    throw invalidIntent();
  }
  if (stored.expires_at.getTime() <= now.getTime()) throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_EXPIRED, 410);
  if (stored.consumed_at) throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_REPLAYED, 409);

  const consumed = await prisma.uploadIntent.updateMany({
    where: { id: stored.id, consumed_at: null, expires_at: { gt: now } },
    data: { consumed_at: now },
  });
  if (consumed.count !== 1) {
    const current = await prisma.uploadIntent.findUnique({ where: { id: stored.id }, select: { consumed_at: true, expires_at: true } });
    if (current?.consumed_at) throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_REPLAYED, 409);
    if (!current || current.expires_at.getTime() <= Date.now()) throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_EXPIRED, 410);
    throw invalidIntent();
  }

  return { ...claims, databaseId: stored.id };
}

export async function recordStoredUpload(intent: ConsumedUploadIntent, relativePath: string): Promise<void> {
  const normalizedPath = StorageService.toRelativeStoragePath(relativePath);
  if (!normalizedPath || normalizedPath.length > 512) throw invalidIntent();
  const result = await prisma.uploadIntent.updateMany({
    where: { id: intent.databaseId, nonce: intent.nonce, consumed_at: { not: null }, stored_path: null },
    data: { stored_path: normalizedPath },
  });
  if (result.count !== 1) throw invalidIntent();
}

export async function assertStoredUpload(params: {
  rawPathOrUrl: string;
  companyId: number;
  purpose: UploadPurpose;
  contextId?: string | null;
}) {
  const relativePath = StorageService.toRelativeStoragePath(params.rawPathOrUrl);
  if (!relativePath) throw invalidIntent();
  const intent = await prisma.uploadIntent.findFirst({
    where: {
      stored_path: relativePath,
      company_id: params.companyId,
      purpose: params.purpose,
      context_id: params.contextId ?? null,
      consumed_at: { not: null },
    },
  });
  if (!intent) throw invalidIntent(403);
  return { intent, relativePath };
}

export function uploadIntentContextId(value: { type: 'EVENT' | 'CLASS' | 'INSTALLMENT'; id?: number; enrollmentId?: number; installmentId?: number }): string {
  if (value.type === 'EVENT' || value.type === 'CLASS') {
    if (!value.id || !Number.isInteger(value.id) || value.id <= 0) throw invalidIntent();
    return `${value.type}:${value.id}`;
  }
  if (!value.enrollmentId || !value.installmentId || !Number.isInteger(value.enrollmentId) || !Number.isInteger(value.installmentId)) throw invalidIntent();
  return `INSTALLMENT:${value.enrollmentId}:${value.installmentId}`;
}
