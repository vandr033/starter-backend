import { Router } from 'express';
import { optionalAuth } from '../middlewares/optionalAuth';
import { requireAuth } from '../middlewares/requireAuth';
import {
    createPublicOrder,
    getPublicProduct,
    getPublicStoreAvailability,
    getPublicStorefront,
    listMyCommerceOrders,
} from '../controllers/commerce.controller';

const router = Router();

router.get('/my/orders', requireAuth, listMyCommerceOrders);
router.get('/:slug', getPublicStorefront);
router.get('/:slug/availability', getPublicStoreAvailability);
router.get('/:slug/products/:productId', getPublicProduct);
router.post('/:slug/orders', optionalAuth, createPublicOrder);

export default router;
