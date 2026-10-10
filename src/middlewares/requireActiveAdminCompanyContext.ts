import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import {
  getActiveCompanyCookieState,
  setActiveCompanyCookie,
} from '../utils/active-shop-cookie';
import { sendDemoCompanyMismatch } from './demo-session.middleware';

export function requireActiveAdminCompanyContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const cookie = getActiveCompanyCookieState(req);
  const demoCompanyId = req.demoSessionContext?.companyId;
  if (demoCompanyId && cookie.present && cookie.companyId !== demoCompanyId) {
    return sendDemoCompanyMismatch(res);
  }
  const activeCompanyId = demoCompanyId ?? cookie.companyId;
  const resolvedCompanyId =
    activeCompanyId
    || ((req as any).companyID as number | undefined)
    || ((req as any).companyUser?.company_id as number | undefined)
    || null;

  if (!resolvedCompanyId) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'Selecciona una empresa activa para continuar.',
    });
  }

  if (!activeCompanyId && !demoCompanyId) {
    setActiveCompanyCookie(res, resolvedCompanyId);
  }

  return next();
}
