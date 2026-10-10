"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../middlewares/requireAuth");
const client_1 = require("@prisma/client");
const admin_staff_services_controller_1 = require("../controllers/admin-staff-services.controller");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
// GET /api/admin/staff/:id/services - Get services assigned to staff
router.get('/:id/services', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), admin_staff_services_controller_1.getStaffServices);
// PUT /api/admin/staff/:id/services - Update services assigned to staff
router.put('/:id/services', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), admin_staff_services_controller_1.updateStaffServices);
exports.default = router;
