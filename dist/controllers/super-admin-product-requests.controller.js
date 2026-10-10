"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductAccessRequests = getProductAccessRequests;
exports.approveRequest = approveRequest;
exports.rejectRequest = rejectRequest;
exports.cancelRequest = cancelRequest;
const product_access_requests_service_1 = require("../services/product-access-requests.service");
function firstQueryString(value) {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value) && typeof value[0] === 'string')
        return value[0];
    return undefined;
}
function parsePositiveInt(value) {
    const raw = firstQueryString(value);
    if (!raw)
        return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
function parseRouteId(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    return Number.parseInt(raw ?? '', 10);
}
async function getProductAccessRequests(req, res) {
    const result = await (0, product_access_requests_service_1.listSuperAdminProductAccessRequests)({
        companyId: parsePositiveInt(req.query.companyId),
        status: firstQueryString(req.query.status),
        productCode: firstQueryString(req.query.productCode),
        search: firstQueryString(req.query.search),
        page: parsePositiveInt(req.query.page),
        limit: parsePositiveInt(req.query.limit),
    });
    return res.status(result.code).json(result);
}
async function approveRequest(req, res) {
    const requestId = parseRouteId(req.params.id);
    const resolvedByUserId = req.authUser?.id;
    if (!Number.isInteger(requestId) || requestId <= 0 || !resolvedByUserId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Invalid request id',
        });
    }
    const payload = req.validated ?? req.body;
    const result = await (0, product_access_requests_service_1.approveProductAccessRequest)({
        requestId,
        resolvedByUserId,
        internalNote: payload?.internalNote,
    });
    return res.status(result.code).json(result);
}
async function rejectRequest(req, res) {
    const requestId = parseRouteId(req.params.id);
    const resolvedByUserId = req.authUser?.id;
    if (!Number.isInteger(requestId) || requestId <= 0 || !resolvedByUserId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Invalid request id',
        });
    }
    const payload = req.validated ?? req.body;
    const result = await (0, product_access_requests_service_1.rejectProductAccessRequest)({
        requestId,
        resolvedByUserId,
        internalNote: payload?.internalNote,
    });
    return res.status(result.code).json(result);
}
async function cancelRequest(req, res) {
    const requestId = parseRouteId(req.params.id);
    const resolvedByUserId = req.authUser?.id;
    if (!Number.isInteger(requestId) || requestId <= 0 || !resolvedByUserId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Invalid request id',
        });
    }
    const payload = req.validated ?? req.body;
    const result = await (0, product_access_requests_service_1.cancelProductAccessRequest)({
        requestId,
        resolvedByUserId,
        internalNote: payload?.internalNote,
    });
    return res.status(result.code).json(result);
}
