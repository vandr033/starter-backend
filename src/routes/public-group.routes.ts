import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { requireActiveCompany } from '../middlewares/requireActiveCompany';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { validate } from '../middlewares/validate';
import * as PublicGroupController from '../controllers/public-group.controller';
import {
    companyScopedActionSchema,
    createClassEnrollmentSchema,
    createEventBookingSchema,
} from '../schemas/group.schema';
import { optionalAuth } from '../middlewares/optionalAuth';
import {
    getFreeRegistrationStateHandler,
    submitFreeRegistrationHandler,
} from '../controllers/free-event-registration.controller';

const router = Router();

router.get(
    '/events',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requirePlanFeature('GROUP_EVENTS'),
    PublicGroupController.listPublicEvents,
);
router.get(
    '/events/:eventId',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requirePlanFeature('GROUP_EVENTS'),
    PublicGroupController.getPublicEventById,
);

router.get(
    '/classes',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requirePlanFeature('GROUP_CLASSES'),
    PublicGroupController.listPublicClasses,
);
router.get(
    '/classes/:classId',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requirePlanFeature('GROUP_CLASSES'),
    PublicGroupController.getPublicClassById,
);
router.get(
    '/classes/:classId/sessions',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requirePlanFeature('GROUP_CLASSES'),
    PublicGroupController.listPublicClassSessions,
);

router.post(
    '/events/:eventId/guest-checkout/start',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requirePlanFeature('GROUP_EVENTS'),
    PublicGroupController.startPaidEventGuestCheckout,
);
router.post(
    '/events/:eventId/guest-checkout/resend',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requirePlanFeature('GROUP_EVENTS'),
    PublicGroupController.resendPaidEventGuestCheckout,
);
router.post(
    '/events/:eventId/guest-checkout/verify',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requirePlanFeature('GROUP_EVENTS'),
    PublicGroupController.verifyPaidEventGuestCheckout,
);

router.post(
    '/events/bookings',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requirePlanFeature('GROUP_EVENTS'),
    validate(createEventBookingSchema),
    PublicGroupController.createEventBooking,
);
router.post(
    '/classes/enrollments',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requirePlanFeature('GROUP_CLASSES'),
    validate(createClassEnrollmentSchema),
    PublicGroupController.createClassEnrollment,
);

router.post(
    '/events/:eventId/waitlist',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requirePlanFeature('GROUP_ADVANCED'),
    validate(companyScopedActionSchema),
    PublicGroupController.joinEventWaitlist,
);
router.delete(
    '/events/:eventId/waitlist',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requirePlanFeature('GROUP_ADVANCED'),
    validate(companyScopedActionSchema),
    PublicGroupController.leaveEventWaitlist,
);
router.post(
    '/events/:eventId/interest',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requirePlanFeature('GROUP_EVENTS'),
    validate(companyScopedActionSchema),
    PublicGroupController.captureEventInterest,
);

router.get('/my/bookings', requireAuth, PublicGroupController.getMyEventBookings);
router.get('/my/enrollments', requireAuth, PublicGroupController.getMyClassEnrollments);
router.get('/my/payment-plans', requireAuth, PublicGroupController.getMyPaymentPlans);
router.post('/my/enrollments/:enrollmentId/ticket/resend', requireAuth, PublicGroupController.resendMyClassTicket);
router.get(
    '/my/enrollments/:enrollmentId/installments',
    requireAuth,
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requirePlanFeature('GROUP_CLASSES'),
    PublicGroupController.getMyInstallments,
);
router.post(
    '/my/enrollments/:enrollmentId/installments/:installmentId/qr-proof',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requirePlanFeature('GROUP_CLASSES'),
    PublicGroupController.submitInstallmentQrProof,
);

// Free event registration (optional auth)
router.get('/events/:eventId/free-registration-state', optionalAuth, getFreeRegistrationStateHandler);
router.post('/events/:eventId/free-register', optionalAuth, submitFreeRegistrationHandler);

export default router;
