"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicCommerceStore = getPublicCommerceStore;
exports.listPublicCommerceCategories = listPublicCommerceCategories;
exports.listPublicCommerceProducts = listPublicCommerceProducts;
exports.getPublicCommerceProduct = getPublicCommerceProduct;
exports.createPublicCommerceOrder = createPublicCommerceOrder;
exports.startPublicCommerceGuestCheckout = startPublicCommerceGuestCheckout;
exports.resendPublicCommerceGuestCheckout = resendPublicCommerceGuestCheckout;
exports.verifyPublicCommerceGuestCheckout = verifyPublicCommerceGuestCheckout;
exports.getPublicCommerceOrder = getPublicCommerceOrder;
exports.submitPublicCommercePaymentProof = submitPublicCommercePaymentProof;
exports.uploadCheckoutPaymentProof = uploadCheckoutPaymentProof;
exports.uploadPublicCommercePaymentProof = uploadPublicCommercePaymentProof;
exports.deletePublicCommercePaymentProof = deletePublicCommercePaymentProof;
exports.servePublicCommercePaymentProof = servePublicCommercePaymentProof;
exports.listMyCommerceOrders = listMyCommerceOrders;
exports.getMyCommerceOrder = getMyCommerceOrder;
exports.serveMyCommercePaymentProof = serveMyCommercePaymentProof;
const CommerceOrderService = __importStar(require("../services/commerce-order.service"));
const CommerceGuestCheckoutService = __importStar(require("../services/commerce-guest-checkout.service"));
const storage_service_1 = require("../services/storage.service");
function getRouteParam(value) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}
function getAccessToken(req) {
    const queryToken = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
    const queryAccessToken = Array.isArray(req.query.accessToken) ? req.query.accessToken[0] : req.query.accessToken;
    const bodyToken = typeof req.body?.token === 'string' ? req.body.token : undefined;
    const bodyAccessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken : undefined;
    const value = queryToken ?? queryAccessToken ?? bodyToken ?? bodyAccessToken;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
async function getPublicCommerceStore(req, res) {
    const result = await CommerceOrderService.getPublicCommerceStore(getRouteParam(req.params.slug));
    return res.status(result.code).json(result);
}
async function listPublicCommerceCategories(req, res) {
    const result = await CommerceOrderService.listPublicCommerceCategories(getRouteParam(req.params.slug));
    return res.status(result.code).json(result);
}
async function listPublicCommerceProducts(req, res) {
    const result = await CommerceOrderService.listPublicCommerceProducts(getRouteParam(req.params.slug));
    return res.status(result.code).json(result);
}
async function getPublicCommerceProduct(req, res) {
    const result = await CommerceOrderService.getPublicCommerceProduct(getRouteParam(req.params.slug), getRouteParam(req.params.productSlug));
    return res.status(result.code).json(result);
}
async function createPublicCommerceOrder(req, res) {
    const payload = req.validated ?? req.body;
    const authReq = req;
    const result = await CommerceOrderService.createPublicCommerceOrder(getRouteParam(req.params.slug), payload, authReq.authUser?.id);
    return res.status(result.code).json(result);
}
async function startPublicCommerceGuestCheckout(req, res) {
    const payload = req.validated ?? req.body;
    const result = await CommerceGuestCheckoutService.startCommerceGuestCheckout(getRouteParam(req.params.slug), payload);
    return res.status(result.code).json(result);
}
async function resendPublicCommerceGuestCheckout(req, res) {
    const payload = req.validated ?? req.body;
    const sessionId = typeof payload.checkout_session_id === 'string' ? payload.checkout_session_id.trim() : '';
    const result = await CommerceGuestCheckoutService.resendCommerceGuestCheckoutCode(getRouteParam(req.params.slug), sessionId);
    return res.status(result.code).json(result);
}
async function verifyPublicCommerceGuestCheckout(req, res) {
    const payload = req.validated ?? req.body;
    const sessionId = typeof payload.checkout_session_id === 'string' ? payload.checkout_session_id.trim() : '';
    const code = typeof payload.code === 'string' ? payload.code : '';
    const result = await CommerceGuestCheckoutService.verifyCommerceGuestCheckout(getRouteParam(req.params.slug), sessionId, code, req.headers);
    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }
    return res.status(result.code).json(result);
}
async function getPublicCommerceOrder(req, res) {
    const authReq = req;
    const result = await CommerceOrderService.getPublicCommerceOrder(getRouteParam(req.params.slug), getRouteParam(req.params.orderNumber), {
        accessToken: getAccessToken(req),
        authUserId: authReq.authUser?.id,
    });
    return res.status(result.code).json(result);
}
async function submitPublicCommercePaymentProof(req, res) {
    const payload = req.validated ?? req.body;
    const authReq = req;
    const result = await CommerceOrderService.submitPublicCommercePaymentProof(getRouteParam(req.params.slug), getRouteParam(req.params.orderNumber), payload.paymentProofUrl, {
        accessToken: getAccessToken(req),
        authUserId: authReq.authUser?.id,
    });
    return res.status(result.code).json(result);
}
async function uploadCheckoutPaymentProof(req, res) {
    const authReq = req;
    const result = await CommerceOrderService.uploadCheckoutPaymentProof({
        slug: getRouteParam(req.params.slug),
        authUserId: authReq.authUser?.id ?? null,
        file: req.file,
        uploadIntent: typeof req.body?.uploadIntent === 'string' ? req.body.uploadIntent : null,
    });
    return res.status(result.code).json(result);
}
async function uploadPublicCommercePaymentProof(req, res) {
    const authReq = req;
    const result = await CommerceOrderService.uploadPublicCommercePaymentProof({
        slug: getRouteParam(req.params.slug),
        orderNumber: getRouteParam(req.params.orderNumber),
        accessToken: getAccessToken(req),
        authUserId: authReq.authUser?.id ?? null,
        file: req.file,
        uploadIntent: typeof req.body?.uploadIntent === 'string' ? req.body.uploadIntent : null,
    });
    return res.status(result.code).json(result);
}
async function deletePublicCommercePaymentProof(req, res) {
    const authReq = req;
    const result = await CommerceOrderService.deletePublicCommercePaymentProof({
        slug: getRouteParam(req.params.slug),
        orderNumber: getRouteParam(req.params.orderNumber),
        accessToken: getAccessToken(req),
        authUserId: authReq.authUser?.id ?? null,
        deleteToken: typeof req.body?.deleteToken === 'string' ? req.body.deleteToken.trim() : null,
    });
    return res.status(result.code).json(result);
}
async function servePublicCommercePaymentProof(req, res) {
    const authReq = req;
    const result = await CommerceOrderService.resolvePublicCommercePaymentProofFile({
        slug: getRouteParam(req.params.slug),
        orderNumber: getRouteParam(req.params.orderNumber),
        accessToken: getAccessToken(req),
        authUserId: authReq.authUser?.id ?? null,
    });
    if (result.error || !result.data?.relativePath) {
        return res.status(result.code).json(result);
    }
    const filePath = await storage_service_1.StorageService.getFilePath(result.data.relativePath);
    return res.sendFile(filePath);
}
async function listMyCommerceOrders(req, res) {
    const authReq = req;
    if (!authReq.authUser) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const result = await CommerceOrderService.listMyCommerceOrders(getRouteParam(req.params.slug), authReq.authUser.id);
    return res.status(result.code).json(result);
}
async function getMyCommerceOrder(req, res) {
    const authReq = req;
    if (!authReq.authUser) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const result = await CommerceOrderService.getMyCommerceOrder(getRouteParam(req.params.slug), getRouteParam(req.params.orderNumber), authReq.authUser.id);
    return res.status(result.code).json(result);
}
async function serveMyCommercePaymentProof(req, res) {
    const authReq = req;
    if (!authReq.authUser) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const result = await CommerceOrderService.resolveMyCommercePaymentProofFile({
        slug: getRouteParam(req.params.slug),
        orderNumber: getRouteParam(req.params.orderNumber),
        userId: authReq.authUser.id,
    });
    if (result.error || !result.data?.relativePath) {
        return res.status(result.code).json(result);
    }
    const filePath = await storage_service_1.StorageService.getFilePath(result.data.relativePath);
    return res.sendFile(filePath);
}
