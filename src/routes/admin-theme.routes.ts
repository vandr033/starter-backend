import { Router } from 'express';
import * as AdminThemeController from '../controllers/admin-theme.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// GET /api/admin/theme - Get theme config for the admin's company
router.get('/', requireAuth, requireCompanyRole(adminRoles), AdminThemeController.getTheme);

// PUT /api/admin/theme - Update theme config for the admin's company
router.put('/', requireAuth, requireCompanyRole(adminRoles), AdminThemeController.updateTheme);

export default router;
