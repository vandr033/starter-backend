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
const client_1 = require("@prisma/client");
const requireAuth_1 = require("../middlewares/requireAuth");
const requireRestaurantCompanyContext_1 = require("../middlewares/requireRestaurantCompanyContext");
const requirePlanFeature_1 = require("../middlewares/requirePlanFeature");
const requireRestaurantAccess_1 = require("../middlewares/requireRestaurantAccess");
const validate_1 = require("../middlewares/validate");
const Menu = __importStar(require("../controllers/admin-restaurant-menu.controller"));
const Images = __importStar(require("../controllers/admin-restaurant-menu-images.controller"));
const restaurant_menu_schema_1 = require("../schemas/restaurant-menu.schema");
const router = (0, express_1.Router)();
const roles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
router.use(requireAuth_1.requireAuth, (0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(roles), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess);
router.get('/menu/categories', Menu.listCategories);
router.post('/menu/categories', (0, validate_1.validate)(restaurant_menu_schema_1.createRestaurantMenuCategorySchema), Menu.createCategory);
router.patch('/menu/categories/reorder', (0, validate_1.validate)(restaurant_menu_schema_1.restaurantMenuReorderSchema), Menu.reorderCategories);
router.get('/menu/categories/:id', Menu.getCategory);
router.patch('/menu/categories/:id', (0, validate_1.validate)(restaurant_menu_schema_1.updateRestaurantMenuCategorySchema), Menu.updateCategory);
router.delete('/menu/categories/:id', Menu.deleteCategory);
router.post('/menu/categories/:id/image', Images.restaurantMenuUpload, Images.uploadCategoryImage);
router.delete('/menu/categories/:id/image', Images.deleteCategoryImage);
router.get('/menu/items', Menu.listItems);
router.post('/menu/items', (0, validate_1.validate)(restaurant_menu_schema_1.createRestaurantMenuItemSchema), Menu.createItem);
router.patch('/menu/items/reorder', (0, validate_1.validate)(restaurant_menu_schema_1.restaurantMenuReorderSchema), Menu.reorderItems);
router.get('/menu/items/:id', Menu.getItem);
router.patch('/menu/items/:id', (0, validate_1.validate)(restaurant_menu_schema_1.updateRestaurantMenuItemSchema), Menu.updateItem);
router.delete('/menu/items/:id', Menu.deleteItem);
router.post('/menu/items/:id/image', Images.restaurantMenuUpload, Images.uploadItemImage);
router.delete('/menu/items/:id/image', Images.deleteItemImage);
exports.default = router;
