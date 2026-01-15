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
    console.log("requireAuth");
    console.log("request", req.headers);
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    console.log("session", session);


    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const authReq = req as AuthenticatedRequest;
    authReq.authUser = session.user;      // this is your User from Prisma
    authReq.authSession = session.session;

    next();
  } catch (err) {
    console.error("Error resolving auth session", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = req.authUser;
  if(!user){
    return res.status(401).json({ error: "Unauthorized" });
  }

  if(!user.is_super_admin){
    return res.status(403).json({ error: "Forbidden" });
  }

  return next();
}

export async function requireCompanyAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction){
  const user = req.authUser;
  if(!user){
    return res.status(401).json({ error: "Unauthorized" });
  }

  if(user.is_company_admin){ 
    return next();
  }

  const {companySlug} = req.params;

  const company = await prisma.company.findUnique({
    where: {
      slug: companySlug,
    },
  });

  if (!company){
    return res.status(404).json({ error: "Company not found" });
  }

  const companyUser = await prisma.companyUser.findFirst({
    where:{
      company_id: company.id,
      user_id: user.id,
      role:{in:[CompanyUserRole.ADMIN, CompanyUserRole.ADMIN]}
    }
  })

  if (!companyUser){
    return res.status(403).json({ error: "Forbidden" });
  }
  (req as any).companyID = company.id;

  return next();
}

export async function requireCompanyStaff(req: AuthenticatedRequest, res: Response, next: NextFunction){
  const user = req.authUser;
  if(!user){
    return res.status(401).json({ error: "Unauthorized" });
  }

  if(user.is_company_admin){ 
    return next();
  }

  const {companySlug} = req.params;

  const company = await prisma.company.findUnique({
    where: {
      slug: companySlug,
    },
  });

  if (!company){
    return res.status(404).json({ error: "Company not found" });
  }

  const companyUser = await prisma.companyUser.findFirst({
    where:{
      company_id: company.id,
      user_id: user.id,
      role:{in:[CompanyUserRole.ADMIN, CompanyUserRole.ADMIN]}
    }
  })

  if (!companyUser){
    return res.status(403).json({ error: "Forbidden" });
  }
  (req as any).companyID = company.id;

  return next();
}