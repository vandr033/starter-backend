"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRestaurantCompanyContext = requireRestaurantCompanyContext;
const company_availability_1 = require("../utils/company-availability");
const active_shop_cookie_1 = require("../utils/active-shop-cookie");
const company_access_service_1 = require("../services/company-access.service");
const demo_session_middleware_1 = require("./demo-session.middleware");
/**
 * Strict company boundary for Restaurant Lite.
 *
 * Ordinary users must explicitly select a company. Demo sessions use their
 * locked server-side company and reject any conflicting client selection.
 */
function requireRestaurantCompanyContext(allowedRoles) {
    return async (req, res, next) => {
        const user = req.authUser;
        if (!user?.id)
            return res.status(401).json({ code: 401, error: true, message: 'Unauthorized.' });
        const cookie = (0, active_shop_cookie_1.getActiveCompanyCookieState)(req);
        const demoCompanyId = req.demoSessionContext?.companyId;
        if (demoCompanyId && cookie.present && cookie.companyId !== demoCompanyId) {
            return (0, demo_session_middleware_1.sendDemoCompanyMismatch)(res);
        }
        if (!demoCompanyId && !cookie.present) {
            return res.status(400).json({
                code: 400,
                error: true,
                reason: 'ACTIVE_COMPANY_REQUIRED',
                message: 'Selecciona una empresa activa para operar Restaurante Lite.',
            });
        }
        if (!demoCompanyId && (cookie.invalid || !cookie.companyId)) {
            return res.status(400).json({
                code: 400,
                error: true,
                reason: 'ACTIVE_COMPANY_INVALID',
                message: 'La empresa activa seleccionada no es válida. Selecciona otra empresa.',
            });
        }
        const companyId = demoCompanyId ?? cookie.companyId;
        try {
            const context = await (0, company_access_service_1.resolveCompanyContextForUser)(user.id, companyId);
            if (!context) {
                return res.status(403).json({
                    code: 403,
                    error: true,
                    errorCode: 'COMPANY_ACCESS_DENIED',
                    reason: 'ACTIVE_COMPANY_NOT_MEMBER',
                    message: 'No tienes una membresía activa en la empresa seleccionada.',
                    activeCompanyId: companyId,
                });
            }
            const { membership, access } = context;
            if (!allowedRoles.includes(membership.role)) {
                return res.status(403).json({
                    code: 403,
                    error: true,
                    errorCode: 'ROLE_FORBIDDEN',
                    reason: 'INSUFFICIENT_COMPANY_ROLE',
                    message: 'No tienes permisos para esta operación en la empresa seleccionada.',
                    activeCompanyId: companyId,
                });
            }
            if (access.lifecycle.mode !== 'FULL') {
                const payload = (0, company_availability_1.buildShopUnavailablePayload)(membership.company.availableUntil, 'La empresa seleccionada está inactiva o ya no está disponible.');
                return res.status(403).json({
                    ...payload,
                    errorCode: access.lifecycle.reason ?? 'COMPANY_ACCESS_DENIED',
                    data: {
                        ...payload.data,
                        mode: access.lifecycle.mode,
                    },
                });
            }
            req.companyUser = membership;
            req.companyID = membership.company_id;
            req.companyAccess = access;
            req.restaurantCompanyContext = {
                companyId: membership.company_id,
                role: membership.role,
            };
            return next();
        }
        catch (error) {
            console.error('Error resolving strict restaurant company context:', error);
            return res.status(500).json({ code: 500, error: true, message: 'No pudimos validar la empresa activa.' });
        }
    };
}
