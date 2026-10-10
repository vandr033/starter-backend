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
const validate_1 = require("../middlewares/validate");
const PublicCommerceController = __importStar(require("../controllers/public-commerce.controller"));
const commerce_schema_1 = require("../schemas/commerce.schema");
const requireAuth_1 = require("../middlewares/requireAuth");
const optionalAuth_1 = require("../middlewares/optionalAuth");
const public_upload_controller_1 = require("../controllers/public-upload.controller");
const demo_session_middleware_1 = require("../middlewares/demo-session.middleware");
const router = (0, express_1.Router)();
router.use('/:slug', demo_session_middleware_1.demoCompanySlugWriteGuard);
router.get('/:slug/store', PublicCommerceController.getPublicCommerceStore);
router.get('/:slug/categories', PublicCommerceController.listPublicCommerceCategories);
router.get('/:slug/products', PublicCommerceController.listPublicCommerceProducts);
router.get('/:slug/products/:productSlug', PublicCommerceController.getPublicCommerceProduct);
router.post('/:slug/checkout/guest/start', (0, validate_1.validate)(commerce_schema_1.startPublicCommerceGuestCheckoutSchema), PublicCommerceController.startPublicCommerceGuestCheckout);
router.post('/:slug/checkout/guest/resend', (0, validate_1.validate)(commerce_schema_1.resendPublicCommerceGuestCheckoutSchema), PublicCommerceController.resendPublicCommerceGuestCheckout);
router.post('/:slug/checkout/guest/verify', (0, validate_1.validate)(commerce_schema_1.verifyPublicCommerceGuestCheckoutSchema), PublicCommerceController.verifyPublicCommerceGuestCheckout);
router.post('/:slug/orders', requireAuth_1.requireAuth, (0, validate_1.validate)(commerce_schema_1.createPublicCommerceOrderSchema), PublicCommerceController.createPublicCommerceOrder);
router.get('/:slug/orders/:orderNumber', optionalAuth_1.optionalAuth, PublicCommerceController.getPublicCommerceOrder);
router.post('/:slug/checkout/payment-proof-upload', requireAuth_1.requireAuth, public_upload_controller_1.uploadMiddleware, PublicCommerceController.uploadCheckoutPaymentProof);
router.post('/:slug/orders/:orderNumber/payment-proof/upload', optionalAuth_1.optionalAuth, public_upload_controller_1.uploadMiddleware, PublicCommerceController.uploadPublicCommercePaymentProof);
router.post('/:slug/orders/:orderNumber/payment-proof', optionalAuth_1.optionalAuth, (0, validate_1.validate)(commerce_schema_1.submitCommercePaymentProofSchema), PublicCommerceController.submitPublicCommercePaymentProof);
router.delete('/:slug/orders/:orderNumber/payment-proof', optionalAuth_1.optionalAuth, PublicCommerceController.deletePublicCommercePaymentProof);
router.get('/:slug/orders/:orderNumber/payment-proof/file', optionalAuth_1.optionalAuth, PublicCommerceController.servePublicCommercePaymentProof);
router.get('/:slug/me/orders', requireAuth_1.requireAuth, PublicCommerceController.listMyCommerceOrders);
router.get('/:slug/me/orders/:orderNumber', requireAuth_1.requireAuth, PublicCommerceController.getMyCommerceOrder);
router.get('/:slug/me/orders/:orderNumber/payment-proof/file', requireAuth_1.requireAuth, PublicCommerceController.serveMyCommercePaymentProof);
exports.default = router;
