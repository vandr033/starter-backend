"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActiveCompany = requireActiveCompany;
const client_1 = require("../prisma/client");
const demo_profiles_1 = require("../config/demo-profiles");
const demo_session_middleware_1 = require("./demo-session.middleware");
const company_availability_1 = require("../utils/company-availability");
function readRawValue(req, source, key) {
    if (source === 'query')
        return req.query?.[key];
    if (source === 'params')
        return req.params?.[key];
    return req.body?.[key];
}
function parseCompanyId(raw) {
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0)
        return raw;
    if (typeof raw === 'string') {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isInteger(parsed) && parsed > 0)
            return parsed;
    }
    if (Array.isArray(raw) && raw.length > 0) {
        return parseCompanyId(raw[0]);
    }
    return null;
}
function requireActiveCompany(options) {
    const source = options.source;
    const key = options.key || 'company_id';
    return async (req, res, next) => {
        try {
            const rawRequestedCompanyId = readRawValue(req, source, key);
            const requestedCompanyId = parseCompanyId(rawRequestedCompanyId);
            const lockedCompanyId = req.demoSessionContext?.companyId;
            if (lockedCompanyId && rawRequestedCompanyId != null && requestedCompanyId !== lockedCompanyId) {
                return (0, demo_session_middleware_1.sendDemoCompanyMismatch)(res);
            }
            const companyId = lockedCompanyId ?? requestedCompanyId;
            if (!companyId) {
                return res.status(400).json({
                    code: 400,
                    error: true,
                    message: `${key} is required and must be a positive integer`,
                });
            }
            const company = await client_1.prisma.company.findUnique({
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
            if (!(0, company_availability_1.isCompanyAvailableNow)(company)) {
                return res.status(403).json((0, company_availability_1.buildShopUnavailablePayload)(company.availableUntil));
            }
            if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()) && (0, demo_profiles_1.getDemoProfileForCompanySlug)(company.slug)) {
                return (0, demo_session_middleware_1.sendDemoReadOnly)(res);
            }
            req.companyID = company.id;
            return next();
        }
        catch (error) {
            console.error('Error validating company availability:', error);
            return res.status(500).json({
                code: 500,
                error: true,
                message: 'Internal server error',
            });
        }
    };
}
