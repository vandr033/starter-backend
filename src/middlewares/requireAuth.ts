// src/middlewares/requireAuth.ts
import type { Request, Response, NextFunction } from "express";
import { auth } from "../config/auth";
import { prisma } from "../prisma/client";
import { CompanyUserRole } from "@prisma/client";

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
        phone_prefix: true,
        phoneNumber: true,
        phoneNumberVerified: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    console.log(fullUser);
    if (!fullUser) {
      return res.status(401).json({ error: "Unauthorized - user not found" });
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
  console.log(user);

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
          include: {
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
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
      // Find a CompanyUser record with one of the allowed roles
      const companyUser = await prisma.companyUser.findFirst({
        where: {
          user_id: user.id,
          deleted_at: null,
          role: { in: allowedRoles },
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
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