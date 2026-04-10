import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as AdminBookingService from '../services/admin-booking.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { BookingStatus, PaymentMethod, CompanyUserRole } from '@prisma/client';
import { prisma } from '../prisma/client';

let mensaje: MensajeApi;

function transformAdminBooking(booking: any) {
    return {
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
        payment_status: booking.payment_status,
        qr_proof_image_url: booking.qr_proof_image_url,
    };
}

/**
 * GET /api/admin/bookings
 * Get bookings with filters
 */
export async function getBookings(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const companyUser = (req as any).companyUser as { role?: CompanyUserRole } | undefined;
    const authUserId = req.authUser?.id;

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

    let effectiveStaffId = parsedStaffId;

    if (companyUser?.role === CompanyUserRole.STAFF) {
        if (!authUserId) {
            return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
        }

        const staffProfile = await prisma.staffProfile.findFirst({
            where: {
                company_id: companyId,
                user_id: authUserId,
                deleted_at: null,
            },
            select: { id: true },
        });

        if (!staffProfile) {
            return res.status(403).json({
                code: 403,
                error: true,
                message: 'Staff profile not found in this company',
            });
        }

        if (parsedStaffId && parsedStaffId !== staffProfile.id) {
            return res.status(403).json({
                code: 403,
                error: true,
                message: 'Staff can only view their own bookings',
            });
        }

        effectiveStaffId = staffProfile.id;
    }

    const result = await AdminBookingService.getBookings({
        companyId,
        startDate: start as string,
        endDate: end as string,
        status: parsedStatus,
        staffId: effectiveStaffId,
    });

    // Transform response to match required format
    if (!result.error && result.data) {
        const transformedData = result.data.bookings.map((booking: any) => transformAdminBooking(booking));

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
    const userId = req.authUser?.id;
    const companyUser = (req as any).companyUser as { role?: CompanyUserRole } | undefined;

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

    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    // Parse update fields
    const {
        status,
        start_at,
        notes,
        staff_id,
        service_ids,
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

    // Parse staff_id
    let parsedStaffId: number | undefined;
    if (staff_id !== undefined) {
        parsedStaffId = parseInt(staff_id);
        if (isNaN(parsedStaffId)) {
            mensaje = {
                code: 400,
                message: 'Invalid staff_id format',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    // Validate service_ids
    let parsedServiceIds: number[] | undefined;
    if (service_ids !== undefined) {
        if (!Array.isArray(service_ids) || service_ids.length === 0) {
            mensaje = {
                code: 400,
                message: 'service_ids must be a non-empty array',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        parsedServiceIds = service_ids.map(Number);
    }

    const result = await AdminBookingService.updateBooking(
        bookingId,
        companyId,
        {
            status: parsedStatus,
            start_at,
            notes,
            staff_id: parsedStaffId,
            service_ids: parsedServiceIds,
        },
        userId,
        companyUser?.role
    );

    // Transform response to match required format
    if (!result.error && result.data) {
        return res.status(result.code).json({
            data: transformAdminBooking(result.data),
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
    const userId = req.authUser?.id;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const {
        staff_id,
        service_ids,
        start_at,
        customer_id,
        customer,
        notes,
        is_paid,
        payment_method,
        qr_proof_image_url,
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
        customer_id: customer_id ? Number(customer_id) : undefined,
        client_name,
        client_phone,
        client_email,
        notes,
        is_paid: Boolean(is_paid),
        payment_method:
            typeof payment_method === 'string' && Object.values(PaymentMethod).includes(payment_method as PaymentMethod)
                ? payment_method as PaymentMethod
                : undefined,
        qr_proof_image_url: typeof qr_proof_image_url === 'string' ? qr_proof_image_url : undefined,
    }, userId);

    // Transform response to match required format
    if (!result.error && result.data) {
        return res.status(result.code).json({
            data: transformAdminBooking(result.data),
        });
    }

    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/bookings/batch
 * Create multiple recurring bookings on behalf of a customer or guest.
 */
export async function createRecurringBookings(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const userId = req.authUser?.id;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const {
        staff_id,
        customer_id,
        customer,
        notes,
        sessions,
    } = req.body;

    const parsedStaffId = parseInt(staff_id);
    if (isNaN(parsedStaffId)) {
        return res.status(400).json({
            code: 400,
            message: 'Invalid staff_id format',
            error: true,
        });
    }

    if (!Array.isArray(sessions) || sessions.length === 0) {
        return res.status(400).json({
            code: 400,
            message: 'sessions must be a non-empty array',
            error: true,
        });
    }

    let client_name, client_email, client_phone;
    if (customer) {
        client_name = customer.full_name;
        client_email = customer.email;
        client_phone = customer.phone;
    }

    const normalizedSessions = sessions.map((session: any) => ({
        service_ids: Array.isArray(session?.service_ids) ? session.service_ids.map(Number) : [],
        start_at: session?.start_at,
        is_paid: Boolean(session?.is_paid),
        payment_method:
            typeof session?.payment_method === 'string' && Object.values(PaymentMethod).includes(session.payment_method as PaymentMethod)
                ? session.payment_method as PaymentMethod
                : undefined,
        qr_proof_image_url: typeof session?.qr_proof_image_url === 'string' ? session.qr_proof_image_url : undefined,
    }));

    const result = await AdminBookingService.createRecurringBookings({
        companyId,
        staff_id: parsedStaffId,
        customer_id: customer_id ? Number(customer_id) : undefined,
        client_name,
        client_phone,
        client_email,
        notes,
        sessions: normalizedSessions,
    }, userId);

    if (!result.error && Array.isArray(result.data)) {
        return res.status(result.code).json({
            data: result.data.map((booking: any) => transformAdminBooking(booking)),
        });
    }

    return res.status(result.code).json(result);
}

/**
 * GET /api/admin/bookings/reminders/today/preview
 * Returns today's bookings reminder candidates.
 */
export async function getTodayReminderPreview(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await AdminBookingService.getTodayReminderPreview(companyId);
    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/bookings/:id/reminders/today
 * Sends today's reminder for a specific booking.
 */
export async function sendTodayReminder(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const bookingId = parseInt(req.params.id as string);

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

    const result = await AdminBookingService.sendTodayReminderForBooking(companyId, bookingId);
    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/bookings/:id/notifications/no-show
 * Sends no-show notification for a specific booking.
 */
export async function sendNoShowNotification(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const bookingId = parseInt(req.params.id as string);
    const { channel, message } = req.body || {};

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

    if (channel !== undefined) {
        const allowed = ['AUTO', 'WHATSAPP', 'EMAIL'];
        if (typeof channel !== 'string' || !allowed.includes(channel)) {
            mensaje = {
                code: 400,
                message: 'Invalid notification channel',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    if (message !== undefined && typeof message !== 'string') {
        mensaje = {
            code: 400,
            message: 'Invalid message format',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await AdminBookingService.sendNoShowNotificationForBooking(companyId, bookingId, {
        channel,
        message,
    });
    return res.status(result.code).json(result);
}
