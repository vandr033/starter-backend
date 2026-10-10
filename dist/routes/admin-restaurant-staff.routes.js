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
const Controller = __importStar(require("../controllers/admin-restaurant-staff.controller"));
const restaurant_shift_schema_1 = require("../schemas/restaurant-shift.schema");
const restaurant_operations_schema_1 = require("../schemas/restaurant-operations.schema");
const OperationsController = __importStar(require("../controllers/admin-restaurant-operations.controller"));
const router = (0, express_1.Router)();
router.use(requireAuth_1.requireAuth, (0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)([client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN, client_1.CompanyUserRole.STAFF]), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess);
router.get('/my-shift', Controller.currentShift);
router.get('/my-shifts', Controller.upcomingShifts);
router.post('/my-floor/tables/:id/status', (0, validate_1.validate)(restaurant_shift_schema_1.tableStateSchema), Controller.tableStatus);
router.post('/my-floor/reservations/:id/status', (0, validate_1.validate)(restaurant_shift_schema_1.waiterReservationStatusSchema), Controller.reservationStatus);
router.post('/my-floor/notes', (0, validate_1.validate)(restaurant_shift_schema_1.waiterInternalNoteSchema), Controller.note);
router.post('/my-floor/visits', (0, validate_1.validate)(restaurant_operations_schema_1.staffVisitSchema), OperationsController.saveStaffVisit);
exports.default = router;
