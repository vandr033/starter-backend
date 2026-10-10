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
const express_1 = require("express");
const client_1 = require("@prisma/client");
const requireAuth_1 = require("../middlewares/requireAuth");
const requireCompanyCapability_1 = require("../middlewares/requireCompanyCapability");
const validate_1 = require("../middlewares/validate");
const CommerceStoreController = __importStar(require("../controllers/commerce-store.controller"));
const CommercePointOfSaleController = __importStar(require("../controllers/commerce-point-of-sale.controller"));
const CommerceCategoryController = __importStar(require("../controllers/commerce-category.controller"));
const CommerceProductController = __importStar(require("../controllers/commerce-product.controller"));
const CommerceComboController = __importStar(require("../controllers/commerce-combo.controller"));
const CommerceOrderController = __importStar(require("../controllers/commerce-order.controller"));
const admin_upload_controller_1 = require("../controllers/admin-upload.controller");
const commerce_schema_1 = require("../schemas/commerce.schema");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
const allStaffRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN, client_1.CompanyUserRole.STAFF];
router.get('/store', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ACCESS'), CommerceStoreController.getAdminCommerceStore);
router.put('/store', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ACCESS'), (0, validate_1.validate)(commerce_schema_1.upsertCommerceStoreSchema), CommerceStoreController.upsertAdminCommerceStore);
router.get('/points-of-sale', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ACCESS'), CommercePointOfSaleController.listAdminCommercePointsOfSale);
router.post('/points-of-sale', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ACCESS'), (0, validate_1.validate)(commerce_schema_1.createCommercePointOfSaleSchema), CommercePointOfSaleController.createAdminCommercePointOfSale);
router.put('/points-of-sale/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ACCESS'), (0, validate_1.validate)(commerce_schema_1.updateCommercePointOfSaleSchema), CommercePointOfSaleController.updateAdminCommercePointOfSale);
router.delete('/points-of-sale/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ACCESS'), CommercePointOfSaleController.deleteAdminCommercePointOfSale);
router.get('/categories', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_CATEGORIES'), CommerceCategoryController.listAdminCommerceCategories);
router.post('/categories', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_CATEGORIES'), (0, validate_1.validate)(commerce_schema_1.createCommerceCategorySchema), CommerceCategoryController.createAdminCommerceCategory);
router.put('/categories/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_CATEGORIES'), (0, validate_1.validate)(commerce_schema_1.updateCommerceCategorySchema), CommerceCategoryController.updateAdminCommerceCategory);
router.delete('/categories/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_CATEGORIES'), CommerceCategoryController.deleteAdminCommerceCategory);
router.post('/categories/reorder', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_CATEGORIES'), (0, validate_1.validate)(commerce_schema_1.reorderCommerceEntitiesSchema), CommerceCategoryController.reorderAdminCommerceCategories);
router.get('/products', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), CommerceProductController.listAdminCommerceProducts);
router.post('/products', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), (0, validate_1.validate)(commerce_schema_1.createCommerceProductSchema), CommerceProductController.createAdminCommerceProduct);
router.get('/products/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), CommerceProductController.getAdminCommerceProduct);
router.put('/products/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), (0, validate_1.validate)(commerce_schema_1.updateCommerceProductSchema), CommerceProductController.updateAdminCommerceProduct);
router.delete('/products/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), CommerceProductController.deleteAdminCommerceProduct);
router.post('/products/reorder', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), (0, validate_1.validate)(commerce_schema_1.reorderCommerceEntitiesSchema), CommerceProductController.reorderAdminCommerceProducts);
router.post('/products/:id/images', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), admin_upload_controller_1.uploadMiddleware, CommerceProductController.uploadAdminCommerceProductImage);
router.put('/products/:id/images/:imageId/primary', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), CommerceProductController.setAdminCommerceProductPrimaryImage);
router.put('/products/:id/images/reorder', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), (0, validate_1.validate)(commerce_schema_1.reorderCommerceProductImagesSchema), CommerceProductController.reorderAdminCommerceProductImages);
router.put('/products/:id/images/:imageId', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), (0, validate_1.validate)(commerce_schema_1.updateCommerceProductImageSchema), CommerceProductController.updateAdminCommerceProductImage);
router.delete('/products/:id/images/:imageId', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PRODUCTS'), CommerceProductController.deleteAdminCommerceProductImage);
router.put('/products/:id/promotion', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PROMOTIONS'), (0, validate_1.validate)(commerce_schema_1.upsertCommercePromotionSchema), CommerceProductController.upsertAdminCommerceProductPromotion);
router.delete('/products/:id/promotion', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PROMOTIONS'), CommerceProductController.removeAdminCommerceProductPromotion);
router.get('/combos', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), CommerceComboController.listAdminCommerceCombos);
router.post('/combos', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), (0, validate_1.validate)(commerce_schema_1.createCommerceComboSchema), CommerceComboController.createAdminCommerceCombo);
router.get('/combos/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), CommerceComboController.getAdminCommerceCombo);
router.put('/combos/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), (0, validate_1.validate)(commerce_schema_1.updateCommerceComboSchema), CommerceComboController.updateAdminCommerceCombo);
router.delete('/combos/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), CommerceComboController.deleteAdminCommerceCombo);
router.post('/combos/:id/images', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), admin_upload_controller_1.uploadMiddleware, CommerceComboController.uploadAdminCommerceComboImage);
router.put('/combos/:id/images/:imageId/primary', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), CommerceComboController.setAdminCommerceComboPrimaryImage);
router.put('/combos/:id/images/reorder', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), (0, validate_1.validate)(commerce_schema_1.reorderCommerceProductImagesSchema), CommerceComboController.reorderAdminCommerceComboImages);
router.put('/combos/:id/images/:imageId', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), (0, validate_1.validate)(commerce_schema_1.updateCommerceProductImageSchema), CommerceComboController.updateAdminCommerceComboImage);
router.delete('/combos/:id/images/:imageId', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_COMBOS'), CommerceComboController.deleteAdminCommerceComboImage);
router.put('/combos/:id/promotion', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PROMOTIONS'), (0, validate_1.validate)(commerce_schema_1.upsertCommercePromotionSchema), CommerceComboController.upsertAdminCommerceComboPromotion);
router.delete('/combos/:id/promotion', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_PROMOTIONS'), CommerceComboController.removeAdminCommerceComboPromotion);
router.get('/orders', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ORDERS'), CommerceOrderController.listAdminCommerceOrders);
router.get('/orders/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ORDERS'), CommerceOrderController.getAdminCommerceOrder);
router.get('/orders/:id/payment-proof', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ORDERS'), CommerceOrderController.serveAdminCommercePaymentProof);
router.put('/orders/:id/status', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ORDERS'), (0, validate_1.validate)(commerce_schema_1.updateCommerceOrderStatusSchema), CommerceOrderController.updateAdminCommerceOrderStatus);
router.put('/orders/:id/delivery-cost', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_DELIVERY'), (0, validate_1.validate)(commerce_schema_1.updateCommerceOrderDeliveryCostSchema), CommerceOrderController.updateAdminCommerceOrderDeliveryCost);
router.put('/orders/:id/assign', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_STAFF_ASSIGNMENT'), (0, validate_1.validate)(commerce_schema_1.updateCommerceOrderAssignSchema), CommerceOrderController.updateAdminCommerceOrderAssignment);
router.put('/orders/:id/notes', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_ORDERS'), (0, validate_1.validate)(commerce_schema_1.updateCommerceOrderNotesSchema), CommerceOrderController.updateAdminCommerceOrderNotes);
router.get('/staff', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_STAFF_ASSIGNMENT'), CommerceOrderController.getAdminCommerceAssignableStaff);
router.get('/metrics', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('COMMERCE_METRICS'), CommerceOrderController.getAdminCommerceMetrics);
exports.default = router;
