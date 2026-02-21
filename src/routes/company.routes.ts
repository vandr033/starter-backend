import { Router } from 'express';

import { getAllCompanies, getCompanyPublicPage, getCompanyStatus, getCompanyById, updateCompany, getFeaturedCompanies } from '../controllers/company.controller';

const router = Router();

router.get('/', getAllCompanies);
router.get('/featured', getFeaturedCompanies);
router.get('/id/:id', getCompanyById);
router.put('/id/:id', updateCompany);
router.get('/:slug', getCompanyPublicPage);
router.get('/:slug/status', getCompanyStatus);

export default router;
