"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../middlewares/requireAuth");
const client_1 = require("@prisma/client");
const admin_settings_controller_1 = require("../controllers/admin-settings.controller");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
// GET /api/admin/settings - Get company settings
router.get('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), admin_settings_controller_1.getCompanySettings);
// GET /api/admin/settings/subscription-history - Get current plan snapshot and subscription history
router.get('/subscription-history', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles, { allowRenewalOnly: true }), admin_settings_controller_1.getCompanySubscriptionHistory);
// PUT /api/admin/settings - Update company settings
router.put('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), admin_settings_controller_1.updateCompanySettings);
// DELETE /api/admin/settings - Reset company settings to defaults
router.delete('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), admin_settings_controller_1.resetCompanySettings);
exports.default = router;
