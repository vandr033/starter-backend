import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { validate } from '../middlewares/validate';
import * as AdminGroupBookingController from '../controllers/admin-group-booking.controller';
import {
    checkInByTicketSchema,
    checkInClassSessionSchema,
    checkInEventSchema,
    checkInFreeEventByCodeSchema,
} from '../schemas/group.schema';
import {
    adminListInterestedHandler,
    adminExportInterestedHandler,
    freeEventCheckInByCodeHandler,
    freeEventLookupByCodeHandler,
    adminListFreeRegistrationsHandler,
    adminCancelFreeRegistrationHandler,
    adminListEventInterestedHandler,
    adminInviteInterestedHandler,
} from '../controllers/free-event-registration.controller';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const staffRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];

router.post(
    '/events/bookings/:bookingId/confirm',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.confirmEventBooking,
);
router.post(
    '/events/bookings/:bookingId/unconfirm',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.unconfirmEventBooking,
);
router.post(
    '/events/bookings/:bookingId/cancel',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.cancelEventBooking,
);

router.post(
    '/classes/enrollments/:enrollmentId/confirm',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.confirmClassEnrollment,
);
router.post(
    '/classes/enrollments/:enrollmentId/unconfirm',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.unconfirmClassEnrollment,
);
router.post(
    '/classes/enrollments/:enrollmentId/cancel',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.cancelClassEnrollment,
);
router.post(
    '/classes/enrollments/:enrollmentId/confirm-payment',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.confirmClassEnrollmentPayment,
);

router.get(
    '/metrics',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.getGroupMetrics,
);

router.post(
    '/attendance/events/:eventId/check-in',
    requireAuth,
    requireCompanyRole(staffRoles),
    requirePlanFeature('GROUP_EVENTS'),
    validate(checkInEventSchema),
    AdminGroupBookingController.checkInEvent,
);
router.post(
    '/attendance/sessions/:sessionId/check-in',
    requireAuth,
    requireCompanyRole(staffRoles),
    requirePlanFeature('GROUP_CLASSES'),
    validate(checkInClassSessionSchema),
    AdminGroupBookingController.checkInClassSession,
);
router.post(
    '/attendance/tickets/check-in',
    requireAuth,
    requireCompanyRole(staffRoles),
    requirePlanFeature('GROUP_ADVANCED'),
    validate(checkInByTicketSchema),
    AdminGroupBookingController.checkInByTicket,
);
router.post(
    '/attendance/events/:eventId/free-check-in/code',
    requireAuth,
    requireCompanyRole(staffRoles),
    requirePlanFeature('GROUP_EVENTS'),
    validate(checkInFreeEventByCodeSchema),
    freeEventCheckInByCodeHandler,
);
router.get(
    '/attendance/events/:eventId/free-check-in/code/:reservationCode',
    requireAuth,
    requireCompanyRole(staffRoles),
    requirePlanFeature('GROUP_EVENTS'),
    freeEventLookupByCodeHandler,
);
router.get(
    '/attendance/summary',
    requireAuth,
    requireCompanyRole(staffRoles),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.getAttendanceSummary,
);

router.get(
    '/tickets',
    requireAuth,
    requireCompanyRole(staffRoles),
    requirePlanFeature('GROUP_ADVANCED'),
    AdminGroupBookingController.listTickets,
);
router.get(
    '/tickets/:ticketCode',
    requireAuth,
    requireCompanyRole(staffRoles),
    requirePlanFeature('GROUP_ADVANCED'),
    AdminGroupBookingController.getTicketByCode,
);
router.post(
    '/tickets/:ticketCode/resend',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_ADVANCED'),
    AdminGroupBookingController.resendTicket,
);
router.post(
    '/tickets/:ticketCode/cancel',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_ADVANCED'),
    AdminGroupBookingController.cancelTicket,
);

// ── Enrollment installments (FULL_COURSE) ───────────────────────────────────
router.get(
    '/classes/enrollments/:enrollmentId/installments',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.listEnrollmentInstallments,
);
router.post(
    '/classes/enrollments/:enrollmentId/installments/:installmentId/mark-paid',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.markInstallmentPaid,
);
router.post(
    '/classes/enrollments/:enrollmentId/installments/:installmentId/confirm-qr',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.confirmInstallmentQrPayment,
);

router.get('/events/free-registrations/interested', requireAuth, requireCompanyRole(adminRoles), adminListInterestedHandler);
router.get('/events/free-registrations/interested/export', requireAuth, requireCompanyRole(adminRoles), adminExportInterestedHandler);

// Per-event free registration management
router.get('/events/:eventId/free-registrations', requireAuth, requireCompanyRole(adminRoles), requirePlanFeature('GROUP_EVENTS'), adminListFreeRegistrationsHandler);
router.delete('/events/:eventId/free-registrations/:registrationId', requireAuth, requireCompanyRole(adminRoles), requirePlanFeature('GROUP_EVENTS'), adminCancelFreeRegistrationHandler);
router.get('/events/:eventId/free-registrations/interested', requireAuth, requireCompanyRole(adminRoles), requirePlanFeature('GROUP_EVENTS'), adminListEventInterestedHandler);
router.post('/events/:eventId/free-registrations/:registrationId/invite', requireAuth, requireCompanyRole(adminRoles), requirePlanFeature('GROUP_EVENTS'), adminInviteInterestedHandler);

export default router;
