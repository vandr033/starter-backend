import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth';
import { validate } from '../middlewares/validate';
import * as SuperAdminShopsController from '../controllers/super-admin-shops.controller';
import * as SuperAdminDashboardController from '../controllers/super-admin-dashboard.controller';
import * as SuperAdminDataController from '../controllers/super-admin-data.controller';
import * as SuperAdminCompanyTypesController from '../controllers/super-admin-company-types.controller';
import {
  createSuperAdminShopSchema,
  updateSuperAdminShopSchema,
} from '../schemas/super-admin-shops.schema';

const router = Router();

// All routes require authentication and super admin role
router.use(requireAuth);
router.use(requireSuperAdmin);

// Dashboard metrics
router.get('/dashboard/metrics', SuperAdminDashboardController.getDashboardMetrics);

// Bookings (cross-shop)
router.get('/bookings', SuperAdminDataController.getAllBookings);
router.get('/bookings/today-count', SuperAdminDataController.getTodayBookingsCount);

// Customers (cross-shop)
router.get('/customers', SuperAdminDataController.getAllCustomers);

// Staff (cross-shop)
router.get('/staff', SuperAdminDataController.getAllStaff);

// Users search (owner assignment)
router.get('/users/search', SuperAdminShopsController.searchUsersForOwner);

// Shop management routes
router.get('/shops', SuperAdminShopsController.getAllShops);
router.get('/shops/:id', SuperAdminShopsController.getShopById);
router.get('/shops/:id/subscription-history', SuperAdminShopsController.getShopSubscriptionHistory);
router.post('/shops', validate(createSuperAdminShopSchema), SuperAdminShopsController.createShop);
router.put('/shops/:id', validate(updateSuperAdminShopSchema), SuperAdminShopsController.updateShop);
router.delete('/shops/:id', SuperAdminShopsController.deleteShop);

// Shop user management routes
router.get('/shops/:id/users', SuperAdminShopsController.getShopUsers);
router.post('/shops/:id/users', SuperAdminShopsController.addUserToShop);
router.put('/shops/:shopId/users/:companyUserId', SuperAdminShopsController.updateUserRoleInShop);
router.post('/shops/:shopId/users/:companyUserId/resend-invite', SuperAdminShopsController.resendPendingUserInvite);
router.delete('/shops/:shopId/users/:companyUserId', SuperAdminShopsController.removeUserFromShop);

// Company types CRUD
router.get('/company-types', SuperAdminCompanyTypesController.getCompanyTypes);
router.post('/company-types', SuperAdminCompanyTypesController.createCompanyType);
router.put('/company-types/:id', SuperAdminCompanyTypesController.updateCompanyType);
router.delete('/company-types/:id', SuperAdminCompanyTypesController.deleteCompanyType);

// Impersonation route
router.post('/impersonate/:shopId', SuperAdminShopsController.impersonateShop);

export default router;
