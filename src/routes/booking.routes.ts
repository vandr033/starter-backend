import { Router } from 'express';
import * as BookingController from '../controllers/booking.controller';
import { createPublicBooking } from '../controllers/public-booking.controller';
import { createCustomerBooking } from '../controllers/customer-booking.controller';
import { requireAuth, AuthenticatedRequest } from '../middlewares/requireAuth';
import { requireActiveCompany } from '../middlewares/requireActiveCompany';
import { requireCompanyModule } from '../middlewares/requireCompanyModule';
import * as CustomerAppointments from '../services/customer-appointments.service';
import { Request, Response } from 'express';

const router = Router();

// GET /api/booking/my - Get logged-in user's bookings
router.get('/my', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const result = await CustomerAppointments.getCustomerBookings(userId);
    return res.status(result.code).json(result);
});

// GET /api/booking/slots - Get available booking time slots
router.get(
    '/slots',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requireCompanyModule('RESERVATIONS'),
    BookingController.getAvailableSlots,
);

// GET /api/booking/available-dates - Get available booking dates with hours
router.get(
    '/available-dates',
    requireActiveCompany({ source: 'query', key: 'company_id' }),
    requireCompanyModule('RESERVATIONS'),
    BookingController.getAvailableDates,
);

// POST /api/booking - Create a new booking (requires auth)
router.post(
    '/',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyModule('RESERVATIONS'),
    BookingController.createBooking,
);

// POST /api/booking/public - Create a new booking as a guest (no auth required)
router.post(
    '/public',
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyModule('RESERVATIONS'),
    createPublicBooking,
);

// POST /api/booking/customer - Create a new booking for existing customer (requires auth)
router.post(
    '/customer',
    requireAuth,
    requireActiveCompany({ source: 'body', key: 'company_id' }),
    requireCompanyModule('RESERVATIONS'),
    createCustomerBooking,
);

// PUT /api/booking/:id - Modify a booking (requires auth)
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const bookingId = parseInt(req.params.id as string, 10);
    if (isNaN(bookingId)) return res.status(400).json({ error: "Invalid booking ID" });
    const { staff_id, start_at } = req.body;
    const result = await CustomerAppointments.modifyBooking(bookingId, userId, { staff_id, start_at });
    return res.status(result.code).json(result);
});

// POST /api/booking/:id/cancel - Cancel a booking (requires auth)
router.post('/:id/cancel', requireAuth, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const bookingId = parseInt(req.params.id as string, 10);
    if (isNaN(bookingId)) return res.status(400).json({ error: "Invalid booking ID" });
    const result = await CustomerAppointments.cancelBooking(bookingId, userId);
    return res.status(result.code).json(result);
});

export default router;
