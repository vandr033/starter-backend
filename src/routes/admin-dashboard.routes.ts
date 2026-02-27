import { Router } from 'express';
import * as AdminDashboardController from '../controllers/admin-dashboard.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

const router = Router();

const allStaffRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];

router.get('/metrics', requireAuth, requireCompanyRole(allStaffRoles), AdminDashboardController.getMetrics);

export default router;
