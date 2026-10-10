"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePlanFeatureDependencies = void 0;
exports.requirePlanFeature = requirePlanFeature;
exports.requirePlanFeatures = requirePlanFeatures;
exports.requireAnyPlanFeature = requireAnyPlanFeature;
const plan_capabilities_1 = require("../config/plan-capabilities");
const plan_enforcement_service_1 = require("../services/plan-enforcement.service");
const product_access_requests_service_1 = require("../services/product-access-requests.service");
const company_access_service_1 = require("../services/company-access.service");
exports.requirePlanFeatureDependencies = {
    resolveFeatureAccessForCompany: plan_enforcement_service_1.resolveFeatureAccessForCompany,
    buildProductAccessForbiddenData: product_access_requests_service_1.buildProductAccessForbiddenData,
};
async function resolveFeatureAccessForRequest(req, companyId, feature) {
    const normalizedAccess = req.companyAccess;
    if (normalizedAccess && normalizedAccess.companyId === companyId) {
        return {
            allowed: normalizedAccess.lifecycle.mode === 'FULL' && (0, company_access_service_1.hasCompanyFeature)(normalizedAccess, feature),
            currentPlan: normalizedAccess.entitlements.currentPlan,
            requiredPlan: (0, plan_capabilities_1.getFeatureRequiredPlan)(feature),
        };
    }
    return exports.requirePlanFeatureDependencies.resolveFeatureAccessForCompany(companyId, feature);
}
function sendLifecycleDenied(req, res) {
    const access = req.companyAccess;
    const companyId = req.companyID;
    if (!access || access.companyId === companyId && access.lifecycle.mode === 'FULL')
        return null;
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
function requirePlanFeature(feature) {
    return async (req, res, next) => {
        try {
            const companyId = req.companyID;
            if (!companyId) {
                return res.status(400).json({
                    code: 400,
                    error: true,
                    message: 'Company context not found',
                });
            }
            const lifecycleDenied = sendLifecycleDenied(req, res);
            if (lifecycleDenied)
                return lifecycleDenied;
            const access = await resolveFeatureAccessForRequest(req, companyId, feature);
            if (!access.allowed) {
                const productAccess = await exports.requirePlanFeatureDependencies.buildProductAccessForbiddenData({
                    companyId,
                    feature,
                });
                return res.status(403).json({
                    code: 403,
                    error: true,
                    ...(req.companyAccess
                        ? { errorCode: 'FEATURE_NOT_ENTITLED', reason: 'FEATURE_NOT_ENTITLED' }
                        : { reason: 'CAPABILITY_REQUIRED' }),
                    message: productAccess?.requiresLabel ?? (0, plan_enforcement_service_1.buildFeatureNotAvailableMessage)(access.requiredPlan),
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
        }
        catch (error) {
            console.error('Error validating plan feature access:', error);
            return res.status(500).json({
                code: 500,
                error: true,
                message: 'Internal server error',
            });
        }
    };
}
function requirePlanFeatures(features) {
    return async (req, res, next) => {
        try {
            const companyId = req.companyID;
            if (!companyId) {
                return res.status(400).json({
                    code: 400,
                    error: true,
                    message: 'Company context not found',
                });
            }
            for (const feature of features) {
                const lifecycleDenied = sendLifecycleDenied(req, res);
                if (lifecycleDenied)
                    return lifecycleDenied;
                const access = await resolveFeatureAccessForRequest(req, companyId, feature);
                if (!access.allowed) {
                    const productAccess = await exports.requirePlanFeatureDependencies.buildProductAccessForbiddenData({
                        companyId,
                        feature,
                    });
                    return res.status(403).json({
                        code: 403,
                        error: true,
                        ...(req.companyAccess
                            ? { errorCode: 'FEATURE_NOT_ENTITLED', reason: 'FEATURE_NOT_ENTITLED' }
                            : { reason: 'CAPABILITY_REQUIRED' }),
                        message: productAccess?.requiresLabel ?? (0, plan_enforcement_service_1.buildFeatureNotAvailableMessage)(access.requiredPlan),
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
        }
        catch (error) {
            console.error('Error validating plan feature access:', error);
            return res.status(500).json({
                code: 500,
                error: true,
                message: 'Internal server error',
            });
        }
    };
}
function requireAnyPlanFeature(features) {
    return async (req, res, next) => {
        try {
            const companyId = req.companyID;
            if (!companyId) {
                return res.status(400).json({
                    code: 400,
                    error: true,
                    message: 'Company context not found',
                });
            }
            for (const feature of features) {
                const lifecycleDenied = sendLifecycleDenied(req, res);
                if (lifecycleDenied)
                    return lifecycleDenied;
                const access = await resolveFeatureAccessForRequest(req, companyId, feature);
                if (access.allowed) {
                    return next();
                }
            }
            const fallbackFeature = features[0];
            const fallbackAccess = await resolveFeatureAccessForRequest(req, companyId, fallbackFeature);
            const productAccess = await exports.requirePlanFeatureDependencies.buildProductAccessForbiddenData({
                companyId,
                feature: fallbackFeature,
            });
            return res.status(403).json({
                code: 403,
                error: true,
                ...(req.companyAccess
                    ? { errorCode: 'FEATURE_NOT_ENTITLED', reason: 'FEATURE_NOT_ENTITLED' }
                    : { reason: 'CAPABILITY_REQUIRED' }),
                message: productAccess?.requiresLabel ?? (0, plan_enforcement_service_1.buildFeatureNotAvailableMessage)(fallbackAccess.requiredPlan),
                data: {
                    feature: fallbackFeature,
                    capability: productAccess?.missingCapability ?? null,
                    currentPlan: fallbackAccess.currentPlan,
                    requiredPlan: fallbackAccess.requiredPlan,
                    ...productAccess,
                },
            });
        }
        catch (error) {
            console.error('Error validating any plan feature access:', error);
            return res.status(500).json({
                code: 500,
                error: true,
                message: 'Internal server error',
            });
        }
    };
}
