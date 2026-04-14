import { Router } from 'express';
import * as AdminCategoriesController from '../controllers/admin-categories.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import { requireCompanyModule } from '../middlewares/requireCompanyModule';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// GET /api/admin/categories - Get all categories for the admin's company
router.get('/', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), AdminCategoriesController.getCategories);

// POST /api/admin/categories - Create a new category
router.post('/', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), AdminCategoriesController.createCategory);

// GET /api/admin/global-service-types - Get all global service types
router.get('/global-service-types', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), AdminCategoriesController.getGlobalServiceTypes);

// PUT /api/admin/categories/:id - Update a category
router.put('/:id', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), AdminCategoriesController.updateCategory);

// DELETE /api/admin/categories/:id - Delete a category
router.delete('/:id', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), AdminCategoriesController.deleteCategory);

export default router;
