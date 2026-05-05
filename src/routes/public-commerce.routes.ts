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
router.get('/:slug/orders/:orderNumber', PublicCommerceController.getPublicCommerceOrder);
router.post(
    '/:slug/orders/:orderNumber/payment-proof',
    validate(submitCommercePaymentProofSchema),
    PublicCommerceController.submitPublicCommercePaymentProof,
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

export default router;
