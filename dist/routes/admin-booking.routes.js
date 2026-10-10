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
const AdminBookingController = __importStar(require("../controllers/admin-booking.controller"));
const requireAuth_1 = require("../middlewares/requireAuth");
const client_1 = require("@prisma/client");
const requirePlanFeature_1 = require("../middlewares/requirePlanFeature");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
const allStaffRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN, client_1.CompanyUserRole.STAFF];
// GET /api/admin/bookings - Get bookings with filters and pagination
router.get('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), AdminBookingController.getBookings);
// GET /api/admin/bookings/reminders/today/preview - Preview today's reminder targets
router.get('/reminders/today/preview', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('BOOKING_REMINDERS'), AdminBookingController.getTodayReminderPreview);
// POST /api/admin/bookings - Create booking on behalf of customer
router.post('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), AdminBookingController.createBooking);
// POST /api/admin/bookings/batch - Create multiple recurring bookings
router.post('/batch', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), AdminBookingController.createRecurringBookings);
// GET /api/admin/bookings/:id/reschedule-options - Suggested valid reschedule slots
router.get('/:id/reschedule-options', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), AdminBookingController.getRescheduleOptions);
// POST /api/admin/bookings/:id/reschedule - Change only booking date/time
router.post('/:id/reschedule', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), AdminBookingController.rescheduleBooking);
// POST /api/admin/bookings/:id/reminders/today - Send today's reminder for one booking
router.post('/:id/reminders/today', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('BOOKING_REMINDERS'), AdminBookingController.sendTodayReminder);
// POST /api/admin/bookings/:id/notifications/no-show - Send no-show notification for one booking
router.post('/:id/notifications/no-show', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('TRANSACTIONAL_BOOKING_NOTIFICATIONS'), AdminBookingController.sendNoShowNotification);
// PUT /api/admin/bookings/:id - Update booking (staff can update their own)
router.put('/:id', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), AdminBookingController.updateBooking);
exports.default = router;
