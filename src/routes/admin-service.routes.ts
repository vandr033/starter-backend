import { Router } from 'express';
import * as AdminServiceController from '../controllers/admin-service.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import { requireCompanyCapability } from '../middlewares/requireCompanyCapability';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const allStaffRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];

// GET /api/admin/services - List all services for the admin's company
router.get(
    '/',
    requireAuth,
    requireCompanyRole(allStaffRoles),
    requireCompanyCapability('RESERVAS_BASE'),
    AdminServiceController.listServices,
);

// POST /api/admin/services - Create a new service
router.post(
    '/',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('RESERVAS_BASE'),
    AdminServiceController.createService,
);

// PUT /api/admin/services/:id - Update a service
router.put(
    '/:id',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('RESERVAS_BASE'),
    AdminServiceController.updateService,
);

// DELETE /api/admin/services/:id - Soft delete a service
router.delete(
    '/:id',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('RESERVAS_BASE'),
    AdminServiceController.deleteService,
);

export default router;
