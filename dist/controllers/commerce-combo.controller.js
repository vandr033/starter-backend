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
exports.listAdminCommerceCombos = listAdminCommerceCombos;
exports.getAdminCommerceCombo = getAdminCommerceCombo;
exports.createAdminCommerceCombo = createAdminCommerceCombo;
exports.updateAdminCommerceCombo = updateAdminCommerceCombo;
exports.deleteAdminCommerceCombo = deleteAdminCommerceCombo;
exports.uploadAdminCommerceComboImage = uploadAdminCommerceComboImage;
exports.setAdminCommerceComboPrimaryImage = setAdminCommerceComboPrimaryImage;
exports.reorderAdminCommerceComboImages = reorderAdminCommerceComboImages;
exports.updateAdminCommerceComboImage = updateAdminCommerceComboImage;
exports.deleteAdminCommerceComboImage = deleteAdminCommerceComboImage;
exports.upsertAdminCommerceComboPromotion = upsertAdminCommerceComboPromotion;
exports.removeAdminCommerceComboPromotion = removeAdminCommerceComboPromotion;
const commerce_schema_1 = require("../schemas/commerce.schema");
const CommerceComboService = __importStar(require("../services/commerce-combo-admin.service"));
const CommerceProductService = __importStar(require("../services/commerce-product.service"));
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
async function listAdminCommerceCombos(req, res) {
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
    const result = await CommerceComboService.listCommerceCombos(companyId, parsedQuery.data);
    return res.status(result.code).json(result);
}
async function getAdminCommerceCombo(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceComboService.getCommerceCombo(companyId, getRouteParam(req.params.id));
    return res.status(result.code).json(result);
}
async function createAdminCommerceCombo(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceComboService.createCommerceCombo(companyId, payload);
    return res.status(result.code).json(result);
}
async function updateAdminCommerceCombo(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceComboService.updateCommerceCombo(companyId, getRouteParam(req.params.id), payload);
    return res.status(result.code).json(result);
}
async function deleteAdminCommerceCombo(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceComboService.deleteCommerceCombo(companyId, getRouteParam(req.params.id));
    return res.status(result.code).json(result);
}
async function uploadAdminCommerceComboImage(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.uploadCommerceProductImage(companyId, getRouteParam(req.params.id), req.file, {
        alt_text: typeof req.body?.alt_text === 'string' ? req.body.alt_text : undefined,
        sort_order: req.body?.sort_order,
        is_primary: req.body?.is_primary,
    }, 'COMBO');
    return res.status(result.code).json(result);
}
async function setAdminCommerceComboPrimaryImage(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.setCommerceProductPrimaryImage(companyId, getRouteParam(req.params.id), getRouteParam(req.params.imageId), 'COMBO');
    return res.status(result.code).json(result);
}
async function reorderAdminCommerceComboImages(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceProductService.reorderCommerceProductImages(companyId, getRouteParam(req.params.id), payload.image_ids, 'COMBO');
    return res.status(result.code).json(result);
}
async function updateAdminCommerceComboImage(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceProductService.updateCommerceProductImage(companyId, getRouteParam(req.params.id), getRouteParam(req.params.imageId), payload, 'COMBO');
    return res.status(result.code).json(result);
}
async function deleteAdminCommerceComboImage(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.deleteCommerceProductImage(companyId, getRouteParam(req.params.id), getRouteParam(req.params.imageId), 'COMBO');
    return res.status(result.code).json(result);
}
async function upsertAdminCommerceComboPromotion(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const payload = req.validated ?? req.body;
    const result = await CommerceProductService.upsertCommerceProductPromotion(companyId, getRouteParam(req.params.id), payload, 'COMBO');
    return res.status(result.code).json(result);
}
async function removeAdminCommerceComboPromotion(req, res) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }
    const result = await CommerceProductService.removeCommerceProductPromotion(companyId, getRouteParam(req.params.id), 'COMBO');
    return res.status(result.code).json(result);
}
