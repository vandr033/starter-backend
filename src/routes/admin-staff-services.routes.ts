import { Router } from 'express';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import { getStaffServices, updateStaffServices } from '../controllers/admin-staff-services.controller';
import { requireCompanyModule } from '../middlewares/requireCompanyModule';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// GET /api/admin/staff/:id/services - Get services assigned to staff
router.get(
    '/:id/services',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    getStaffServices
);

// PUT /api/admin/staff/:id/services - Update services assigned to staff
router.put(
    '/:id/services',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    updateStaffServices
);

export default router;
