import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { requireActiveCompany } from '../middlewares/requireActiveCompany';
import { requireCompanyCapability } from '../middlewares/requireCompanyCapability';
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
    requireCompanyCapability('EVENTOS_BASE'),
    PublicGroupController.listPublicEvents,
);
router.get(
    '/events/:eventId',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_BASE'),
    PublicGroupController.getPublicEventById,
);

router.get(
    '/classes',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requireCompanyCapability('CLASES_BASE'),
    PublicGroupController.listPublicClasses,
);
router.get(
    '/classes/:classId',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requireCompanyCapability('CLASES_BASE'),
    PublicGroupController.getPublicClassById,
);
router.get(
    '/classes/:classId/sessions',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requireCompanyCapability('CLASES_BASE'),
    PublicGroupController.listPublicClassSessions,
);

router.post(
    '/events/:eventId/guest-checkout/start',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_BASE'),
    PublicGroupController.startPaidEventGuestCheckout,
);
router.post(
    '/events/:eventId/guest-checkout/resend',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_BASE'),
    PublicGroupController.resendPaidEventGuestCheckout,
);
router.post(
    '/events/:eventId/guest-checkout/verify',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_BASE'),
    PublicGroupController.verifyPaidEventGuestCheckout,
);

router.post(
    '/classes/:classId/guest-enrollment/start',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('CLASES_BASE'),
    PublicGroupController.startClassGuestEnrollment,
);
router.post(
    '/classes/:classId/guest-enrollment/resend',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('CLASES_BASE'),
    PublicGroupController.resendClassGuestEnrollment,
);
router.post(
    '/classes/:classId/guest-enrollment/verify',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('CLASES_BASE'),
    PublicGroupController.verifyClassGuestEnrollment,
);

router.post(
    '/events/bookings',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_BASE'),
    validate(createEventBookingSchema),
    PublicGroupController.createEventBooking,
);
router.post(
    '/classes/enrollments',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('CLASES_BASE'),
    validate(createClassEnrollmentSchema),
    PublicGroupController.createClassEnrollment,
);

router.post(
    '/events/:eventId/waitlist',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_PRO'),
    validate(companyScopedActionSchema),
    PublicGroupController.joinEventWaitlist,
);
router.delete(
    '/events/:eventId/waitlist',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_PRO'),
    validate(companyScopedActionSchema),
    PublicGroupController.leaveEventWaitlist,
);
router.post(
    '/events/:eventId/interest',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_BASE'),
    validate(companyScopedActionSchema),
    PublicGroupController.captureEventInterest,
);
router.post(
    '/classes/:classId/interest',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('CLASES_BASE'),
    validate(companyScopedActionSchema),
    PublicGroupController.captureClassInterest,
);

router.get('/my/bookings', requireAuth, PublicGroupController.getMyEventBookings);
router.get('/my/enrollments', requireAuth, PublicGroupController.getMyClassEnrollments);
router.get('/my/payment-plans', requireAuth, PublicGroupController.getMyPaymentPlans);
router.post('/my/enrollments/:enrollmentId/ticket/resend', requireAuth, PublicGroupController.resendMyClassTicket);
router.get(
    '/my/enrollments/:enrollmentId/installments',
    requireAuth,
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requireCompanyCapability('CLASES_PRO'),
    PublicGroupController.getMyInstallments,
);
router.post(
    '/my/enrollments/:enrollmentId/installments/:installmentId/qr-proof',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('CLASES_PRO'),
    PublicGroupController.submitInstallmentQrProof,
);

// Free event registration (optional auth)
router.get(
    '/events/:eventId/free-registration-state',
    optionalAuth,
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_BASE'),
    getFreeRegistrationStateHandler,
);
router.post(
    '/events/:eventId/free-register',
    optionalAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyCapability('EVENTOS_BASE'),
    submitFreeRegistrationHandler,
);

export default router;
