import { Router } from 'express';
import * as AdminBookingController from '../controllers/admin-booking.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// GET /api/admin/bookings - Get bookings with filters and pagination
router.get('/', requireAuth, requireCompanyRole(adminRoles), AdminBookingController.getBookings);

// POST /api/admin/bookings - Create booking on behalf of customer
router.post('/', requireAuth, requireCompanyRole(adminRoles), AdminBookingController.createBooking);

// PUT /api/admin/bookings/:id - Update booking
router.put('/:id', requireAuth, requireCompanyRole(adminRoles), AdminBookingController.updateBooking);

export default router;
