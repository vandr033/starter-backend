import { Router } from 'express';
import { validate } from '../middlewares/validate';
import * as PublicCommerceController from '../controllers/public-commerce.controller';
import {
    createPublicCommerceOrderSchema,
    resendPublicCommerceGuestCheckoutSchema,
    startPublicCommerceGuestCheckoutSchema,
    submitCommercePaymentProofSchema,
    verifyPublicCommerceGuestCheckoutSchema,
} from '../schemas/commerce.schema';
import { requireAuth } from '../middlewares/requireAuth';
import { optionalAuth } from '../middlewares/optionalAuth';
import { uploadMiddleware } from '../controllers/public-upload.controller';

const router = Router();

router.get('/:slug/store', PublicCommerceController.getPublicCommerceStore);
router.get('/:slug/categories', PublicCommerceController.listPublicCommerceCategories);
router.get('/:slug/products', PublicCommerceController.listPublicCommerceProducts);
router.get('/:slug/products/:productSlug', PublicCommerceController.getPublicCommerceProduct);
router.post(
    '/:slug/checkout/guest/start',
    validate(startPublicCommerceGuestCheckoutSchema),
    PublicCommerceController.startPublicCommerceGuestCheckout,
);
router.post(
    '/:slug/checkout/guest/resend',
    validate(resendPublicCommerceGuestCheckoutSchema),
    PublicCommerceController.resendPublicCommerceGuestCheckout,
);
router.post(
    '/:slug/checkout/guest/verify',
    validate(verifyPublicCommerceGuestCheckoutSchema),
    PublicCommerceController.verifyPublicCommerceGuestCheckout,
);
router.post(
    '/:slug/orders',
    requireAuth,
    validate(createPublicCommerceOrderSchema),
    PublicCommerceController.createPublicCommerceOrder,
);
router.get('/:slug/orders/:orderNumber', optionalAuth, PublicCommerceController.getPublicCommerceOrder);
router.post(
    '/:slug/checkout/payment-proof-upload',
    requireAuth,
    uploadMiddleware,
    PublicCommerceController.uploadCheckoutPaymentProof,
);
router.post(
    '/:slug/orders/:orderNumber/payment-proof/upload',
    optionalAuth,
    uploadMiddleware,
    PublicCommerceController.uploadPublicCommercePaymentProof,
);
router.post(
    '/:slug/orders/:orderNumber/payment-proof',
    optionalAuth,
    validate(submitCommercePaymentProofSchema),
    PublicCommerceController.submitPublicCommercePaymentProof,
);
router.delete(
    '/:slug/orders/:orderNumber/payment-proof',
    optionalAuth,
    PublicCommerceController.deletePublicCommercePaymentProof,
);
router.get(
    '/:slug/orders/:orderNumber/payment-proof/file',
    optionalAuth,
    PublicCommerceController.servePublicCommercePaymentProof,
);
router.get(
    '/:slug/me/orders',
    requireAuth,
    PublicCommerceController.listMyCommerceOrders,
);
router.get(
    '/:slug/me/orders/:orderNumber',
    requireAuth,
    PublicCommerceController.getMyCommerceOrder,
);
router.get(
    '/:slug/me/orders/:orderNumber/payment-proof/file',
    requireAuth,
    PublicCommerceController.serveMyCommercePaymentProof,
);

export default router;
