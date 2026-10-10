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
exports.listAdminCommerceOrders = listAdminCommerceOrders;
exports.getAdminCommerceOrder = getAdminCommerceOrder;
exports.updateAdminCommerceOrderStatus = updateAdminCommerceOrderStatus;
exports.updateAdminCommerceOrderDeliveryCost = updateAdminCommerceOrderDeliveryCost;
exports.updateAdminCommerceOrderAssignment = updateAdminCommerceOrderAssignment;
exports.updateAdminCommerceOrderNotes = updateAdminCommerceOrderNotes;
exports.getAdminCommerceMetrics = getAdminCommerceMetrics;
exports.getAdminCommerceAssignableStaff = getAdminCommerceAssignableStaff;
exports.serveAdminCommercePaymentProof = serveAdminCommercePaymentProof;
const CommerceOrderService = __importStar(require("../services/commerce-order.service"));
const storage_service_1 = require("../services/storage.service");
function getRouteParam(value) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}
async function listAdminCommerceOrders(req, res) {
    const companyId = req.companyID;
    const companyUser = req.companyUser;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }
    const result = await CommerceOrderService.getAdminCommerceOrders({
        companyId,
        actorRole: companyUser?.role ?? null,
        actorUserId: req.authUser?.id ?? null,
    });
    return res.status(result.code).json(result);
}
async function getAdminCommerceOrder(req, res) {
    const companyId = req.companyID;
    const companyUser = req.companyUser;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }
    const result = await CommerceOrderService.getAdminCommerceOrder({
        companyId,
        orderId: getRouteParam(req.params.id),
        actorRole: companyUser?.role ?? null,
        actorUserId: req.authUser?.id ?? null,
    });
    return res.status(result.code).json(result);
}
async function updateAdminCommerceOrderStatus(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceOrderService.updateAdminCommerceOrderStatus({
        companyId,
        orderId: getRouteParam(req.params.id),
        changedByUserId: req.authUser?.id ?? null,
        paymentStatus: payload.payment_status,
        fulfillmentStatus: payload.fulfillment_status,
        note: payload.note,
    });
    return res.status(result.code).json(result);
}
async function updateAdminCommerceOrderDeliveryCost(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceOrderService.updateAdminCommerceOrderDeliveryCost({
        companyId,
        orderId: getRouteParam(req.params.id),
        changedByUserId: req.authUser?.id ?? null,
        deliveryCost: payload.deliveryCost,
        note: payload.note,
    });
    return res.status(result.code).json(result);
}
async function updateAdminCommerceOrderAssignment(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceOrderService.updateAdminCommerceOrderAssignment({
        companyId,
        orderId: getRouteParam(req.params.id),
        changedByUserId: req.authUser?.id ?? null,
        assignedStaffId: payload.assignedStaffId,
        note: payload.note,
    });
    return res.status(result.code).json(result);
}
async function updateAdminCommerceOrderNotes(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceOrderService.updateAdminCommerceOrderNotes({
        companyId,
        orderId: getRouteParam(req.params.id),
        internalNotes: payload.internal_notes,
    });
    return res.status(result.code).json(result);
}
async function getAdminCommerceMetrics(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }
    const result = await CommerceOrderService.getAdminCommerceMetrics(companyId);
    return res.status(result.code).json(result);
}
async function getAdminCommerceAssignableStaff(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }
    const result = await CommerceOrderService.getAdminCommerceAssignableStaff(companyId);
    return res.status(result.code).json(result);
}
async function serveAdminCommercePaymentProof(req, res) {
    const companyId = req.companyID;
    const companyUser = req.companyUser;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }
    const result = await CommerceOrderService.resolveAdminCommercePaymentProofFile({
        companyId,
        orderId: getRouteParam(req.params.id),
        actorRole: companyUser?.role ?? null,
        actorUserId: req.authUser?.id ?? null,
    });
    if (result.error || !result.data?.relativePath) {
        return res.status(result.code).json(result);
    }
    const filePath = await storage_service_1.StorageService.getFilePath(result.data.relativePath);
    return res.sendFile(filePath);
}
