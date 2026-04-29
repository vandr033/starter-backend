import { Router } from 'express';
import { getPublicPricing } from '../controllers/business-pricing.controller';

const router = Router();

router.get('/', getPublicPricing);

export default router;
