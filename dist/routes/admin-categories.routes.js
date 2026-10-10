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
const AdminCategoriesController = __importStar(require("../controllers/admin-categories.controller"));
const requireAuth_1 = require("../middlewares/requireAuth");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
// GET /api/admin/categories - Get all categories for the admin's company
router.get('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), AdminCategoriesController.getCategories);
// POST /api/admin/categories - Create a new category
router.post('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), AdminCategoriesController.createCategory);
// GET /api/admin/global-service-types - Get all global service types
router.get('/global-service-types', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), AdminCategoriesController.getGlobalServiceTypes);
// PUT /api/admin/categories/:id - Update a category
router.put('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), AdminCategoriesController.updateCategory);
// DELETE /api/admin/categories/:id - Delete a category
router.delete('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), AdminCategoriesController.deleteCategory);
exports.default = router;
