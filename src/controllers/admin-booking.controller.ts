import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as AdminBookingService from '../services/admin-booking.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { BookingStatus, PaymentStatus, PaymentMethod } from '@prisma/client';

let mensaje: MensajeApi;

/**
 * GET /api/admin/bookings
 * Get bookings with filters
 */
export async function getBookings(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    // Parse query parameters
    const {
        start,
        end,
        status,
        staff_id,
    } = req.query;

    // Parse status
    let parsedStatus: BookingStatus | undefined;
    if (status && typeof status === 'string') {
        if (Object.values(BookingStatus).includes(status as BookingStatus)) {
            parsedStatus = status as BookingStatus;
        }
    }

    // Parse staff_id
    const parsedStaffId = staff_id ? parseInt(staff_id as string) : undefined;
    if (staff_id && isNaN(parsedStaffId!)) {
        mensaje = {
            code: 400,
            message: 'Invalid staff_id format',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await AdminBookingService.getBookings({
        companyId,
        startDate: start as string,
        endDate: end as string,
        status: parsedStatus,
        staffId: parsedStaffId,
    });

    // Transform response to match required format
    if (!result.error && result.data) {
        const transformedData = result.data.bookings.map((booking: any) => ({
            id: booking.id,
            status: booking.status,
            start_at: booking.start_at,
            end_at: booking.end_at,
            customer: booking.customer ? {
                id: booking.customer.id,
                full_name: booking.customer.user?.first_name && booking.customer.user?.last_name
                    ? `${booking.customer.user.first_name} ${booking.customer.user.last_name}`
                    : booking.customer.user?.name || 'Unknown',
                email: booking.customer.user?.email || '',
                phone: booking.customer.user?.phoneNumber || '',
            } : {
                id: null,
                full_name: booking.client_name || 'Walk-in',
                email: booking.client_email || '',
                phone: booking.client_phone_prefix && booking.client_phone_number
                    ? `${booking.client_phone_prefix} ${booking.client_phone_number}`
                    : booking.client_phone_number || '',
            },
            services: booking.booking_services.map((bs: any) => ({
                id: bs.service.id,
                name: bs.service.name,
                duration: bs.service.duration_minutes,
            })),
            staff: {
                id: booking.staff.id,
                name: booking.staff.display_name,
            },
            total_price: booking.total_price_cents,
            notes: booking.notes,
            payment_method: booking.payment_method,
            qr_proof_image_url: booking.qr_proof_image_url,
        }));

        return res.status(result.code).json({
            data: transformedData,
        });
    }

    return res.status(result.code).json(result);
}

/**
 * PUT /api/admin/bookings/:id
 * Update booking (status change, reschedule, notes)
 */
export async function updateBooking(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const bookingId = parseInt(req.params.id as string);
    const userId = (req as any).userID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (isNaN(bookingId)) {
        mensaje = {
            code: 400,
            message: 'Invalid booking ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    // Parse update fields
    const {
        status,
        start_at,
        notes,
    } = req.body;

    // Parse status
    let parsedStatus: BookingStatus | undefined;
    if (status !== undefined) {
        if (typeof status === 'string' && Object.values(BookingStatus).includes(status as BookingStatus)) {
            parsedStatus = status as BookingStatus;
        } else {
            mensaje = {
                code: 400,
                message: 'Invalid status value',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    const result = await AdminBookingService.updateBooking(
        bookingId,
        companyId,
        {
            status: parsedStatus,
            start_at,
            notes,
        },
        userId
    );

    // Transform response to match required format
    if (!result.error && result.data) {
        const transformedData = {
            id: result.data.id,
            status: result.data.status,
            start_at: result.data.start_at,
            end_at: result.data.end_at,
            customer: result.data.customer ? {
                id: result.data.customer.id,
                full_name: result.data.customer.user?.first_name && result.data.customer.user?.last_name
                    ? `${result.data.customer.user.first_name} ${result.data.customer.user.last_name}`
                    : result.data.customer.user?.name || 'Unknown',
                email: result.data.customer.user?.email || '',
                phone: result.data.customer.user?.phoneNumber || '',
            } : {
                id: null,
                full_name: result.data.client_name || 'Walk-in',
                email: result.data.client_email || '',
                phone: result.data.client_phone_prefix && result.data.client_phone_number
                    ? `${result.data.client_phone_prefix} ${result.data.client_phone_number}`
                    : result.data.client_phone_number || '',
            },
            services: result.data.booking_services.map((bs: any) => ({
                id: bs.service.id,
                name: bs.service.name,
                duration: bs.service.duration_minutes,
            })),
            staff: {
                id: result.data.staff.id,
                name: result.data.staff.display_name,
            },
            total_price: result.data.total_price_cents,
            notes: result.data.notes,
            payment_method: result.data.payment_method,
            qr_proof_image_url: result.data.qr_proof_image_url,
        };

        return res.status(result.code).json({
            data: transformedData,
        });
    }

    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/bookings
 * Create booking on behalf of customer (for walk-ins)
 */
export async function createBooking(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const userId = (req as any).userID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const {
        staff_id,
        service_ids,
        start_at,
        customer,
        notes,
    } = req.body;

    // Validate required fields
    if (!staff_id || !service_ids || !start_at) {
        mensaje = {
            code: 400,
            message: 'staff_id, service_ids, and start_at are required',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    // Parse staff_id
    const parsedStaffId = parseInt(staff_id);
    if (isNaN(parsedStaffId)) {
        mensaje = {
            code: 400,
            message: 'Invalid staff_id format',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    // Extract customer info if provided
    let client_name, client_email, client_phone;
    if (customer) {
        client_name = customer.full_name;
        client_email = customer.email;
        client_phone = customer.phone;
    }

    const result = await AdminBookingService.createBooking({
        companyId,
        staff_id: parsedStaffId,
        service_ids,
        start_at,
        client_name,
        client_phone,
        client_email,
        notes,
    }, userId);

    // Transform response to match required format
    if (!result.error && result.data) {
        const transformedData = {
            id: result.data.id,
            status: result.data.status,
            start_at: result.data.start_at,
            end_at: result.data.end_at,
            customer: result.data.customer ? {
                id: result.data.customer.id,
                full_name: result.data.customer.user?.first_name && result.data.customer.user?.last_name
                    ? `${result.data.customer.user.first_name} ${result.data.customer.user.last_name}`
                    : result.data.customer.user?.name || 'Unknown',
                email: result.data.customer.user?.email || '',
                phone: result.data.customer.user?.phoneNumber || '',
            } : {
                id: null,
                full_name: result.data.client_name || 'Walk-in',
                email: result.data.client_email || '',
                phone: result.data.client_phone_prefix && result.data.client_phone_number
                    ? `${result.data.client_phone_prefix} ${result.data.client_phone_number}`
                    : result.data.client_phone_number || '',
            },
            services: result.data.booking_services.map((bs: any) => ({
                id: bs.service.id,
                name: bs.service.name,
                duration: bs.service.duration_minutes,
            })),
            staff: {
                id: result.data.staff.id,
                name: result.data.staff.display_name,
            },
            total_price: result.data.total_price_cents,
            notes: result.data.notes,
            payment_method: result.data.payment_method,
            qr_proof_image_url: result.data.qr_proof_image_url,
        };

        return res.status(result.code).json({
            data: transformedData,
        });
    }

    return res.status(result.code).json(result);
}
