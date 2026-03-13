import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import type { PlanFeatureKey } from '../config/plan-capabilities';
import {
    buildFeatureNotAvailableMessage,
    resolveFeatureAccessForCompany,
} from '../services/plan-enforcement.service';

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

            const access = await resolveFeatureAccessForCompany(companyId, feature);
            if (!access.allowed) {
                return res.status(403).json({
                    code: 403,
                    error: true,
                    message: buildFeatureNotAvailableMessage(access.requiredPlan),
                    data: {
                        feature,
                        currentPlan: access.currentPlan,
                        requiredPlan: access.requiredPlan,
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
                const access = await resolveFeatureAccessForCompany(companyId, feature);
                if (!access.allowed) {
                    return res.status(403).json({
                        code: 403,
                        error: true,
                        message: buildFeatureNotAvailableMessage(access.requiredPlan),
                        data: {
                            feature,
                            currentPlan: access.currentPlan,
                            requiredPlan: access.requiredPlan,
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
