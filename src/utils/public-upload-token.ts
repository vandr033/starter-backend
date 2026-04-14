import crypto from 'crypto';
import { env } from '../config/env';

type UploadPurpose = 'BOOKING_PROOF';

type UploadTokenPayload = {
  companyId: number;
  purpose: UploadPurpose;
  exp: number;
};

const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_SECONDS = 2 * 60 * 60;

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function buildSignature(payloadSegment: string): string {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(payloadSegment)
    .digest('base64url');
}

export function createPublicUploadToken(
  companyId: number,
  purpose: UploadPurpose,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const payload: UploadTokenPayload = {
    companyId,
    purpose,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const payloadSegment = `${TOKEN_VERSION}.${encodeBase64Url(JSON.stringify(payload))}`;
  const signature = buildSignature(payloadSegment);
  return `${payloadSegment}.${signature}`;
}

export function verifyPublicUploadToken(
  token: string,
  expected: { companyId: number; purpose: UploadPurpose },
): { ok: true; payload: UploadTokenPayload } | { ok: false; reason: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'Malformed upload token' };
  }

  const [version, encodedPayload, signature] = parts;
  if (version !== TOKEN_VERSION) {
    return { ok: false, reason: 'Unsupported upload token version' };
  }

  const payloadSegment = `${version}.${encodedPayload}`;
  const expectedSignature = buildSignature(payloadSegment);
  const providedSignature = Buffer.from(signature, 'utf8');
  const actualSignature = Buffer.from(expectedSignature, 'utf8');
  if (
    providedSignature.length !== actualSignature.length ||
    !crypto.timingSafeEqual(providedSignature, actualSignature)
  ) {
    return { ok: false, reason: 'Invalid upload token signature' };
  }

  const decodedPayload = decodeBase64Url(encodedPayload);
  if (!decodedPayload) {
    return { ok: false, reason: 'Invalid upload token payload' };
  }

  let payload: UploadTokenPayload;
  try {
    payload = JSON.parse(decodedPayload) as UploadTokenPayload;
  } catch {
    return { ok: false, reason: 'Invalid upload token payload' };
  }

  if (!Number.isInteger(payload.companyId) || payload.companyId <= 0) {
    return { ok: false, reason: 'Invalid upload token company' };
  }
  if (payload.companyId !== expected.companyId) {
    return { ok: false, reason: 'Upload token does not match company' };
  }
  if (payload.purpose !== expected.purpose) {
    return { ok: false, reason: 'Upload token purpose mismatch' };
  }
  if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'Upload token expired' };
  }

  return { ok: true, payload };
}
