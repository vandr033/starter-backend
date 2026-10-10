import type { NextFunction, Response } from 'express';
import { prisma } from '../prisma/client';
import type { AuthenticatedRequest } from './requireAuth';
import { getDemoProfileForCompanySlug } from '../config/demo-profiles';
import { sendDemoCompanyMismatch, sendDemoReadOnly } from './demo-session.middleware';
import {
  buildShopUnavailablePayload,
  isCompanyAvailableNow,
} from '../utils/company-availability';

type CompanyIdSource = 'query' | 'body' | 'params';

type RequireActiveCompanyOptions = {
  source: CompanyIdSource;
  key?: string;
};

function readRawValue(req: AuthenticatedRequest, source: CompanyIdSource, key: string): unknown {
  if (source === 'query') return req.query?.[key];
  if (source === 'params') return req.params?.[key];
  return req.body?.[key];
}

function parseCompanyId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return parseCompanyId(raw[0]);
  }
  return null;
}

export function requireActiveCompany(options: RequireActiveCompanyOptions) {
  const source = options.source;
  const key = options.key || 'company_id';

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rawRequestedCompanyId = readRawValue(req, source, key);
      const requestedCompanyId = parseCompanyId(rawRequestedCompanyId);
      const lockedCompanyId = req.demoSessionContext?.companyId;
      if (lockedCompanyId && rawRequestedCompanyId != null && requestedCompanyId !== lockedCompanyId) {
        return sendDemoCompanyMismatch(res);
      }
      const companyId = lockedCompanyId ?? requestedCompanyId;

      if (!companyId) {
        return res.status(400).json({
          code: 400,
          error: true,
          message: `${key} is required and must be a positive integer`,
        });
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          slug: true,
          availableUntil: true,
          is_active: true,
          deleted_at: true,
        },
      });

      if (!company) {
        return res.status(404).json({
          code: 404,
          error: true,
          message: 'Company not found',
        });
      }

      if (!isCompanyAvailableNow(company)) {
        return res.status(403).json(buildShopUnavailablePayload(company.availableUntil));
      }

      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()) && getDemoProfileForCompanySlug(company.slug)) {
        return sendDemoReadOnly(res);
      }

      (req as any).companyID = company.id;
      return next();
    } catch (error) {
      console.error('Error validating company availability:', error);
      return res.status(500).json({
        code: 500,
        error: true,
        message: 'Internal server error',
      });
    }
  };
}
