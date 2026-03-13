import type { Request, Response } from 'express';

export const ACTIVE_COMPANY_COOKIE_NAME = 'active_company_id';

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf('=');
    if (index <= 0) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export function getActiveCompanyIdFromRequest(req: Request): number | null {
  const cookieHeader = typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined;
  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies[ACTIVE_COMPANY_COOKIE_NAME];
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
