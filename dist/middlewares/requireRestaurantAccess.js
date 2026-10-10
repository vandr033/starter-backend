"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRestaurantAccess = requireRestaurantAccess;
const client_1 = require("../prisma/client");
const company_access_service_1 = require("../services/company-access.service");
/** Requires the already-authorized company context and an enabled Restaurant Lite module. */
async function requireRestaurantAccess(req, res, next) {
    const companyId = req.companyID;
    if (!companyId)
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    if (req.companyAccess && req.companyAccess.companyId === companyId) {
        if (!(0, company_access_service_1.hasCompanyCapability)(req.companyAccess, 'RESTAURANT_MODULE')) {
            return res.status(403).json({
                code: 403,
                error: true,
                errorCode: 'FEATURE_NOT_ENTITLED',
                reason: 'RESTAURANT_MODULE_DISABLED',
                message: 'El módulo Restaurant Lite está deshabilitado.',
                data: { capability: 'RESTAURANT_MODULE' },
            });
        }
        return next();
    }
    const company = await client_1.prisma.company.findUnique({ where: { id: companyId }, select: { restaurant_enabled: true } });
    if (!company?.restaurant_enabled) {
        return res.status(403).json({ code: 403, error: true, reason: 'RESTAURANT_MODULE_DISABLED', message: 'El módulo Restaurant Lite está deshabilitado.' });
    }
    return next();
}
