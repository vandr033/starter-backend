import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { requireCompanyModule } from '../middlewares/requireCompanyModule';
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
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.confirmEventBooking,
);
router.post(
    '/events/bookings/:bookingId/unconfirm',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.unconfirmEventBooking,
);
router.post(
    '/events/bookings/:bookingId/approve-qr',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.approveEventBookingQrPayment,
);
router.post(
    '/events/bookings/:bookingId/cancel',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.cancelEventBooking,
);
router.post(
    '/events/:eventId/mass-message',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    requirePlanFeature('BULK_WHATSAPP_MESSAGING'),
    AdminGroupBookingController.sendEventMassMessage,
);
router.post(
    '/events/:eventId/mass-message/stream',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    requirePlanFeature('BULK_WHATSAPP_MESSAGING'),
    AdminGroupBookingController.streamEventMassMessage,
);

router.post(
    '/classes/enrollments/:enrollmentId/confirm',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.confirmClassEnrollment,
);
router.post(
    '/classes/enrollments/:enrollmentId/unconfirm',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.unconfirmClassEnrollment,
);
router.post(
    '/classes/enrollments/:enrollmentId/cancel',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.cancelClassEnrollment,
);
router.post(
    '/classes/enrollments/:enrollmentId/confirm-payment',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.confirmClassEnrollmentPayment,
);
router.post(
    '/classes/enrollments/:enrollmentId/issue-ticket',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_ADVANCED'),
    AdminGroupBookingController.issueClassEnrollmentTicket,
);

router.get(
    '/metrics',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.getGroupMetrics,
);

router.get(
    '/payments',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.listGroupPayments,
);

router.post(
    '/attendance/events/:eventId/check-in',
    requireAuth,
    requireCompanyRole(staffRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    validate(checkInEventSchema),
    AdminGroupBookingController.checkInEvent,
);
router.post(
    '/attendance/sessions/:sessionId/check-in',
    requireAuth,
    requireCompanyRole(staffRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    validate(checkInClassSessionSchema),
    AdminGroupBookingController.checkInClassSession,
);
router.post(
    '/attendance/tickets/check-in',
    requireAuth,
    requireCompanyRole(staffRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_ADVANCED'),
    validate(checkInByTicketSchema),
    AdminGroupBookingController.checkInByTicket,
);
router.post(
    '/attendance/events/:eventId/free-check-in/code',
    requireAuth,
    requireCompanyRole(staffRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    validate(checkInFreeEventByCodeSchema),
    freeEventCheckInByCodeHandler,
);
router.get(
    '/attendance/events/:eventId/free-check-in/code/:reservationCode',
    requireAuth,
    requireCompanyRole(staffRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    freeEventLookupByCodeHandler,
);
router.get(
    '/attendance/summary',
    requireAuth,
    requireCompanyRole(staffRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_EVENTS'),
    AdminGroupBookingController.getAttendanceSummary,
);

router.get(
    '/tickets',
    requireAuth,
    requireCompanyRole(staffRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_ADVANCED'),
    AdminGroupBookingController.listTickets,
);
router.get(
    '/tickets/:ticketCode',
    requireAuth,
    requireCompanyRole(staffRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_ADVANCED'),
    AdminGroupBookingController.getTicketByCode,
);
router.post(
    '/tickets/:ticketCode/resend',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_ADVANCED'),
    AdminGroupBookingController.resendTicket,
);
router.post(
    '/tickets/:ticketCode/cancel',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_ADVANCED'),
    AdminGroupBookingController.cancelTicket,
);

// ── Enrollment installments (FULL_COURSE) ───────────────────────────────────
router.get(
    '/classes/enrollments/:enrollmentId/installments',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.listEnrollmentInstallments,
);
router.post(
    '/classes/enrollments/:enrollmentId/installments/:installmentId/mark-paid',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.markInstallmentPaid,
);
router.post(
    '/classes/enrollments/:enrollmentId/installments/:installmentId/confirm-qr',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.confirmInstallmentQrPayment,
);
router.get(
    '/installments/:installmentId/reminders',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.listInstallmentReminders,
);
router.post(
    '/installments/:installmentId/reminders/send',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.sendInstallmentReminder,
);
router.post(
    '/installments/reminders/bulk-send',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requirePlanFeature('GROUP_CLASSES'),
    AdminGroupBookingController.bulkSendInstallmentReminders,
);

router.get('/events/free-registrations/interested', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), adminListInterestedHandler);
router.get('/events/free-registrations/interested/export', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), adminExportInterestedHandler);

// Per-event free registration management
router.get('/events/:eventId/free-registrations', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), requirePlanFeature('GROUP_EVENTS'), adminListFreeRegistrationsHandler);
router.delete('/events/:eventId/free-registrations/:registrationId', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), requirePlanFeature('GROUP_EVENTS'), adminCancelFreeRegistrationHandler);
router.get('/events/:eventId/free-registrations/interested', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), requirePlanFeature('GROUP_EVENTS'), adminListEventInterestedHandler);
router.post('/events/:eventId/free-registrations/:registrationId/invite', requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), requirePlanFeature('GROUP_EVENTS'), adminInviteInterestedHandler);

export default router;
