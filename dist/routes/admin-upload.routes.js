"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../middlewares/requireAuth");
const client_1 = require("@prisma/client");
const admin_upload_controller_1 = require("../controllers/admin-upload.controller");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
// POST /api/admin/uploads/image - Upload an image
router.post('/image', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), admin_upload_controller_1.uploadMiddleware, admin_upload_controller_1.uploadImage);
// DELETE /api/admin/uploads/image - Delete an image
router.delete('/image', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), admin_upload_controller_1.deleteImage);
exports.default = router;
