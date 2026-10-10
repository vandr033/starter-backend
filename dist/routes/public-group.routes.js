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
const requireAuth_1 = require("../middlewares/requireAuth");
const requireActiveCompany_1 = require("../middlewares/requireActiveCompany");
const requireCompanyCapability_1 = require("../middlewares/requireCompanyCapability");
const validate_1 = require("../middlewares/validate");
const PublicGroupController = __importStar(require("../controllers/public-group.controller"));
const group_schema_1 = require("../schemas/group.schema");
const optionalAuth_1 = require("../middlewares/optionalAuth");
const demo_session_middleware_1 = require("../middlewares/demo-session.middleware");
const free_event_registration_controller_1 = require("../controllers/free-event-registration.controller");
const router = (0, express_1.Router)();
router.get('/events', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'query', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_BASE'), PublicGroupController.listPublicEvents);
router.get('/events/:eventId', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'query', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_BASE'), PublicGroupController.getPublicEventById);
router.get('/classes', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'query', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_BASE'), PublicGroupController.listPublicClasses);
router.get('/classes/:classId', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'query', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_BASE'), PublicGroupController.getPublicClassById);
router.get('/classes/:classId/sessions', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'query', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_BASE'), PublicGroupController.listPublicClassSessions);
router.get('/classes/sessions/attendance/:token', optionalAuth_1.optionalAuth, PublicGroupController.getPublicSessionAttendanceState);
router.post('/classes/sessions/attendance/:token/start', demo_session_middleware_1.demoClassAttendanceWriteGuard, optionalAuth_1.optionalAuth, (0, validate_1.validate)(group_schema_1.publicSessionAttendanceStartSchema), PublicGroupController.startPublicSessionAttendanceVerification);
router.post('/classes/sessions/attendance/:token/resend', demo_session_middleware_1.demoClassAttendanceWriteGuard, optionalAuth_1.optionalAuth, (0, validate_1.validate)(group_schema_1.publicSessionAttendanceResendSchema), PublicGroupController.resendPublicSessionAttendanceVerification);
router.post('/classes/sessions/attendance/:token/verify', demo_session_middleware_1.demoClassAttendanceWriteGuard, optionalAuth_1.optionalAuth, (0, validate_1.validate)(group_schema_1.publicSessionAttendanceVerifySchema), PublicGroupController.verifyPublicSessionAttendanceVerification);
router.post('/classes/sessions/attendance/:token/submit', demo_session_middleware_1.demoClassAttendanceWriteGuard, optionalAuth_1.optionalAuth, (0, validate_1.validate)(group_schema_1.publicSessionAttendanceSubmitSchema), PublicGroupController.submitPublicSessionAttendance);
router.post('/events/:eventId/guest-checkout/start', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_BASE'), PublicGroupController.startPaidEventGuestCheckout);
router.post('/events/:eventId/guest-checkout/resend', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_BASE'), PublicGroupController.resendPaidEventGuestCheckout);
router.post('/events/:eventId/guest-checkout/verify', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_BASE'), PublicGroupController.verifyPaidEventGuestCheckout);
router.post('/classes/:classId/guest-enrollment/start', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_BASE'), PublicGroupController.startClassGuestEnrollment);
router.post('/classes/:classId/guest-enrollment/resend', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_BASE'), PublicGroupController.resendClassGuestEnrollment);
router.post('/classes/:classId/guest-enrollment/verify', (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_BASE'), PublicGroupController.verifyClassGuestEnrollment);
router.post('/events/bookings', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_BASE'), (0, validate_1.validate)(group_schema_1.createEventBookingSchema), PublicGroupController.createEventBooking);
router.post('/classes/enrollments', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_BASE'), (0, validate_1.validate)(group_schema_1.createClassEnrollmentSchema), PublicGroupController.createClassEnrollment);
router.post('/events/:eventId/waitlist', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_PRO'), (0, validate_1.validate)(group_schema_1.companyScopedActionSchema), PublicGroupController.joinEventWaitlist);
router.delete('/events/:eventId/waitlist', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_PRO'), (0, validate_1.validate)(group_schema_1.companyScopedActionSchema), PublicGroupController.leaveEventWaitlist);
router.post('/events/:eventId/interest', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_BASE'), (0, validate_1.validate)(group_schema_1.companyScopedActionSchema), PublicGroupController.captureEventInterest);
router.post('/classes/:classId/interest', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_BASE'), (0, validate_1.validate)(group_schema_1.companyScopedActionSchema), PublicGroupController.captureClassInterest);
router.get('/my/bookings', requireAuth_1.requireAuth, PublicGroupController.getMyEventBookings);
router.get('/my/enrollments', requireAuth_1.requireAuth, PublicGroupController.getMyClassEnrollments);
router.get('/my/payment-plans', requireAuth_1.requireAuth, PublicGroupController.getMyPaymentPlans);
router.post('/my/enrollments/:enrollmentId/ticket/resend', requireAuth_1.requireAuth, PublicGroupController.resendMyClassTicket);
router.get('/my/enrollments/:enrollmentId/installments', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'query', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_PRO'), PublicGroupController.getMyInstallments);
router.post('/my/enrollments/:enrollmentId/installments/:installmentId/qr-proof', requireAuth_1.requireAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('CLASES_PRO'), PublicGroupController.submitInstallmentQrProof);
// Free event registration (optional auth)
router.get('/events/:eventId/free-registration-state', optionalAuth_1.optionalAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'query', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_BASE'), free_event_registration_controller_1.getFreeRegistrationStateHandler);
router.post('/events/:eventId/free-register', optionalAuth_1.optionalAuth, (0, requireActiveCompany_1.requireActiveCompany)({ source: 'body', key: 'company_id' }), (0, requireCompanyCapability_1.requireCompanyCapability)('EVENTOS_BASE'), free_event_registration_controller_1.submitFreeRegistrationHandler);
exports.default = router;
