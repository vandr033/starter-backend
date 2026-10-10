"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProductAccessRequest = createProductAccessRequest;
exports.getProductAccessRequests = getProductAccessRequests;
const product_access_requests_service_1 = require("../services/product-access-requests.service");
function firstQueryString(value) {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value) && typeof value[0] === 'string')
        return value[0];
    return undefined;
}
async function createProductAccessRequest(req, res) {
    const companyId = req.companyID;
    const requestedByUserId = req.authUser?.id;
    if (!companyId || !requestedByUserId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Company context not found',
        });
    }
    const payload = req.validated ?? req.body;
    const result = await (0, product_access_requests_service_1.createAdminProductAccessRequest)({
        companyId,
        requestedByUserId,
        productCode: payload.productCode,
        tierCode: payload.tierCode,
        capability: payload.capability,
        message: payload.message,
        source: payload.source,
    });
    return res.status(result.code).json(result);
}
async function getProductAccessRequests(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Company context not found',
        });
    }
    const status = firstQueryString(req.query.status);
    const productCode = firstQueryString(req.query.productCode);
    const result = await (0, product_access_requests_service_1.listAdminProductAccessRequests)({
        companyId,
        status,
        productCode,
    });
    return res.status(result.code).json(result);
}
