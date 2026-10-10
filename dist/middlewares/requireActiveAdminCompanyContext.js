"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActiveAdminCompanyContext = requireActiveAdminCompanyContext;
const active_shop_cookie_1 = require("../utils/active-shop-cookie");
const demo_session_middleware_1 = require("./demo-session.middleware");
function requireActiveAdminCompanyContext(req, res, next) {
    const cookie = (0, active_shop_cookie_1.getActiveCompanyCookieState)(req);
    const demoCompanyId = req.demoSessionContext?.companyId;
    if (demoCompanyId && cookie.present && cookie.companyId !== demoCompanyId) {
        return (0, demo_session_middleware_1.sendDemoCompanyMismatch)(res);
    }
    const activeCompanyId = demoCompanyId ?? cookie.companyId;
    const resolvedCompanyId = activeCompanyId
        || req.companyID
        || req.companyUser?.company_id
        || null;
    if (!resolvedCompanyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Selecciona una empresa activa para continuar.',
        });
    }
    if (!activeCompanyId && !demoCompanyId) {
        (0, active_shop_cookie_1.setActiveCompanyCookie)(res, resolvedCompanyId);
    }
    return next();
}
