// src/middlewares/requireAuth.ts
import type { Request, Response, NextFunction } from "express";
import { getAuth } from "../config/auth";
import { prisma } from "../prisma/client";
import { CompanyUserRole } from "@prisma/client";
import {
  buildShopUnavailablePayload,
  isCompanyAvailableNow,
} from "../utils/company-availability";
import { getActiveCompanyIdFromRequest } from "../utils/active-shop-cookie";

export interface AuthenticatedRequest extends Request {
  authUser?: any;
  authSession?: any;
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
  const user = req.authUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (user.is_company_admin) {
    return next();
  }

  const companySlug = req.params.companySlug as string;

  const company = await prisma.company.findUnique({
    where: {
      slug: companySlug,
    },
  });

  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  const companyUser = await prisma.companyUser.findFirst({
    where: {
      company_id: company.id,
      user_id: user.id,
      role: { in: [CompanyUserRole.ADMIN, CompanyUserRole.ADMIN] }
    }
  })

  if (!companyUser) {
    return res.status(403).json({ error: "Forbidden" });
  }
  (req as any).companyID = company.id;

  return next();
}

export async function requireCompanyStaff(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = req.authUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (user.is_company_admin) {
    return next();
  }

  const companySlug = req.params.companySlug as string;

  const company = await prisma.company.findUnique({
    where: {
      slug: companySlug,
    },
  });

  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  const companyUser = await prisma.companyUser.findFirst({
    where: {
      company_id: company.id,
      user_id: user.id,
      role: { in: [CompanyUserRole.ADMIN, CompanyUserRole.ADMIN] }
    }
  })

  if (!companyUser) {
    return res.status(403).json({ error: "Forbidden" });
  }
  (req as any).companyID = company.id;

  return next();
}

/**
 * Middleware factory that checks if the authenticated user has one of the specified company roles.
 * Attaches the companyUser to the request for downstream use.
 * 
 * Usage: requireCompanyRole([CompanyUserRole.OWNER, CompanyUserRole.ADMIN])
 */
export function requireCompanyRole(allowedRoles: CompanyUserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.authUser;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized - no session" });
    }

    // Super admins: still look up their company association so controllers have companyID
    if (user.is_super_admin) {
      try {
        const companyUser = await prisma.companyUser.findFirst({
          where: {
            user_id: user.id,
            deleted_at: null,
            role: { in: allowedRoles },
          },
          orderBy: [
            { role: 'asc' },
            { updated_at: 'desc' },
          ],
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
              },
            },
          },
        });

        if (companyUser) {
          (req as any).companyUser = companyUser;
          (req as any).companyID = companyUser.company_id;
        }
      } catch (error) {
        console.error('Error looking up super admin company:', error);
      }
      return next();
    }

    try {
      const activeCompanyId = getActiveCompanyIdFromRequest(req);
      const baseWhere = {
        user_id: user.id,
        deleted_at: null as null,
      };

      let companyUser: any = null;

      if (activeCompanyId) {
        const activeShopMembership = await prisma.companyUser.findFirst({
          where: {
            ...baseWhere,
            company_id: activeCompanyId,
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
              },
            },
          },
        });

        if (!activeShopMembership) {
          return res.status(403).json({
            error: "Forbidden - invalid active shop context",
            activeCompanyId,
          });
        }

        if (!allowedRoles.includes(activeShopMembership.role)) {
          return res.status(403).json({
            error: "Forbidden - insufficient role in active shop",
            activeCompanyId,
            requiredRoles: allowedRoles,
            currentRole: activeShopMembership.role,
          });
        }

        companyUser = activeShopMembership;
      } else {
        // Backward-compatible fallback when no active shop was selected yet.
        companyUser = await prisma.companyUser.findFirst({
          where: {
            ...baseWhere,
            role: { in: allowedRoles },
          },
          orderBy: [
            { role: 'asc' },
            { updated_at: 'desc' },
          ],
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
              },
            },
          },
        });

        if (!companyUser) {
          return res.status(403).json({
            error: "Forbidden - insufficient role permissions",
            requiredRoles: allowedRoles,
          });
        }
      }

      if (!companyUser.company || !isCompanyAvailableNow(companyUser.company)) {
        const availableUntil = companyUser.company?.availableUntil ?? new Date(0);
        return res.status(403).json(
          buildShopUnavailablePayload(availableUntil, "Shop subscription expired"),
        );
      }

      // Attach companyUser to request for downstream use
      (req as any).companyUser = companyUser;
      (req as any).companyID = companyUser.company_id;

      return next();
    } catch (error) {
      console.error("Error checking company role:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}
