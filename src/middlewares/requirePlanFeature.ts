import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import type { PlanFeatureKey } from '../config/plan-capabilities';
import {
    buildFeatureNotAvailableMessage,
    resolveFeatureAccessForCompany,
} from '../services/plan-enforcement.service';
import { buildProductAccessForbiddenData } from '../services/product-access-requests.service';

export const requirePlanFeatureDependencies = {
    resolveFeatureAccessForCompany,
    buildProductAccessForbiddenData,
};

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

            const access = await requirePlanFeatureDependencies.resolveFeatureAccessForCompany(companyId, feature);
            if (!access.allowed) {
                const productAccess = await requirePlanFeatureDependencies.buildProductAccessForbiddenData({
                    companyId,
                    feature,
                });

                return res.status(403).json({
                    code: 403,
                    error: true,
                    reason: 'CAPABILITY_REQUIRED',
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
                const access = await requirePlanFeatureDependencies.resolveFeatureAccessForCompany(companyId, feature);
                if (!access.allowed) {
                    const productAccess = await requirePlanFeatureDependencies.buildProductAccessForbiddenData({
                        companyId,
                        feature,
                    });

                    return res.status(403).json({
                        code: 403,
                        error: true,
                        reason: 'CAPABILITY_REQUIRED',
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
                const access = await requirePlanFeatureDependencies.resolveFeatureAccessForCompany(companyId, feature);
                if (access.allowed) {
                    return next();
                }
            }

            const fallbackFeature = features[0];
            const fallbackAccess = await requirePlanFeatureDependencies.resolveFeatureAccessForCompany(
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
                reason: 'CAPABILITY_REQUIRED',
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
