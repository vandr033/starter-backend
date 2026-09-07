import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import { prisma } from '../prisma/client';
import { hasCompanyCapability } from '../services/company-access.service';

/** Requires the already-authorized company context and an enabled Restaurant Lite module. */
export async function requireRestaurantAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const companyId = (req as any).companyID as number | undefined;
  if (!companyId) return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });

  if (req.companyAccess && req.companyAccess.companyId === companyId) {
    if (!hasCompanyCapability(req.companyAccess, 'RESTAURANT_MODULE')) {
      return res.status(403).json({
        code: 403,
        error: true,
        errorCode: 'FEATURE_NOT_ENTITLED',
        reason: 'RESTAURANT_MODULE_DISABLED',
        message: 'El módulo Restaurant Lite está deshabilitado.',
        data: { capability: 'RESTAURANT_MODULE' },
      });
    }
    return next();
  }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { restaurant_enabled: true } });
  if (!company?.restaurant_enabled) {
    return res.status(403).json({ code: 403, error: true, reason: 'RESTAURANT_MODULE_DISABLED', message: 'El módulo Restaurant Lite está deshabilitado.' });
  }
  return next();
}
