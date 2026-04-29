import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth';
import {
    getSuperAdminPricing,
    updateSuperAdminDiscountPricing,
    updateSuperAdminProductPricing,
} from '../controllers/business-pricing.controller';

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get('/business-pricing', getSuperAdminPricing);
router.put('/business-pricing/products/:productKey', updateSuperAdminProductPricing);
router.put('/business-pricing/discounts', updateSuperAdminDiscountPricing);

export default router;
