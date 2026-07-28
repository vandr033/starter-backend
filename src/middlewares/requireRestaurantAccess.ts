import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import { prisma } from '../prisma/client';

/** Requires the already-authorized company context and an enabled Restaurant Lite module. */
export async function requireRestaurantAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const companyId = (req as any).companyID as number | undefined;
  if (!companyId) return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { restaurant_enabled: true } });
  if (!company?.restaurant_enabled) {
    return res.status(403).json({ code: 403, error: true, reason: 'RESTAURANT_MODULE_DISABLED', message: 'El módulo Restaurant Lite está deshabilitado.' });
  }
  return next();
}
