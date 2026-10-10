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
const BookingController = __importStar(require("../controllers/booking.controller"));
const public_booking_controller_1 = require("../controllers/public-booking.controller");
const customer_booking_controller_1 = require("../controllers/customer-booking.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const requireActiveCompany_1 = require("../middlewares/requireActiveCompany");
const requireCompanyCapability_1 = require("../middlewares/requireCompanyCapability");
const CustomerAppointments = __importStar(require("../services/customer-appointments.service"));
const demo_session_middleware_1 = require("../middlewares/demo-session.middleware");
const router = (0, express_1.Router)();
// GET /api/booking/my - Get logged-in user's bookings
router.get('/my', requireAuth_1.requireAuth, async (req, res) => {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const result = await CustomerAppointments.getCustomerBookings(userId);
    return res.status(result.code).json(result);
});
// GET /api/booking/slots - Get available booking time slots
router.get('/slots', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'query', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('RESERVAS_BASE'), BookingController.getAvailableSlots);
// GET /api/booking/available-dates - Get available booking dates with hours
router.get('/available-dates', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'query', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('RESERVAS_BASE'), BookingController.getAvailableDates);
// POST /api/booking - Create a new booking (requires auth)
router.post('/', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('RESERVAS_BASE'), BookingController.createBooking);
// POST /api/booking/public - Create a new booking as a guest (no auth required)
router.post('/public', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('RESERVAS_BASE'), public_booking_controller_1.createPublicBooking);
// POST /api/booking/customer - Create a new booking for existing customer (requires auth)
router.post('/customer', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('RESERVAS_BASE'), customer_booking_controller_1.createCustomerBooking);
// PUT /api/booking/:id - Modify a booking (requires auth)
router.put('/:id', demo_session_middleware_1.demoBookingWriteGuard, requireAuth_1.requireAuth, async (req, res) => {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId))
        return res.status(400).json({ error: "Invalid booking ID" });
    const { staff_id, start_at } = req.body;
    const result = await CustomerAppointments.modifyBooking(bookingId, userId, { staff_id, start_at });
    return res.status(result.code).json(result);
});
// POST /api/booking/:id/cancel - Cancel a booking (requires auth)
router.post('/:id/cancel', demo_session_middleware_1.demoBookingWriteGuard, requireAuth_1.requireAuth, async (req, res) => {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId))
        return res.status(400).json({ error: "Invalid booking ID" });
    const result = await CustomerAppointments.cancelBooking(bookingId, userId);
    return res.status(result.code).json(result);
});
exports.default = router;
