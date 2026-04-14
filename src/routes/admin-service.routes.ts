import { Router } from 'express';
import * as AdminServiceController from '../controllers/admin-service.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import { requireCompanyModule } from '../middlewares/requireCompanyModule';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// GET /api/admin/services - List all services for the admin's company
router.get('/', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), AdminServiceController.listServices);

// POST /api/admin/services - Create a new service
router.post('/', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), AdminServiceController.createService);

// PUT /api/admin/services/:id - Update a service
router.put('/:id', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), AdminServiceController.updateService);

// DELETE /api/admin/services/:id - Soft delete a service
router.delete('/:id', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), AdminServiceController.deleteService);

export default router;
