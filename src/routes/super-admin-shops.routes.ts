import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth';
import * as SuperAdminShopsController from '../controllers/super-admin-shops.controller';

const router = Router();

// All routes require authentication and super admin role
router.use(requireAuth);
router.use(requireSuperAdmin);

// Shop management routes
router.get('/shops', SuperAdminShopsController.getAllShops);
router.get('/shops/:id', SuperAdminShopsController.getShopById);
router.post('/shops', SuperAdminShopsController.createShop);
router.put('/shops/:id', SuperAdminShopsController.updateShop);
router.delete('/shops/:id', SuperAdminShopsController.deleteShop);

// Shop user management routes
router.get('/shops/:id/users', SuperAdminShopsController.getShopUsers);
router.post('/shops/:id/users', SuperAdminShopsController.addUserToShop);
router.put('/shops/:shopId/users/:companyUserId', SuperAdminShopsController.updateUserRoleInShop);
router.delete('/shops/:shopId/users/:companyUserId', SuperAdminShopsController.removeUserFromShop);

// Company types route
router.get('/company-types', SuperAdminShopsController.getCompanyTypes);

// Impersonation route
router.post('/impersonate/:shopId', SuperAdminShopsController.impersonateShop);

export default router;
