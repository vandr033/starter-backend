import { Router } from 'express';
import * as AdminStaffController from '../controllers/admin-staff.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// GET /api/admin/staff - List all staff profiles for the admin's company
router.get('/', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.listStaff);

// POST /api/admin/staff - Create a new staff profile
router.post('/', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.createStaff);

// PUT /api/admin/staff/:id - Update a staff profile
router.put('/:id', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.updateStaff);

// DELETE /api/admin/staff/:id - Soft delete a staff profile
router.delete('/:id', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.deleteStaff);

export default router;
