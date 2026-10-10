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
const Controller = __importStar(require("../controllers/admin-restaurant.controller"));
const restaurant_schema_1 = require("../schemas/restaurant.schema");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
router.use(requireAuth_1.requireAuth, (0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'));
router.get('/access', Controller.getAccess);
router.patch('/access', (0, validate_1.validate)(restaurant_schema_1.restaurantAccessSchema), Controller.updateAccess);
router.use(requireRestaurantAccess_1.requireRestaurantAccess);
router.get('/settings', Controller.getSettings);
router.patch('/settings', (0, validate_1.validate)(restaurant_schema_1.updateRestaurantSettingsSchema), Controller.updateSettings);
router.get('/dining-areas', Controller.listAreas);
router.post('/dining-areas', (0, validate_1.validate)(restaurant_schema_1.createRestaurantDiningAreaSchema), Controller.createArea);
router.patch('/dining-areas/:id', (0, validate_1.validate)(restaurant_schema_1.updateRestaurantDiningAreaSchema), Controller.updateArea);
router.delete('/dining-areas/:id', Controller.deleteArea);
router.get('/tables', Controller.listTables);
router.post('/tables', (0, validate_1.validate)(restaurant_schema_1.createRestaurantTableSchema), Controller.createTable);
router.patch('/tables/:id', (0, validate_1.validate)(restaurant_schema_1.updateRestaurantTableSchema), Controller.updateTable);
router.delete('/tables/:id', Controller.deleteTable);
router.get('/service-periods', Controller.listPeriods);
router.post('/service-periods', (0, validate_1.validate)(restaurant_schema_1.createRestaurantServicePeriodSchema), Controller.createPeriod);
router.patch('/service-periods/:id', (0, validate_1.validate)(restaurant_schema_1.updateRestaurantServicePeriodSchema), Controller.updatePeriod);
router.delete('/service-periods/:id', Controller.deletePeriod);
exports.default = router;
