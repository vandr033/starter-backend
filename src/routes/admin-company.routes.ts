import { Router } from 'express';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import { validate } from '../middlewares/validate';
import { updateCompanyContent, getCompanyContent } from '../controllers/company.controller';
import { updateCompanyContentSchema } from '../schemas/company.schema';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// GET /api/admin/company/:id/content - Get all editable content
router.get(
  '/:id/content',
  requireAuth,
  requireCompanyRole(adminRoles),
  getCompanyContent
);

// PUT /api/admin/company/:id/content - Update company text content
router.put(
  '/:id/content',
  requireAuth,
  requireCompanyRole(adminRoles),
  validate(updateCompanyContentSchema),
  updateCompanyContent
);

export default router;
