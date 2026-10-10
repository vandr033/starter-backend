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
exports.listAdminCommerceProducts = listAdminCommerceProducts;
exports.getAdminCommerceProduct = getAdminCommerceProduct;
exports.createAdminCommerceProduct = createAdminCommerceProduct;
exports.updateAdminCommerceProduct = updateAdminCommerceProduct;
exports.deleteAdminCommerceProduct = deleteAdminCommerceProduct;
exports.reorderAdminCommerceProducts = reorderAdminCommerceProducts;
exports.uploadAdminCommerceProductImage = uploadAdminCommerceProductImage;
exports.setAdminCommerceProductPrimaryImage = setAdminCommerceProductPrimaryImage;
exports.reorderAdminCommerceProductImages = reorderAdminCommerceProductImages;
exports.updateAdminCommerceProductImage = updateAdminCommerceProductImage;
exports.deleteAdminCommerceProductImage = deleteAdminCommerceProductImage;
exports.upsertAdminCommerceProductPromotion = upsertAdminCommerceProductPromotion;
exports.removeAdminCommerceProductPromotion = removeAdminCommerceProductPromotion;
const CommerceProductService = __importStar(require("../services/commerce-product.service"));
const commerce_schema_1 = require("../schemas/commerce.schema");
function getRouteParam(value) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}
function getCompanyId(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
        return null;
    }
    return companyId;
}
async function listAdminCommerceProducts(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const parsedQuery = commerce_schema_1.adminCommerceCatalogQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Validation failed',
            errors: parsedQuery.error.flatten(),
        });
    }
    const result = await CommerceProductService.listCommerceProducts(companyId, parsedQuery.data);
    return res.status(result.code).json(result);
}
async function getAdminCommerceProduct(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.getCommerceProduct(companyId, getRouteParam(req.params.id));
    return res.status(result.code).json(result);
}
async function createAdminCommerceProduct(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceProductService.createCommerceProduct(companyId, payload);
    return res.status(result.code).json(result);
}
async function updateAdminCommerceProduct(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceProductService.updateCommerceProduct(companyId, getRouteParam(req.params.id), payload);
    return res.status(result.code).json(result);
}
async function deleteAdminCommerceProduct(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.deleteCommerceProduct(companyId, getRouteParam(req.params.id));
    return res.status(result.code).json(result);
}
async function reorderAdminCommerceProducts(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceProductService.reorderCommerceProducts(companyId, payload.ids);
    return res.status(result.code).json(result);
}
async function uploadAdminCommerceProductImage(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.uploadCommerceProductImage(companyId, getRouteParam(req.params.id), req.file, {
        alt_text: typeof req.body?.alt_text === 'string' ? req.body.alt_text : undefined,
        sort_order: req.body?.sort_order,
        is_primary: req.body?.is_primary,
    });
    return res.status(result.code).json(result);
}
async function setAdminCommerceProductPrimaryImage(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.setCommerceProductPrimaryImage(companyId, getRouteParam(req.params.id), getRouteParam(req.params.imageId));
    return res.status(result.code).json(result);
}
async function reorderAdminCommerceProductImages(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceProductService.reorderCommerceProductImages(companyId, getRouteParam(req.params.id), payload.image_ids);
    return res.status(result.code).json(result);
}
async function updateAdminCommerceProductImage(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceProductService.updateCommerceProductImage(companyId, getRouteParam(req.params.id), getRouteParam(req.params.imageId), payload);
    return res.status(result.code).json(result);
}
async function deleteAdminCommerceProductImage(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.deleteCommerceProductImage(companyId, getRouteParam(req.params.id), getRouteParam(req.params.imageId));
    return res.status(result.code).json(result);
}
async function upsertAdminCommerceProductPromotion(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceProductService.upsertCommerceProductPromotion(companyId, getRouteParam(req.params.id), payload);
    return res.status(result.code).json(result);
}
async function removeAdminCommerceProductPromotion(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.removeCommerceProductPromotion(companyId, getRouteParam(req.params.id));
    return res.status(result.code).json(result);
}
