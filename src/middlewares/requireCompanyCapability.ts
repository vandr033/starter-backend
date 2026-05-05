import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import type { ProductCapability } from '../config/product-entitlements';
import { companyHasCapability } from '../services/company-entitlements.service';

const DEFAULT_PUBLIC_MESSAGES: Record<ProductCapability, string> = {
  RESERVAS_BASE: 'Este negocio no tiene Reservas activas.',
  RESERVAS_PRO: 'Requiere Reservas Pro.',
  RESERVAS_SERVICE_PROMOTIONS: 'Requiere Reservas Pro.',
  EVENTOS_BASE: 'Este negocio no tiene Eventos activos.',
  EVENTOS_PRO: 'Requiere Eventos Pro.',
  CLASES_BASE: 'Este negocio no tiene Clases activas.',
  CLASES_PRO: 'Requiere Clases Pro.',
  COMMERCE_ACCESS: 'Este negocio no tiene Tienda activa.',
  COMMERCE_PRODUCTS: 'Este negocio no tiene Tienda activa.',
  COMMERCE_CATEGORIES: 'Este negocio no tiene Tienda activa.',
  COMMERCE_STOCK: 'Este negocio no tiene Tienda activa.',
  COMMERCE_ORDERS: 'Este negocio no tiene Tienda activa.',
  COMMERCE_PICKUP: 'Este negocio no tiene pickup activo.',
  COMMERCE_DELIVERY: 'Este negocio no tiene delivery activo.',
  COMMERCE_COMBOS: 'Este negocio no tiene combos activos.',
  COMMERCE_SCHEDULED_ORDERS: 'Requiere Tienda Pro.',
  COMMERCE_PROMOTIONS: 'Requiere Tienda Pro.',
  COMMERCE_STAFF_ASSIGNMENT: 'Requiere Tienda Pro.',
  COMMERCE_METRICS: 'Requiere Tienda Pro.',
  CRM_BASE: 'Esta función no está activa para este negocio.',
  CRM_PRO: 'Requiere CRM Pro.',
  CRM_IMPORT_EXPORT: 'Requiere CRM Pro.',
  CRM_SEGMENTATION: 'Requiere CRM Pro.',
  CRM_REACTIVATION: 'Requiere CRM Pro.',
  MENSAJERIA_BASE: 'Esta función no está activa para este negocio.',
  MENSAJERIA_PRO: 'Requiere Mensajería Pro.',
  MENSAJERIA_REMINDERS: 'Requiere Mensajería Pro.',
  MENSAJERIA_BULK_WHATSAPP: 'Requiere Mensajería Pro.',
  MENSAJERIA_REVIEW_REQUESTS: 'Requiere Mensajería Pro.',
  MENSAJERIA_CAMPAIGNS: 'Requiere Mensajería Pro.',
  PERSONALIZACION_BASE: 'Esta función de página pública no está activa para este negocio.',
  PERSONALIZACION_PLUS: 'Requiere Personalización Pro.',
  STOREFRONT_ADVANCED_CTA: 'Requiere Personalización Pro.',
  STOREFRONT_SECTION_ORDER: 'Requiere Personalización Pro.',
  STOREFRONT_FOOTER_CUSTOMIZATION: 'Requiere Personalización Pro.',
  STOREFRONT_ANNOUNCEMENT_BANNERS: 'Requiere Personalización Pro.',
  METRICAS_BASE: 'Esta función no está activa para este negocio.',
  METRICAS_PRO: 'Requiere Métricas.',
  METRICAS_OPERATIONAL_DASHBOARD: 'Requiere Métricas.',
  METRICAS_GROUP_ANALYTICS: 'Requiere Métricas.',
  METRICAS_REVIEW_ANALYTICS: 'Requiere Métricas.',
  MARKETPLACE_LISTING: 'Esta función de marketplace no está activa para este negocio.',
  MARKETPLACE_PLUS: 'Esta función de marketplace no está activa para este negocio.',
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
          message: 'No encontramos el contexto de la empresa.',
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
        message: 'No pudimos validar el acceso al producto.',
      });
    }
  };
}
