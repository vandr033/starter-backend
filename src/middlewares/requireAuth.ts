// src/middlewares/requireAuth.ts
import type { Request, Response, NextFunction } from "express";
import { getAuth } from "../config/auth";
import { prisma } from "../prisma/client";
import { CompanyUserRole } from "@prisma/client";
import { buildShopUnavailablePayload } from "../utils/company-availability";
import { getActiveCompanyCookieState } from "../utils/active-shop-cookie";
import type { EffectiveCompanyAccess } from "../services/company-access.service";
import { resolveCompanyContextForUser } from "../services/company-access.service";

export interface AuthenticatedRequest extends Request {
  authUser?: any;
  authSession?: any;
  companyAccess?: EffectiveCompanyAccess;
  companyUser?: any;
  companyID?: number;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = await getAuth();
    // Remove verbose logging to reduce noise
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Fetch the full user from the database to include custom fields like is_super_admin
    const fullUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        name: true,
        is_super_admin: true,
        is_active: true,
        must_change_password: true,
        phone_prefix: true,
        phoneNumber: true,
        phoneNumberVerified: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!fullUser) {
      return res.status(401).json({ error: "Unauthorized - user not found" });
    }

    const originalUrl = req.originalUrl || req.url || "";
    const isAdminApi = originalUrl.startsWith("/api/admin/") || originalUrl.startsWith("/api/super-admin/");
    const allowWhilePasswordChange =
      originalUrl.startsWith("/api/admin/auth/session") ||
      originalUrl.startsWith("/api/admin/auth/sign-out") ||
      originalUrl.startsWith("/api/admin/auth/change-password");

    if (fullUser.must_change_password && isAdminApi && !allowWhilePasswordChange) {
      return res.status(403).json({
        code: 403,
        error: true,
        message: "Password change required",
        requirePasswordChange: true,
      });
    }

    const authReq = req as AuthenticatedRequest;
    authReq.authUser = fullUser;
    authReq.authSession = session.session;

    next();
  } catch (err) {
    console.error("Error resolving auth session", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = req.authUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!user.is_super_admin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return next();
}

export async function requireCompanyAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireCompanyRole([CompanyUserRole.OWNER, CompanyUserRole.ADMIN])(req, res, next);
}

export async function requireCompanyStaff(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireCompanyRole([
    CompanyUserRole.OWNER,
    CompanyUserRole.ADMIN,
    CompanyUserRole.STAFF,
  ])(req, res, next);
}

/**
 * Middleware factory that checks if the authenticated user has one of the specified company roles.
 * Attaches the companyUser to the request for downstream use.
 * 
 * Usage: requireCompanyRole([CompanyUserRole.OWNER, CompanyUserRole.ADMIN])
 */
export function requireCompanyRole(
  allowedRoles: CompanyUserRole[],
  options: { allowRenewalOnly?: boolean } = {},
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.authUser;

    if (!user) {
      return res.status(401).json({
        code: 401,
        error: true,
        errorCode: 'AUTH_REQUIRED',
        message: "Unauthorized - no session",
      });
    }

    try {
      const cookie = getActiveCompanyCookieState(req);
      if (cookie.invalid) {
        return res.status(400).json({
          code: 400,
          error: true,
          errorCode: 'COMPANY_CONTEXT_REQUIRED',
          reason: 'ACTIVE_COMPANY_INVALID',
          message: 'La empresa activa seleccionada no es válida. Selecciona otra empresa.',
        });
      }

      let companyId = cookie.companyId;
      if (!companyId) {
        const memberships = await prisma.companyUser.findMany({
          where: {
            user_id: user.id,
            deleted_at: null,
          },
          select: { company_id: true },
        });
        const companyIds = [...new Set(memberships.map((membership) => membership.company_id))];
        if (companyIds.length === 0) {
          return res.status(403).json({
            code: 403,
            error: true,
            errorCode: 'COMPANY_ACCESS_DENIED',
            message: 'No tienes acceso a ninguna empresa.',
            requiredRoles: allowedRoles,
          });
        }
        if (companyIds.length > 1) {
          return res.status(400).json({
            code: 400,
            error: true,
            errorCode: 'COMPANY_CONTEXT_REQUIRED',
            reason: 'ACTIVE_COMPANY_REQUIRED',
            message: 'Selecciona una empresa activa antes de continuar.',
          });
        }
        companyId = companyIds[0] ?? null;
      }

      if (!companyId) {
        return res.status(400).json({
          code: 400,
          error: true,
          errorCode: 'COMPANY_CONTEXT_REQUIRED',
          reason: 'ACTIVE_COMPANY_REQUIRED',
          message: 'Selecciona una empresa activa antes de continuar.',
        });
      }

      const context = await resolveCompanyContextForUser(user.id, companyId);
      if (!context) {
        return res.status(403).json({
          code: 403,
          error: true,
          errorCode: 'COMPANY_ACCESS_DENIED',
          reason: cookie.present ? 'ACTIVE_COMPANY_NOT_MEMBER' : 'COMPANY_ACCESS_DENIED',
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
          requiredRoles: allowedRoles,
          currentRole: membership.role,
        });
      }

      if (
        access.lifecycle.mode !== 'FULL' &&
        !(access.lifecycle.mode === 'RENEWAL_ONLY' && options.allowRenewalOnly)
      ) {
        const payload = buildShopUnavailablePayload(
          membership.company.availableUntil,
          access.lifecycle.mode === 'RENEWAL_ONLY'
            ? 'Tu plan terminó. Renová tu cuenta para volver a operar.'
            : 'La empresa seleccionada está inactiva o ya no está disponible.',
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

      access.membership.id = membership.id;
      (req as any).companyUser = membership;
      (req as any).companyID = membership.company_id;
      (req as any).companyAccess = access;

      return next();
    } catch (error) {
      console.error("Error checking company role:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}
