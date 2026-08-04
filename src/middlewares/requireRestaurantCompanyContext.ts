import type { NextFunction, Response } from 'express';
import { CompanyUserRole } from '@prisma/client';
import type { AuthenticatedRequest } from './requireAuth';
import { prisma } from '../prisma/client';
import { buildShopUnavailablePayload, isCompanyAvailableNow } from '../utils/company-availability';
import { getActiveCompanyCookieState } from '../utils/active-shop-cookie';

/**
 * Strict company boundary for Restaurant Lite.
 *
 * This intentionally does not reuse requireCompanyRole: that middleware still
 * supports the platform's legacy "first membership" fallback for non-restaurant
 * modules. Restaurant operations must fail closed when no active company was
 * explicitly selected.
 */
export function requireRestaurantCompanyContext(allowedRoles: CompanyUserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.authUser;
    if (!user?.id) return res.status(401).json({ code: 401, error: true, message: 'Unauthorized.' });

    const cookie = getActiveCompanyCookieState(req);
    if (!cookie.present) {
      return res.status(400).json({
        code: 400,
        error: true,
        reason: 'ACTIVE_COMPANY_REQUIRED',
        message: 'Selecciona una empresa activa para operar Restaurante Lite.',
      });
    }
    if (cookie.invalid || !cookie.companyId) {
      return res.status(400).json({
        code: 400,
        error: true,
        reason: 'ACTIVE_COMPANY_INVALID',
        message: 'La empresa activa seleccionada no es válida. Selecciona otra empresa.',
      });
    }

    try {
      const membership = await prisma.companyUser.findFirst({
        where: {
          user_id: user.id,
          company_id: cookie.companyId,
          deleted_at: null,
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              availableUntil: true,
              is_active: true,
              deleted_at: true,
              restaurant_enabled: true,
              currency: true,
              timezone: true,
            },
          },
        },
      });

      if (!membership) {
        return res.status(403).json({
          code: 403,
          error: true,
          reason: 'ACTIVE_COMPANY_NOT_MEMBER',
          message: 'No tienes una membresía activa en la empresa seleccionada.',
          activeCompanyId: cookie.companyId,
        });
      }
      if (!allowedRoles.includes(membership.role)) {
        return res.status(403).json({
          code: 403,
          error: true,
          reason: 'INSUFFICIENT_COMPANY_ROLE',
          message: 'No tienes permisos para esta operación en la empresa seleccionada.',
          activeCompanyId: cookie.companyId,
        });
      }
      if (!membership.company || !isCompanyAvailableNow(membership.company)) {
        return res.status(403).json(buildShopUnavailablePayload(
          membership.company?.availableUntil ?? new Date(0),
          'La empresa seleccionada está inactiva o ya no está disponible.',
        ));
      }

      (req as any).companyUser = membership;
      (req as any).companyID = membership.company_id;
      (req as any).restaurantCompanyContext = {
        companyId: membership.company_id,
        role: membership.role,
      };
      return next();
    } catch (error) {
      console.error('Error resolving strict restaurant company context:', error);
      return res.status(500).json({ code: 500, error: true, message: 'No pudimos validar la empresa activa.' });
    }
  };
}
