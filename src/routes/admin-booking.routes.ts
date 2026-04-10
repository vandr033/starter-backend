import { Router } from 'express';
import * as AdminBookingController from '../controllers/admin-booking.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const allStaffRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];

// GET /api/admin/bookings - Get bookings with filters and pagination
router.get('/', requireAuth, requireCompanyRole(allStaffRoles), AdminBookingController.getBookings);

// GET /api/admin/bookings/reminders/today/preview - Preview today's reminder targets
router.get(
    '/reminders/today/preview',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('BOOKING_REMINDERS'),
    AdminBookingController.getTodayReminderPreview
);

// POST /api/admin/bookings - Create booking on behalf of customer
router.post('/', requireAuth, requireCompanyRole(adminRoles), AdminBookingController.createBooking);

// POST /api/admin/bookings/batch - Create multiple recurring bookings
router.post('/batch', requireAuth, requireCompanyRole(adminRoles), AdminBookingController.createRecurringBookings);

// POST /api/admin/bookings/:id/reminders/today - Send today's reminder for one booking
router.post(
    '/:id/reminders/today',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('BOOKING_REMINDERS'),
    AdminBookingController.sendTodayReminder
);

// POST /api/admin/bookings/:id/notifications/no-show - Send no-show notification for one booking
router.post(
    '/:id/notifications/no-show',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('TRANSACTIONAL_BOOKING_NOTIFICATIONS'),
    AdminBookingController.sendNoShowNotification
);

// PUT /api/admin/bookings/:id - Update booking (staff can update their own)
router.put('/:id', requireAuth, requireCompanyRole(allStaffRoles), AdminBookingController.updateBooking);

export default router;
