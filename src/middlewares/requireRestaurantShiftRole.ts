import type { NextFunction, Response } from 'express';
import { CompanyUserRole, RestaurantShiftMemberRole } from '@prisma/client';
import type { AuthenticatedRequest } from './requireAuth';
import { prisma } from '../prisma/client';

/**
 * Restricts staff-only restaurant operations to the role they hold in the
 * currently open shift. Company owners/admins already passed the company-role
 * middleware and retain access to manager routes.
 */
export function requireRestaurantShiftRole(allowedRoles: RestaurantShiftMemberRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = (req as any).companyID as number | undefined;
    const companyUser = (req as any).companyUser as { role?: CompanyUserRole } | undefined;
    const userId = req.authUser?.id;
    if (!companyId || !userId) return res.status(401).json({ code: 401, error: true, message: 'Sesión no válida.' });
    if (companyUser?.role === CompanyUserRole.OWNER || companyUser?.role === CompanyUserRole.ADMIN) return next();

    if (req.companyAccess && req.companyAccess.companyId === companyId) {
      const activeShiftRole = req.companyAccess.restaurant.activeShiftRole;
      if (activeShiftRole && allowedRoles.includes(activeShiftRole)) {
        (req as any).restaurantShiftMember = {
          id: null,
          shift_id: req.companyAccess.restaurant.activeShiftId,
          role: activeShiftRole,
        };
        return next();
      }
      return res.status(403).json({
        code: 403,
        error: true,
        errorCode: 'RESTAURANT_SHIFT_ROLE_REQUIRED',
        reason: 'RESTAURANT_SHIFT_ROLE_REQUIRED',
        message: 'Esta operación requiere un rol de anfitrión o encargado en el turno activo.',
      });
    }

    try {
      const now = new Date();
      const member = await prisma.restaurantShiftMember.findFirst({
        where: {
          company_id: companyId,
          user_id: userId,
          role: { in: allowedRoles },
          shift: {
            company_id: companyId,
            status: 'OPEN',
            start_at: { lte: now },
            end_at: { gt: now },
          },
        },
        select: { id: true, shift_id: true, role: true },
      });
      if (!member) {
        return res.status(403).json({
          code: 403,
          error: true,
          errorCode: 'RESTAURANT_SHIFT_ROLE_REQUIRED',
          reason: 'RESTAURANT_SHIFT_ROLE_REQUIRED',
          message: 'Esta operación requiere un rol de anfitrión o encargado en el turno activo.',
        });
      }
      (req as any).restaurantShiftMember = member;
      return next();
    } catch (error) {
      console.error('Error resolving restaurant shift role:', error);
      return res.status(500).json({ code: 500, error: true, message: 'No pudimos validar tu rol operativo.' });
    }
  };
}
