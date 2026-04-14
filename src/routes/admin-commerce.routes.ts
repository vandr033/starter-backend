import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { requireCompanyModule } from '../middlewares/requireCompanyModule';
import {
    assignAdminCommerceOrder,
    createAdminCommerceCategory,
    createAdminCommercePointOfSale,
    createAdminCommerceProduct,
    deleteAdminCommerceCategory,
    deleteAdminCommercePointOfSale,
    deleteAdminCommerceProduct,
    getAdminCommerceBootstrap,
    getAdminCommerceDeliveryRules,
    getAdminCommerceOrderDetail,
    listAdminCommerceCategories,
    listAdminCommerceOrders,
    listAdminCommercePointsOfSale,
    listAdminCommerceProducts,
    listStaffCommerceOrders,
    moveAdminCommerceCategory,
    getStaffCommerceOrderDetail,
    updateAdminCommerceCategory,
    updateAdminCommerceDeliveryRules,
    updateAdminCommerceOrderStatus,
    updateAdminCommercePointOfSale,
    updateAdminCommercePaymentStatus,
    updateAdminCommerceProduct,
    updateAdminCommerceSettings,
    updateAdminCommerceTrackingLink,
    updateStaffCommerceOrderStatus,
} from '../controllers/commerce.controller';

const router = Router();
const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const staffRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];
const commerceFeature = 'STORE_MODULE' as const;
const requireStoreModule = requireCompanyModule('STORE');

router.use(requireAuth);

router.get('/bootstrap', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), getAdminCommerceBootstrap);
router.put('/settings', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), updateAdminCommerceSettings);

router.get('/categories', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), listAdminCommerceCategories);
router.post('/categories', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), createAdminCommerceCategory);
router.put('/categories/:categoryId', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), updateAdminCommerceCategory);
router.post('/categories/:categoryId/move', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), moveAdminCommerceCategory);
router.delete('/categories/:categoryId', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), deleteAdminCommerceCategory);

router.get('/products', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), listAdminCommerceProducts);
router.post('/products', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), createAdminCommerceProduct);
router.put('/products/:productId', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), updateAdminCommerceProduct);
router.delete('/products/:productId', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), deleteAdminCommerceProduct);

router.get('/points-of-sale', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), listAdminCommercePointsOfSale);
router.post('/points-of-sale', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), createAdminCommercePointOfSale);
router.put('/points-of-sale/:pointId', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), updateAdminCommercePointOfSale);
router.delete('/points-of-sale/:pointId', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), deleteAdminCommercePointOfSale);

router.get('/delivery-rules', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), getAdminCommerceDeliveryRules);
router.put('/delivery-rules', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), updateAdminCommerceDeliveryRules);

router.get('/orders', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), listAdminCommerceOrders);
router.get('/orders/:orderId', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), getAdminCommerceOrderDetail);
router.post('/orders/:orderId/assign', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), assignAdminCommerceOrder);
router.post('/orders/:orderId/status', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), updateAdminCommerceOrderStatus);
router.post('/orders/:orderId/payment-status', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), updateAdminCommercePaymentStatus);
router.post('/orders/:orderId/tracking', requireCompanyRole(adminRoles), requireStoreModule, requirePlanFeature(commerceFeature), updateAdminCommerceTrackingLink);

router.get('/staff/orders', requireCompanyRole(staffRoles), requireStoreModule, requirePlanFeature(commerceFeature), listStaffCommerceOrders);
router.get('/staff/orders/:orderId', requireCompanyRole(staffRoles), requireStoreModule, requirePlanFeature(commerceFeature), getStaffCommerceOrderDetail);
router.post('/staff/orders/:orderId/status', requireCompanyRole(staffRoles), requireStoreModule, requirePlanFeature(commerceFeature), updateStaffCommerceOrderStatus);

export default router;
