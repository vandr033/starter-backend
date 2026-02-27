import { Router } from 'express';
import * as AdminBookingController from '../controllers/admin-booking.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const allStaffRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];

// GET /api/admin/bookings - Get bookings with filters and pagination
router.get('/', requireAuth, requireCompanyRole(allStaffRoles), AdminBookingController.getBookings);

// POST /api/admin/bookings - Create booking on behalf of customer
router.post('/', requireAuth, requireCompanyRole(adminRoles), AdminBookingController.createBooking);

// PUT /api/admin/bookings/:id - Update booking (staff can update their own)
router.put('/:id', requireAuth, requireCompanyRole(allStaffRoles), AdminBookingController.updateBooking);

export default router;
