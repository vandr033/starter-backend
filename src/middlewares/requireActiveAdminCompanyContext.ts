import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import {
  getActiveCompanyIdFromRequest,
  setActiveCompanyCookie,
} from '../utils/active-shop-cookie';

export function requireActiveAdminCompanyContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const activeCompanyId = getActiveCompanyIdFromRequest(req);
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

  if (!activeCompanyId) {
    setActiveCompanyCookie(res, resolvedCompanyId);
  }

  return next();
}
