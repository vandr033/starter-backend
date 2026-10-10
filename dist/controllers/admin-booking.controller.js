"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookings = getBookings;
exports.updateBooking = updateBooking;
exports.getRescheduleOptions = getRescheduleOptions;
exports.rescheduleBooking = rescheduleBooking;
exports.createBooking = createBooking;
exports.createRecurringBookings = createRecurringBookings;
exports.getTodayReminderPreview = getTodayReminderPreview;
exports.sendTodayReminder = sendTodayReminder;
exports.sendNoShowNotification = sendNoShowNotification;
const AdminBookingService = __importStar(require("../services/admin-booking.service"));
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const booking_status_1 = require("../utils/booking-status");
let mensaje;
function transformAdminBooking(booking) {
    return {
        id: booking.id,
        status: (0, booking_status_1.getBookingLifecycleStatus)(booking.status, booking.notes),
        start_at: booking.start_at,
        end_at: booking.end_at,
        created_at: booking.created_at,
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
        services: booking.booking_services.map((bs) => ({
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
        internal_notes: booking.internal_notes,
        payment_method: booking.payment_method,
        payment_status: booking.payment_status,
        qr_proof_image_url: booking.qr_proof_image_url,
    };
}
/**
 * GET /api/admin/bookings
 * Get bookings with filters
 */
async function getBookings(req, res) {
    const companyId = req.companyID;
    const companyUser = req.companyUser;
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
    const { start, end, status, staff_id, } = req.query;
    // Parse status
    let parsedStatus;
    if (status && typeof status === 'string') {
        if (Object.values(client_1.BookingStatus).includes(status)) {
            parsedStatus = status;
        }
    }
    // Parse staff_id
    const parsedStaffId = staff_id ? parseInt(staff_id) : undefined;
    if (staff_id && isNaN(parsedStaffId)) {
        mensaje = {
            code: 400,
            message: 'Invalid staff_id format',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    let effectiveStaffId = parsedStaffId;
    if (companyUser?.role === client_1.CompanyUserRole.STAFF) {
        if (!authUserId) {
            return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
        }
        const staffProfile = await client_2.prisma.staffProfile.findFirst({
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
        startDate: start,
        endDate: end,
        status: parsedStatus,
        staffId: effectiveStaffId,
    });
    // Transform response to match required format
    if (!result.error && result.data) {
        const transformedData = result.data.bookings.map((booking) => transformAdminBooking(booking));
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
async function updateBooking(req, res) {
    const companyId = req.companyID;
    const bookingId = parseInt(req.params.id);
    const userId = req.authUser?.id;
    const companyUser = req.companyUser;
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
    const { status, start_at, notes, internal_notes, staff_id, service_ids, } = req.body;
    // Parse status
    let parsedStatus;
    if (status !== undefined) {
        if (typeof status === 'string' && Object.values(client_1.BookingStatus).includes(status)) {
            parsedStatus = status;
        }
        else {
            mensaje = {
                code: 400,
                message: 'Invalid status value',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }
    // Parse staff_id
    let parsedStaffId;
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
    let parsedServiceIds;
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
    const result = await AdminBookingService.updateBooking(bookingId, companyId, {
        status: parsedStatus,
        start_at,
        notes,
        internal_notes,
        staff_id: parsedStaffId,
        service_ids: parsedServiceIds,
    }, userId, companyUser?.role);
    // Transform response to match required format
    if (!result.error && result.data) {
        return res.status(result.code).json({
            data: transformAdminBooking(result.data),
        });
    }
    return res.status(result.code).json(result);
}
/**
 * GET /api/admin/bookings/:id/reschedule-options
 * Suggest valid date/time alternatives for an existing booking
 */
async function getRescheduleOptions(req, res) {
    const companyId = req.companyID;
    const bookingId = parseInt(req.params.id);
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            message: 'Company context not found',
            error: true,
        });
    }
    if (isNaN(bookingId)) {
        return res.status(400).json({
            code: 400,
            message: 'Invalid booking ID',
            error: true,
        });
    }
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const result = await AdminBookingService.getBookingRescheduleOptions({
        companyId,
        bookingId,
        date,
    });
    return res.status(result.code).json(result);
}
/**
 * POST /api/admin/bookings/:id/reschedule
 * Change only the start date/time of a booking
 */
async function rescheduleBooking(req, res) {
    const companyId = req.companyID;
    const bookingId = parseInt(req.params.id);
    const userId = req.authUser?.id;
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            message: 'Company context not found',
            error: true,
        });
    }
    if (isNaN(bookingId)) {
        return res.status(400).json({
            code: 400,
            message: 'Invalid booking ID',
            error: true,
        });
    }
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const startAt = typeof req.body?.start_at === 'string' ? req.body.start_at : '';
    if (!startAt.trim()) {
        return res.status(400).json({
            code: 400,
            message: 'start_at is required',
            error: true,
        });
    }
    const result = await AdminBookingService.rescheduleBookingDateTime(bookingId, companyId, {
        start_at: startAt,
        confirm_short_notice: req.body?.confirm_short_notice === true,
    }, userId);
    if (!result.error && result.data?.booking) {
        return res.status(result.code).json({
            code: result.code,
            message: result.message,
            error: false,
            data: {
                booking: transformAdminBooking(result.data.booking),
                audit_log_id: result.data.audit_log_id,
                notification_attempts: result.data.notification_attempts,
            },
        });
    }
    return res.status(result.code).json(result);
}
/**
 * POST /api/admin/bookings
 * Create booking on behalf of customer (for walk-ins)
 */
async function createBooking(req, res) {
    const companyId = req.companyID;
    const userId = req.authUser?.id;
    const companyUser = req.companyUser;
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
    const { staff_id, service_ids, start_at, session_slots, customer_id, customer, notes, internal_notes, is_paid, payment_method, qr_proof_image_url, } = req.body;
    // Validate required fields
    const hasSessionSlots = Array.isArray(session_slots) && session_slots.length > 0;
    if (!staff_id || !service_ids || (!start_at && !hasSessionSlots)) {
        mensaje = {
            code: 400,
            message: 'staff_id, service_ids, and booking time are required',
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
    if (companyUser?.role === client_1.CompanyUserRole.STAFF) {
        const staffProfile = await client_2.prisma.staffProfile.findFirst({
            where: {
                company_id: companyId,
                user_id: userId,
                deleted_at: null,
            },
            select: { id: true },
        });
        if (!staffProfile) {
            return res.status(403).json({
                code: 403,
                message: 'Staff profile not found in this company',
                error: true,
            });
        }
        if (parsedStaffId !== staffProfile.id) {
            return res.status(403).json({
                code: 403,
                message: 'Staff can only create bookings for themselves',
                error: true,
            });
        }
    }
    // Extract customer info if provided
    let client_name, client_email, client_phone, client_phone_prefix;
    if (customer) {
        client_name = customer.full_name;
        client_email = customer.email;
        client_phone = customer.phoneNumber;
        client_phone_prefix = customer.phonePrefix;
    }
    const result = await AdminBookingService.createBooking({
        companyId,
        staff_id: parsedStaffId,
        service_ids,
        start_at,
        session_slots: hasSessionSlots
            ? session_slots
                .map((slot) => ({
                start_at: typeof slot?.start_at === 'string' ? slot.start_at : '',
            }))
                .filter((slot) => slot.start_at)
            : undefined,
        customer_id: customer_id ? Number(customer_id) : undefined,
        client_name,
        client_phone_prefix,
        client_phone_number: client_phone,
        client_email,
        notes,
        internal_notes,
        is_paid: Boolean(is_paid),
        payment_method: typeof payment_method === 'string' && Object.values(client_1.PaymentMethod).includes(payment_method)
            ? payment_method
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
async function createRecurringBookings(req, res) {
    const companyId = req.companyID;
    const userId = req.authUser?.id;
    const companyUser = req.companyUser;
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
    const { staff_id, customer_id, customer, notes, internal_notes, sessions, } = req.body;
    const parsedStaffId = parseInt(staff_id);
    if (isNaN(parsedStaffId)) {
        return res.status(400).json({
            code: 400,
            message: 'Invalid staff_id format',
            error: true,
        });
    }
    if (companyUser?.role === client_1.CompanyUserRole.STAFF) {
        const staffProfile = await client_2.prisma.staffProfile.findFirst({
            where: {
                company_id: companyId,
                user_id: userId,
                deleted_at: null,
            },
            select: { id: true },
        });
        if (!staffProfile) {
            return res.status(403).json({
                code: 403,
                message: 'Staff profile not found in this company',
                error: true,
            });
        }
        if (parsedStaffId !== staffProfile.id) {
            return res.status(403).json({
                code: 403,
                message: 'Staff can only create bookings for themselves',
                error: true,
            });
        }
    }
    if (!Array.isArray(sessions) || sessions.length === 0) {
        return res.status(400).json({
            code: 400,
            message: 'sessions must be a non-empty array',
            error: true,
        });
    }
    let client_name, client_email, client_phone, client_phone_prefix;
    if (customer) {
        client_name = customer.full_name;
        client_email = customer.email;
        client_phone = customer.phoneNumber;
        client_phone_prefix = customer.phonePrefix;
    }
    const normalizedSessions = sessions.map((session) => ({
        service_ids: Array.isArray(session?.service_ids) ? session.service_ids.map(Number) : [],
        start_at: session?.start_at,
        is_paid: Boolean(session?.is_paid),
        payment_method: typeof session?.payment_method === 'string' && Object.values(client_1.PaymentMethod).includes(session.payment_method)
            ? session.payment_method
            : undefined,
        qr_proof_image_url: typeof session?.qr_proof_image_url === 'string' ? session.qr_proof_image_url : undefined,
    }));
    const result = await AdminBookingService.createRecurringBookings({
        companyId,
        staff_id: parsedStaffId,
        customer_id: customer_id ? Number(customer_id) : undefined,
        client_name,
        client_phone_prefix,
        client_phone_number: client_phone,
        client_email,
        notes,
        internal_notes,
        sessions: normalizedSessions,
    }, userId);
    if (!result.error && Array.isArray(result.data)) {
        return res.status(result.code).json({
            data: result.data.map((booking) => transformAdminBooking(booking)),
        });
    }
    return res.status(result.code).json(result);
}
/**
 * GET /api/admin/bookings/reminders/today/preview
 * Returns today's bookings reminder candidates.
 */
async function getTodayReminderPreview(req, res) {
    const companyId = req.companyID;
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
async function sendTodayReminder(req, res) {
    const companyId = req.companyID;
    const bookingId = parseInt(req.params.id);
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
async function sendNoShowNotification(req, res) {
    const companyId = req.companyID;
    const bookingId = parseInt(req.params.id);
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
