import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import type { ProductCapability } from '../config/product-entitlements';
import { companyHasCapability } from '../services/company-entitlements.service';

const DEFAULT_PUBLIC_MESSAGES: Record<ProductCapability, string> = {
  RESERVAS_BASE: 'Bookings are not available for this business',
  RESERVAS_PRO: 'This booking feature is not available for this business',
  EVENTOS_BASE: 'Events are not available for this business',
  EVENTOS_PRO: 'This event feature is not available for this business',
  CLASES_BASE: 'Classes are not available for this business',
  CLASES_PRO: 'This class feature is not available for this business',
  CRM_BASE: 'This feature is not available for this business',
  CRM_PRO: 'This feature is not available for this business',
  CRM_IMPORT_EXPORT: 'This feature is not available for this business',
  CRM_SEGMENTATION: 'This feature is not available for this business',
  CRM_REACTIVATION: 'This feature is not available for this business',
  MENSAJERIA_BASE: 'This feature is not available for this business',
  MENSAJERIA_PRO: 'This feature is not available for this business',
  MENSAJERIA_REMINDERS: 'This feature is not available for this business',
  MENSAJERIA_BULK_WHATSAPP: 'This feature is not available for this business',
  MENSAJERIA_REVIEW_REQUESTS: 'This feature is not available for this business',
  MENSAJERIA_CAMPAIGNS: 'This feature is not available for this business',
  PERSONALIZACION_BASE: 'This storefront feature is not available for this business',
  PERSONALIZACION_PLUS: 'This storefront feature is not available for this business',
  STOREFRONT_ADVANCED_CTA: 'This storefront feature is not available for this business',
  STOREFRONT_SECTION_ORDER: 'This storefront feature is not available for this business',
  STOREFRONT_FOOTER_CUSTOMIZATION: 'This storefront feature is not available for this business',
  STOREFRONT_ANNOUNCEMENT_BANNERS: 'This storefront feature is not available for this business',
  METRICAS_BASE: 'This feature is not available for this business',
  METRICAS_PRO: 'This feature is not available for this business',
  METRICAS_OPERATIONAL_DASHBOARD: 'This feature is not available for this business',
  METRICAS_GROUP_ANALYTICS: 'This feature is not available for this business',
  METRICAS_REVIEW_ANALYTICS: 'This feature is not available for this business',
  MARKETPLACE_LISTING: 'This marketplace feature is not available for this business',
  MARKETPLACE_PLUS: 'This marketplace feature is not available for this business',
};

export const requireCompanyCapabilityDependencies = {
  companyHasCapability,
};

export function requireCompanyCapability(
  capability: ProductCapability,
  options?: {
    message?: string;
  },
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = (req as any).companyID as number | undefined;
      if (!companyId) {
        return res.status(400).json({
          code: 400,
          error: true,
          message: 'Company context not found',
        });
      }

      const allowed = await requireCompanyCapabilityDependencies.companyHasCapability(
        companyId,
        capability,
      );

      if (!allowed) {
        return res.status(403).json({
          code: 403,
          error: true,
          reason: 'PRODUCT_NOT_ACTIVE',
          message: options?.message ?? DEFAULT_PUBLIC_MESSAGES[capability],
          data: {
            capability,
          },
        });
      }

      return next();
    } catch (error) {
      console.error('Error validating company capability access:', error);
      return res.status(500).json({
        code: 500,
        error: true,
        message: 'Internal server error',
      });
    }
  };
}
