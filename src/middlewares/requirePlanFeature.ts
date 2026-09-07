import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import { getFeatureRequiredPlan, type PlanFeatureKey } from '../config/plan-capabilities';
import {
    buildFeatureNotAvailableMessage,
    resolveFeatureAccessForCompany,
} from '../services/plan-enforcement.service';
import { buildProductAccessForbiddenData } from '../services/product-access-requests.service';
import { hasCompanyFeature } from '../services/company-access.service';

export const requirePlanFeatureDependencies = {
    resolveFeatureAccessForCompany,
    buildProductAccessForbiddenData,
};

async function resolveFeatureAccessForRequest(
    req: AuthenticatedRequest,
    companyId: number,
    feature: PlanFeatureKey,
) {
    const normalizedAccess = req.companyAccess;
    if (normalizedAccess && normalizedAccess.companyId === companyId) {
        return {
            allowed: normalizedAccess.lifecycle.mode === 'FULL' && hasCompanyFeature(normalizedAccess, feature),
            currentPlan: normalizedAccess.entitlements.currentPlan,
            requiredPlan: getFeatureRequiredPlan(feature),
        };
    }

    return requirePlanFeatureDependencies.resolveFeatureAccessForCompany(companyId, feature);
}

function sendLifecycleDenied(req: AuthenticatedRequest, res: Response): Response | null {
    const access = req.companyAccess;
    const companyId = (req as any).companyID as number | undefined;
    if (!access || access.companyId === companyId && access.lifecycle.mode === 'FULL') return null;

    if (companyId && access.companyId !== companyId) {
        return res.status(403).json({
            code: 403,
            error: true,
            errorCode: 'COMPANY_ACCESS_DENIED',
            reason: 'COMPANY_ACCESS_DENIED',
            message: 'El contexto de empresa no coincide con la sesión activa.',
        });
    }

    const isRenewalOnly = access.lifecycle.mode === 'RENEWAL_ONLY';
    return res.status(403).json({
        code: 403,
        error: true,
        errorCode: access.lifecycle.reason ?? 'COMPANY_ACCESS_DENIED',
        reason: access.lifecycle.reason ?? 'COMPANY_ACCESS_DENIED',
        message: isRenewalOnly
            ? 'Tu plan terminó. Renová tu cuenta para volver a operar.'
            : 'La empresa seleccionada está inactiva o ya no está disponible.',
        data: {
            mode: access.lifecycle.mode,
            availableUntil: access.lifecycle.availableUntil,
        },
    });
}

export function requirePlanFeature(feature: PlanFeatureKey) {
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

            const lifecycleDenied = sendLifecycleDenied(req, res);
            if (lifecycleDenied) return lifecycleDenied;

            const access = await resolveFeatureAccessForRequest(req, companyId, feature);
            if (!access.allowed) {
                const productAccess = await requirePlanFeatureDependencies.buildProductAccessForbiddenData({
                    companyId,
                    feature,
                });

                return res.status(403).json({
                    code: 403,
                    error: true,
                    ...(req.companyAccess
                        ? { errorCode: 'FEATURE_NOT_ENTITLED', reason: 'FEATURE_NOT_ENTITLED' }
                        : { reason: 'CAPABILITY_REQUIRED' }),
                    message: productAccess?.requiresLabel ?? buildFeatureNotAvailableMessage(access.requiredPlan),
                    data: {
                        feature,
                        capability: productAccess?.missingCapability ?? null,
                        currentPlan: access.currentPlan,
                        requiredPlan: access.requiredPlan,
                        ...productAccess,
                    },
                });
            }

            return next();
        } catch (error) {
            console.error('Error validating plan feature access:', error);
            return res.status(500).json({
                code: 500,
                error: true,
                message: 'Internal server error',
            });
        }
    };
}

export function requirePlanFeatures(features: PlanFeatureKey[]) {
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

            for (const feature of features) {
                const lifecycleDenied = sendLifecycleDenied(req, res);
                if (lifecycleDenied) return lifecycleDenied;

                const access = await resolveFeatureAccessForRequest(req, companyId, feature);
                if (!access.allowed) {
                    const productAccess = await requirePlanFeatureDependencies.buildProductAccessForbiddenData({
                        companyId,
                        feature,
                    });

                    return res.status(403).json({
                        code: 403,
                        error: true,
                        ...(req.companyAccess
                            ? { errorCode: 'FEATURE_NOT_ENTITLED', reason: 'FEATURE_NOT_ENTITLED' }
                            : { reason: 'CAPABILITY_REQUIRED' }),
                        message: productAccess?.requiresLabel ?? buildFeatureNotAvailableMessage(access.requiredPlan),
                        data: {
                            feature,
                            capability: productAccess?.missingCapability ?? null,
                            currentPlan: access.currentPlan,
                            requiredPlan: access.requiredPlan,
                            ...productAccess,
                        },
                    });
                }
            }

            return next();
        } catch (error) {
            console.error('Error validating plan feature access:', error);
            return res.status(500).json({
                code: 500,
                error: true,
                message: 'Internal server error',
            });
        }
    };
}

export function requireAnyPlanFeature(features: PlanFeatureKey[]) {
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

            for (const feature of features) {
                const lifecycleDenied = sendLifecycleDenied(req, res);
                if (lifecycleDenied) return lifecycleDenied;

                const access = await resolveFeatureAccessForRequest(req, companyId, feature);
                if (access.allowed) {
                    return next();
                }
            }

            const fallbackFeature = features[0];
            const fallbackAccess = await resolveFeatureAccessForRequest(
                req,
                companyId,
                fallbackFeature,
            );
            const productAccess = await requirePlanFeatureDependencies.buildProductAccessForbiddenData({
                companyId,
                feature: fallbackFeature,
            });

            return res.status(403).json({
                code: 403,
                error: true,
                ...(req.companyAccess
                    ? { errorCode: 'FEATURE_NOT_ENTITLED', reason: 'FEATURE_NOT_ENTITLED' }
                    : { reason: 'CAPABILITY_REQUIRED' }),
                message: productAccess?.requiresLabel ?? buildFeatureNotAvailableMessage(fallbackAccess.requiredPlan),
                data: {
                    feature: fallbackFeature,
                    capability: productAccess?.missingCapability ?? null,
                    currentPlan: fallbackAccess.currentPlan,
                    requiredPlan: fallbackAccess.requiredPlan,
                    ...productAccess,
                },
            });
        } catch (error) {
            console.error('Error validating any plan feature access:', error);
            return res.status(500).json({
                code: 500,
                error: true,
                message: 'Internal server error',
            });
        }
    };
}
