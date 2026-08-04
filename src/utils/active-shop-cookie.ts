import type { Request, Response } from 'express';

export const ACTIVE_COMPANY_COOKIE_NAME = 'active_company_id';

export type ActiveCompanyCookieState = {
  present: boolean;
  companyId: number | null;
  invalid: boolean;
};

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf('=');
    if (index <= 0) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return acc;
    try {
      acc[key] = decodeURIComponent(value);
    } catch {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export function getActiveCompanyIdFromRequest(req: Request): number | null {
  return getActiveCompanyCookieState(req).companyId;
}

/**
 * Restaurant routes must distinguish an omitted context from a malformed one.
 * The legacy helper intentionally collapses both cases to null for modules that
 * still support their historical fallback behavior.
 */
export function getActiveCompanyCookieState(req: Request): ActiveCompanyCookieState {
  const cookieHeader = typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined;
  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies[ACTIVE_COMPANY_COOKIE_NAME];
  if (!raw) return { present: false, companyId: null, invalid: false };
  if (!/^\d+$/.test(raw)) return { present: true, companyId: null, invalid: true };
  const parsed = Number.parseInt(raw, 10);
  return { present: true, companyId: Number.isInteger(parsed) && parsed > 0 ? parsed : null, invalid: !(Number.isInteger(parsed) && parsed > 0) };
}

function getCookieSettings() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite: 'none' | 'lax' = isProduction ? 'none' : 'lax';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  };
}

export function setActiveCompanyCookie(res: Response, companyId: number) {
  res.cookie(ACTIVE_COMPANY_COOKIE_NAME, String(companyId), getCookieSettings());
}

export function clearActiveCompanyCookie(res: Response) {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite: 'none' | 'lax' = isProduction ? 'none' : 'lax';
  res.clearCookie(ACTIVE_COMPANY_COOKIE_NAME, {
    path: '/',
    sameSite,
    secure: isProduction,
  });
}
