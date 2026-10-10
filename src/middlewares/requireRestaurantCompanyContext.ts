import type { NextFunction, Response } from 'express';
import { CompanyUserRole } from '@prisma/client';
import type { AuthenticatedRequest } from './requireAuth';
import { buildShopUnavailablePayload } from '../utils/company-availability';
import { getActiveCompanyCookieState } from '../utils/active-shop-cookie';
import { resolveCompanyContextForUser } from '../services/company-access.service';
import { sendDemoCompanyMismatch } from './demo-session.middleware';

/**
 * Strict company boundary for Restaurant Lite.
 *
 * Ordinary users must explicitly select a company. Demo sessions use their
 * locked server-side company and reject any conflicting client selection.
 */
export function requireRestaurantCompanyContext(allowedRoles: CompanyUserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.authUser;
    if (!user?.id) return res.status(401).json({ code: 401, error: true, message: 'Unauthorized.' });

    const cookie = getActiveCompanyCookieState(req);
    const demoCompanyId = req.demoSessionContext?.companyId;
    if (demoCompanyId && cookie.present && cookie.companyId !== demoCompanyId) {
      return sendDemoCompanyMismatch(res);
    }
    if (!demoCompanyId && !cookie.present) {
      return res.status(400).json({
        code: 400,
        error: true,
        reason: 'ACTIVE_COMPANY_REQUIRED',
        message: 'Selecciona una empresa activa para operar Restaurante Lite.',
      });
    }
    if (!demoCompanyId && (cookie.invalid || !cookie.companyId)) {
      return res.status(400).json({
        code: 400,
        error: true,
        reason: 'ACTIVE_COMPANY_INVALID',
        message: 'La empresa activa seleccionada no es válida. Selecciona otra empresa.',
      });
    }
    const companyId = demoCompanyId ?? cookie.companyId!;

    try {
      const context = await resolveCompanyContextForUser(user.id, companyId);

      if (!context) {
        return res.status(403).json({
          code: 403,
          error: true,
          errorCode: 'COMPANY_ACCESS_DENIED',
          reason: 'ACTIVE_COMPANY_NOT_MEMBER',
          message: 'No tienes una membresía activa en la empresa seleccionada.',
          activeCompanyId: companyId,
        });
      }
      const { membership, access } = context;
      if (!allowedRoles.includes(membership.role)) {
        return res.status(403).json({
          code: 403,
          error: true,
          errorCode: 'ROLE_FORBIDDEN',
          reason: 'INSUFFICIENT_COMPANY_ROLE',
          message: 'No tienes permisos para esta operación en la empresa seleccionada.',
          activeCompanyId: companyId,
        });
      }
      if (access.lifecycle.mode !== 'FULL') {
        const payload = buildShopUnavailablePayload(
          membership.company.availableUntil,
          'La empresa seleccionada está inactiva o ya no está disponible.',
        );
        return res.status(403).json({
          ...payload,
          errorCode: access.lifecycle.reason ?? 'COMPANY_ACCESS_DENIED',
          data: {
            ...payload.data,
            mode: access.lifecycle.mode,
          },
        });
      }

      (req as any).companyUser = membership;
      (req as any).companyID = membership.company_id;
      (req as any).companyAccess = access;
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
