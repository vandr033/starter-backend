"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../middlewares/requireAuth");
const validate_1 = require("../middlewares/validate");
const SuperAdminShopsController = __importStar(require("../controllers/super-admin-shops.controller"));
const SuperAdminDashboardController = __importStar(require("../controllers/super-admin-dashboard.controller"));
const SuperAdminDataController = __importStar(require("../controllers/super-admin-data.controller"));
const SuperAdminCompanyTypesController = __importStar(require("../controllers/super-admin-company-types.controller"));
const SuperAdminNotificationsController = __importStar(require("../controllers/super-admin-notifications.controller"));
const super_admin_shops_schema_1 = require("../schemas/super-admin-shops.schema");
const router = (0, express_1.Router)();
// All routes require authentication and super admin role
router.use(requireAuth_1.requireAuth);
router.use(requireAuth_1.requireSuperAdmin);
// Dashboard metrics
router.get('/dashboard/metrics', SuperAdminDashboardController.getDashboardMetrics);
// Bookings (cross-shop)
router.get('/bookings', SuperAdminDataController.getAllBookings);
router.get('/bookings/today-count', SuperAdminDataController.getTodayBookingsCount);
// Customers (cross-shop)
router.get('/customers', SuperAdminDataController.getAllCustomers);
// Staff (cross-shop)
router.get('/staff', SuperAdminDataController.getAllStaff);
// Users (platform-wide)
router.get('/users', SuperAdminDataController.getAllUsers);
router.delete('/users/:userId', SuperAdminDataController.deleteUser);
// Super admin test notifications
router.post('/notifications/test/email', SuperAdminNotificationsController.sendTestEmailNotification);
router.post('/notifications/test/whatsapp', SuperAdminNotificationsController.sendTestWhatsappNotification);
// Users search (owner assignment)
router.get('/users/search', SuperAdminShopsController.searchUsersForOwner);
// Shop management routes
router.get('/shops', SuperAdminShopsController.getAllShops);
router.get('/shops/:id', SuperAdminShopsController.getShopById);
router.get('/shops/:id/subscription-history', SuperAdminShopsController.getShopSubscriptionHistory);
router.post('/shops', (0, validate_1.validate)(super_admin_shops_schema_1.createSuperAdminShopSchema), SuperAdminShopsController.createShop);
router.put('/shops/:id', (0, validate_1.validate)(super_admin_shops_schema_1.updateSuperAdminShopSchema), SuperAdminShopsController.updateShop);
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
exports.default = router;
