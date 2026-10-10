"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../middlewares/requireAuth");
const client_1 = require("@prisma/client");
const validate_1 = require("../middlewares/validate");
const company_controller_1 = require("../controllers/company.controller");
const company_schema_1 = require("../schemas/company.schema");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
// GET /api/admin/company/:id/content - Get all editable content
router.get('/:id/content', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), company_controller_1.getCompanyContent);
// PUT /api/admin/company/:id/content - Update company text content
router.put('/:id/content', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, validate_1.validate)(company_schema_1.updateCompanyContentSchema), company_controller_1.updateCompanyContent);
exports.default = router;
