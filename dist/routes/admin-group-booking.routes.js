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
const requirePlanFeature_1 = require("../middlewares/requirePlanFeature");
const requireCompanyCapability_1 = require("../middlewares/requireCompanyCapability");
const validate_1 = require("../middlewares/validate");
const AdminGroupBookingController = __importStar(require("../controllers/admin-group-booking.controller"));
const group_schema_1 = require("../schemas/group.schema");
const free_event_registration_controller_1 = require("../controllers/free-event-registration.controller");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
const staffRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN, client_1.CompanyUserRole.STAFF];
router.post('/events/bookings/:bookingId/confirm', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), AdminGroupBookingController.confirmEventBooking);
router.post('/events/bookings/:bookingId/unconfirm', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), AdminGroupBookingController.unconfirmEventBooking);
router.post('/events/bookings/:bookingId/approve-qr', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), AdminGroupBookingController.approveEventBookingQrPayment);
router.post('/events/bookings/:bookingId/cancel', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), AdminGroupBookingController.cancelEventBooking);
router.post('/events/:eventId/mass-message', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), (0, requirePlanFeature_1.requirePlanFeature)('BULK_WHATSAPP_MESSAGING'), AdminGroupBookingController.sendEventMassMessage);
router.post('/events/:eventId/mass-message/stream', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), (0, requirePlanFeature_1.requirePlanFeature)('BULK_WHATSAPP_MESSAGING'), AdminGroupBookingController.streamEventMassMessage);
router.post('/classes/:classId/mass-message', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), (0, requirePlanFeature_1.requirePlanFeature)('BULK_WHATSAPP_MESSAGING'), AdminGroupBookingController.sendClassMassMessage);
router.post('/classes/enrollments/:enrollmentId/confirm', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), AdminGroupBookingController.confirmClassEnrollment);
router.post('/classes/enrollments/:enrollmentId/unconfirm', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), AdminGroupBookingController.unconfirmClassEnrollment);
router.post('/classes/enrollments/:enrollmentId/cancel', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), AdminGroupBookingController.cancelClassEnrollment);
router.post('/classes/enrollments/:enrollmentId/confirm-payment', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), AdminGroupBookingController.confirmClassEnrollmentPayment);
router.post('/classes/enrollments/:enrollmentId/issue-ticket', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_ADVANCED'), AdminGroupBookingController.issueClassEnrollmentTicket);
router.get('/metrics', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), AdminGroupBookingController.getGroupMetrics);
router.get('/payments', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), AdminGroupBookingController.listGroupPayments);
router.post('/attendance/events/:eventId/check-in', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(staffRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), (0, validate_1.validate)(group_schema_1.checkInEventSchema), AdminGroupBookingController.checkInEvent);
router.post('/attendance/sessions/:sessionId/check-in', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(staffRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), (0, validate_1.validate)(group_schema_1.checkInClassSessionSchema), AdminGroupBookingController.checkInClassSession);
router.post('/attendance/sessions/:sessionId/status', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(staffRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), (0, validate_1.validate)(group_schema_1.setClassSessionAttendanceStatusSchema), AdminGroupBookingController.setClassSessionAttendanceStatus);
router.post('/attendance/tickets/check-in', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(staffRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_ADVANCED'), (0, validate_1.validate)(group_schema_1.checkInByTicketSchema), AdminGroupBookingController.checkInByTicket);
router.post('/attendance/events/:eventId/free-check-in/code', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(staffRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), (0, validate_1.validate)(group_schema_1.checkInFreeEventByCodeSchema), free_event_registration_controller_1.freeEventCheckInByCodeHandler);
router.get('/attendance/events/:eventId/free-check-in/code/:reservationCode', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(staffRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), free_event_registration_controller_1.freeEventLookupByCodeHandler);
router.get('/attendance/summary', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(staffRoles), (0, requirePlanFeature_1.requireAnyPlanFeature)(['GROUP_EVENTS', 'GROUP_CLASSES']), AdminGroupBookingController.getAttendanceSummary);
router.get('/tickets', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(staffRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_ADVANCED'), AdminGroupBookingController.listTickets);
router.get('/tickets/:ticketCode', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(staffRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_ADVANCED'), AdminGroupBookingController.getTicketByCode);
router.post('/tickets/:ticketCode/resend', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_ADVANCED'), AdminGroupBookingController.resendTicket);
router.post('/tickets/:ticketCode/cancel', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_ADVANCED'), AdminGroupBookingController.cancelTicket);
// ── Enrollment installments (FULL_COURSE) ───────────────────────────────────
router.get('/classes/enrollments/:enrollmentId/installments', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), AdminGroupBookingController.listEnrollmentInstallments);
router.put('/classes/enrollments/:enrollmentId/installments', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), AdminGroupBookingController.updateEnrollmentInstallments);
router.post('/classes/enrollments/:enrollmentId/installments/:installmentId/mark-paid', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), AdminGroupBookingController.markInstallmentPaid);
router.post('/classes/enrollments/:enrollmentId/installments/:installmentId/confirm-qr', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), AdminGroupBookingController.confirmInstallmentQrPayment);
router.get('/installments/:installmentId/reminders', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_PRO'), (0, requireCompanyCapability_1.requireCompanyCapability)('MENSAJERIA_PRO'), AdminGroupBookingController.listInstallmentReminders);
router.post('/installments/:installmentId/reminders/send', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_PRO'), (0, requireCompanyCapability_1.requireCompanyCapability)('MENSAJERIA_PRO'), AdminGroupBookingController.sendInstallmentReminder);
router.post('/installments/reminders/bulk-send', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_PRO'), (0, requireCompanyCapability_1.requireCompanyCapability)('MENSAJERIA_PRO'), AdminGroupBookingController.bulkSendInstallmentReminders);
router.get('/events/free-registrations/interested', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), free_event_registration_controller_1.adminListInterestedHandler);
router.get('/events/free-registrations/interested/export', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), free_event_registration_controller_1.adminExportInterestedHandler);
// Per-event free registration management
router.get('/events/:eventId/free-registrations', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), free_event_registration_controller_1.adminListFreeRegistrationsHandler);
router.delete('/events/:eventId/free-registrations/:registrationId', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), free_event_registration_controller_1.adminCancelFreeRegistrationHandler);
router.get('/events/:eventId/free-registrations/interested', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), free_event_registration_controller_1.adminListEventInterestedHandler);
router.post('/events/:eventId/free-registrations/:registrationId/invite', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'), free_event_registration_controller_1.adminInviteInterestedHandler);
exports.default = router;
