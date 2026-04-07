import { Response } from 'express';
import { CheckInMethod, TicketStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as GroupBookingService from '../services/group-booking.service';
import * as GroupAttendanceService from '../services/group-attendance.service';
import * as GroupTicketService from '../services/group-ticket.service';
import * as GroupMetricsService from '../services/group-metrics.service';
import * as InstallmentService from '../services/enrollment-installment.service';

function parseId(raw: string | string[] | undefined): number | null {
    if (!raw) return null;
    const normalized = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function requireCompanyId(req: AuthenticatedRequest, res: Response): number | null {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
        return null;
    }
    return companyId;
}

function parseCheckInMethod(raw: unknown): CheckInMethod {
    return raw === CheckInMethod.QR_SCAN ? CheckInMethod.QR_SCAN : CheckInMethod.MANUAL;
}

function parseTicketStatus(raw: unknown): TicketStatus | undefined {
    if (raw === TicketStatus.ACTIVE || raw === TicketStatus.USED || raw === TicketStatus.CANCELLED || raw === TicketStatus.EXPIRED) {
        return raw;
    }

    return undefined;
}

function parseItemStatus(raw: unknown): 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | undefined {
    if (raw === 'DRAFT' || raw === 'PUBLISHED' || raw === 'ARCHIVED') {
        return raw;
    }
    return undefined;
}

function parseBookingStatus(raw: unknown): 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLISTED' | undefined {
    if (raw === 'PENDING' || raw === 'CONFIRMED' || raw === 'CANCELLED' || raw === 'WAITLISTED') {
        return raw;
    }
    return undefined;
}

function parseFreePaid(raw: unknown): 'FREE' | 'PAID' | undefined {
    if (raw === 'FREE' || raw === 'PAID') return raw;
    return undefined;
}

function parseDateQuery(raw: unknown): Date | undefined {
    if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return undefined;
    return date;
}

export async function confirmEventBooking(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const bookingId = parseId(req.params.bookingId);
    if (!bookingId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid bookingId' });
    }

    const result = await GroupBookingService.confirmEventBooking(companyId, bookingId);
    return res.status(result.code).json(result);
}

export async function unconfirmEventBooking(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const bookingId = parseId(req.params.bookingId);
    if (!bookingId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid bookingId' });
    }

    const result = await GroupBookingService.unconfirmEventBooking(companyId, bookingId);
    return res.status(result.code).json(result);
}

export async function cancelEventBooking(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const bookingId = parseId(req.params.bookingId);
    if (!bookingId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid bookingId' });
    }

    const result = await GroupBookingService.cancelEventBooking(companyId, bookingId);
    return res.status(result.code).json(result);
}

export async function confirmClassEnrollment(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }

    const result = await GroupBookingService.confirmClassEnrollment(companyId, enrollmentId);
    return res.status(result.code).json(result);
}

export async function unconfirmClassEnrollment(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }

    const result = await GroupBookingService.unconfirmClassEnrollment(companyId, enrollmentId);
    return res.status(result.code).json(result);
}

export async function cancelClassEnrollment(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }

    const result = await GroupBookingService.cancelClassEnrollment(companyId, enrollmentId);
    return res.status(result.code).json(result);
}

export async function checkInEvent(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await GroupAttendanceService.checkInEventAttendance(
        companyId,
        eventId,
        payload.user_id,
        parseCheckInMethod(payload.method),
    );

    return res.status(result.code).json(result);
}

export async function checkInClassSession(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await GroupAttendanceService.checkInClassSessionAttendance(
        companyId,
        sessionId,
        payload.user_id,
        parseCheckInMethod(payload.method),
    );

    return res.status(result.code).json(result);
}

export async function checkInByTicket(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const payload = (req as any).validated ?? req.body;
    const result = await GroupAttendanceService.checkInByTicketCode(
        companyId,
        {
            ticket_code: payload.ticket_code,
            qr_token: payload.qr_token,
            class_session_id: payload.class_session_id,
            event_id: payload.event_id,
        },
        parseCheckInMethod(payload.method ?? CheckInMethod.QR_SCAN),
    );

    return res.status(result.code).json(result);
}

export async function getAttendanceSummary(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const result = await GroupAttendanceService.getAttendanceSummary(companyId);
    return res.status(result.code).json(result);
}

export async function listTickets(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const status = parseTicketStatus(req.query.status);
    const eventBookingId = parseId(typeof req.query.event_booking_id === 'string' ? req.query.event_booking_id : undefined) ?? undefined;
    const classEnrollmentId = parseId(typeof req.query.class_enrollment_id === 'string' ? req.query.class_enrollment_id : undefined) ?? undefined;

    const result = await GroupTicketService.listCompanyTickets(companyId, {
        status,
        eventBookingId,
        classEnrollmentId,
    });

    return res.status(result.code).json(result);
}

export async function getTicketByCode(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const ticketCode = typeof req.params.ticketCode === 'string' ? req.params.ticketCode.trim() : '';
    if (!ticketCode) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid ticketCode' });
    }

    const result = await GroupTicketService.getTicketByCode(companyId, ticketCode);
    return res.status(result.code).json(result);
}

export async function resendTicket(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const ticketCode = typeof req.params.ticketCode === 'string' ? req.params.ticketCode.trim() : '';
    if (!ticketCode) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid ticketCode' });
    }

    const result = await GroupTicketService.resendTicketByCode(companyId, ticketCode);
    return res.status(result.code).json(result);
}

export async function cancelTicket(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const ticketCode = typeof req.params.ticketCode === 'string' ? req.params.ticketCode.trim() : '';
    if (!ticketCode) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid ticketCode' });
    }

    const result = await GroupTicketService.cancelTicketByCode(companyId, ticketCode);
    return res.status(result.code).json(result);
}

export async function listEnrollmentInstallments(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }

    const result = await InstallmentService.listInstallments(companyId, enrollmentId);
    return res.status(result.code).json(result);
}

export async function markInstallmentPaid(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const installmentId = parseId(req.params.installmentId);
    if (!installmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid installmentId' });
    }

    const adminUserId = req.authUser?.id;
    if (!adminUserId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const rawMethod = req.body?.payment_method;
    const paymentMethod = rawMethod === 'QR' ? 'QR' : 'CASH';

    const result = await InstallmentService.markInstallmentPaid(companyId, installmentId, adminUserId, paymentMethod);
    return res.status(result.code).json(result);
}

export async function confirmInstallmentQrPayment(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const installmentId = parseId(req.params.installmentId);
    if (!installmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid installmentId' });
    }

    const adminUserId = req.authUser?.id;
    if (!adminUserId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const result = await InstallmentService.confirmInstallmentQrPayment(companyId, installmentId, adminUserId);
    return res.status(result.code).json(result);
}

export async function getGroupMetrics(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(typeof req.query.event_id === 'string' ? req.query.event_id : undefined) ?? undefined;
    const classId = parseId(typeof req.query.class_id === 'string' ? req.query.class_id : undefined) ?? undefined;
    const itemStatus = parseItemStatus(req.query.item_status);
    const bookingStatus = parseBookingStatus(req.query.booking_status);
    const freePaid = parseFreePaid(req.query.free_paid);
    const dateFrom = parseDateQuery(req.query.date_from);
    const dateTo = parseDateQuery(req.query.date_to);

    const result = await GroupMetricsService.getGroupMetrics(companyId, {
        date_from: dateFrom,
        date_to: dateTo,
        event_id: eventId,
        class_id: classId,
        item_status: itemStatus,
        booking_status: bookingStatus,
        free_paid: freePaid,
    });

    return res.status(result.code).json(result);
}
