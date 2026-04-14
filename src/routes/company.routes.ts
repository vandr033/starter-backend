import { Router } from 'express';

import { getAllCompanies, getCompanyPublicPage, getCompanyStatus, getFeaturedCompanies } from '../controllers/company.controller';

const router = Router();

router.get('/', getAllCompanies);
router.get('/featured', getFeaturedCompanies);
router.get('/:slug', getCompanyPublicPage);
router.get('/:slug/status', getCompanyStatus);

export default router;
