import { Router } from 'express';
import * as AdminStaffController from '../controllers/admin-staff.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const staffOnlyRoles = [CompanyUserRole.STAFF];

// GET /api/admin/staff/me - Get current staff profile
router.get('/me', requireAuth, requireCompanyRole(staffOnlyRoles), AdminStaffController.getMyProfile);

// PUT /api/admin/staff/me - Update current staff profile
router.put('/me', requireAuth, requireCompanyRole(staffOnlyRoles), AdminStaffController.updateMyProfile);

// GET /api/admin/staff - List all staff profiles for the admin's company
router.get('/', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.listStaff);

// GET /api/admin/staff/:id - Get a single staff profile
router.get('/:id', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.getStaff);

// POST /api/admin/staff - Create a new staff profile
router.post('/', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.createStaff);

// POST /api/admin/staff/:id/resend-invite - Resend invitation for pending staff
router.post('/:id/resend-invite', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.resendStaffInvite);

// PUT /api/admin/staff/:id - Update a staff profile
router.put('/:id', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.updateStaff);

// DELETE /api/admin/staff/:id - Soft delete a staff profile
router.delete('/:id', requireAuth, requireCompanyRole(adminRoles), AdminStaffController.deleteStaff);

export default router;
