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
const StaffAvailabilityController = __importStar(require("../controllers/admin-staff-availability.controller"));
const requirePlanFeature_1 = require("../middlewares/requirePlanFeature");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
const allRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN, client_1.CompanyUserRole.STAFF];
const requireAvailabilityFeature = (0, requirePlanFeature_1.requirePlanFeature)('STAFF_AVAILABILITY');
// Staff availability
router.get('/me/availability', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allRoles), requireAvailabilityFeature, StaffAvailabilityController.getMyAvailability);
router.get('/:id/availability', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), requireAvailabilityFeature, StaffAvailabilityController.getStaffAvailability);
router.put('/:id/availability', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), requireAvailabilityFeature, StaffAvailabilityController.saveStaffAvailability);
router.post('/:id/availability/from-company-hours', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), requireAvailabilityFeature, StaffAvailabilityController.assignStaffAvailabilityFromCompanyHours);
// Staff time-off
router.get('/time-off', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allRoles), requireAvailabilityFeature, StaffAvailabilityController.listTimeOffRequests);
router.post('/time-off', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allRoles), requireAvailabilityFeature, StaffAvailabilityController.createTimeOffRequest);
router.post('/time-off/:id/review', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), requireAvailabilityFeature, StaffAvailabilityController.reviewTimeOffRequest);
router.post('/time-off/:id/cancel', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allRoles), requireAvailabilityFeature, StaffAvailabilityController.cancelTimeOffRequest);
exports.default = router;
