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
exports.listAdminCommercePointsOfSale = listAdminCommercePointsOfSale;
exports.createAdminCommercePointOfSale = createAdminCommercePointOfSale;
exports.updateAdminCommercePointOfSale = updateAdminCommercePointOfSale;
exports.deleteAdminCommercePointOfSale = deleteAdminCommercePointOfSale;
const CommercePointOfSaleService = __importStar(require("../services/commerce-point-of-sale.service"));
function getRouteParam(value) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}
function getCompanyId(req) {
    return req.companyID;
}
async function listAdminCommercePointsOfSale(req, res) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }
    const result = await CommercePointOfSaleService.listAdminCommercePointsOfSale(companyId);
    return res.status(result.code).json(result);
}
async function createAdminCommercePointOfSale(req, res) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }
    const payload = req.validated ?? req.body;
    const result = await CommercePointOfSaleService.createAdminCommercePointOfSale(companyId, payload);
    return res.status(result.code).json(result);
}
async function updateAdminCommercePointOfSale(req, res) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }
    const payload = req.validated ?? req.body;
    const result = await CommercePointOfSaleService.updateAdminCommercePointOfSale(companyId, getRouteParam(req.params.id), payload);
    return res.status(result.code).json(result);
}
async function deleteAdminCommercePointOfSale(req, res) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }
    const result = await CommercePointOfSaleService.deleteAdminCommercePointOfSale(companyId, getRouteParam(req.params.id));
    return res.status(result.code).json(result);
}
