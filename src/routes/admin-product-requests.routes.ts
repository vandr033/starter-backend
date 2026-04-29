import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { validate } from '../middlewares/validate';
import {
    createProductAccessRequest,
    getProductAccessRequests,
} from '../controllers/admin-product-requests.controller';
import { createProductAccessRequestSchema } from '../schemas/product-access-requests.schema';

const router = Router();
const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

router.get('/', requireAuth, requireCompanyRole(adminRoles), getProductAccessRequests);
router.post(
    '/',
    requireAuth,
    requireCompanyRole(adminRoles),
    validate(createProductAccessRequestSchema),
    createProductAccessRequest,
);

export default router;
