import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';

import { getAllCompanies, getCompanyPublicPage, getCompanyStatus, getCompanyById, updateCompany, getFeaturedCompanies } from '../controllers/company.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { validate } from '../middlewares/validate';
import { updateCompanySchema } from '../schemas/company.schema';

const router = Router();
const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

router.get('/', getAllCompanies);
router.get('/featured', getFeaturedCompanies);
router.get('/id/:id', getCompanyById);
router.put('/id/:id', requireAuth, requireCompanyRole(adminRoles), validate(updateCompanySchema), updateCompany);
router.get('/:slug', getCompanyPublicPage);
router.get('/:slug/status', getCompanyStatus);

export default router;
