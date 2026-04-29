import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth';
import {
    getSuperAdminFeatures,
    getSuperAdminPricing,
    updateSuperAdminDiscountPricing,
    updateSuperAdminProductPricing,
    updateSuperAdminPricingSettings,
} from '../controllers/business-pricing.controller';

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get('/business-pricing', getSuperAdminPricing);
router.get('/product-features', getSuperAdminFeatures);
router.put('/business-pricing/products/:productKey', updateSuperAdminProductPricing);
router.put('/business-pricing/discounts', updateSuperAdminDiscountPricing);
router.put('/business-pricing/settings', updateSuperAdminPricingSettings);

export default router;
