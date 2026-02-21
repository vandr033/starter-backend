import { Router } from 'express';
import * as AdminHoursController from '../controllers/admin-hours.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// GET /api/admin/hours - Get all hours for the admin's company
router.get('/', requireAuth, requireCompanyRole(adminRoles), AdminHoursController.getHours);

// PUT /api/admin/hours - Batch update all hours for the admin's company
router.put('/', requireAuth, requireCompanyRole(adminRoles), AdminHoursController.updateHours);

export default router;
