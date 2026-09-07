import { Response } from 'express';
import { CheckInMethod, TicketStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as GroupBookingService from '../services/group-booking.service';
import * as GroupAttendanceService from '../services/group-attendance.service';
import * as GroupTicketService from '../services/group-ticket.service';
import * as GroupMetricsService from '../services/group-metrics.service';
import * as InstallmentService from '../services/enrollment-installment.service';
import * as GroupPaymentsService from '../services/group-payments.service';

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

function parsePositiveInt(raw: unknown): number | undefined {
    if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
    return parsed;
}

function parseEventMassMessagePayload(body: unknown): {
    message: string;
    delivery_mode?: 'AUTO' | 'WHATSAPP' | 'EMAIL' | 'BOTH';
    idempotency_key?: string;
    selected_targets?: Array<{ source: 'GROUP_EVENT_BOOKING' | 'FREE_REGISTRATION'; id: number }>;
} {
    const { message, delivery_mode, selected_targets, idempotency_key } = (body ?? {}) as {
        message?: string;
        delivery_mode?: string;
        idempotency_key?: string;
        selected_targets?: Array<{ source?: string; id?: number }>;
    };

    return {
        message: message || '',
        idempotency_key: typeof idempotency_key === 'string' ? idempotency_key.trim() || undefined : undefined,
        delivery_mode:
            delivery_mode === 'WHATSAPP'
            || delivery_mode === 'EMAIL'
            || delivery_mode === 'BOTH'
            || delivery_mode === 'AUTO'
                ? delivery_mode
                : undefined,
        selected_targets: Array.isArray(selected_targets)
            ? selected_targets
                .filter((target) =>
                    (target?.source === 'GROUP_EVENT_BOOKING' || target?.source === 'FREE_REGISTRATION')
                    && Number.isInteger(target?.id)
                    && Number(target.id) > 0,
                )
                .map((target) => ({
                    source: target.source as 'GROUP_EVENT_BOOKING' | 'FREE_REGISTRATION',
                    id: Number(target.id),
                }))
            : undefined,
    };
}

function parseClassMassMessagePayload(body: unknown): {
    message: string;
    delivery_mode?: 'AUTO' | 'WHATSAPP' | 'EMAIL' | 'BOTH';
    idempotency_key?: string;
    selected_targets?: Array<{ id: number }>;
} {
    const { message, delivery_mode, selected_targets, idempotency_key } = (body ?? {}) as {
        message?: string;
        delivery_mode?: string;
        idempotency_key?: string;
        selected_targets?: Array<{ id?: number }>;
    };

    return {
        message: message || '',
        idempotency_key: typeof idempotency_key === 'string' ? idempotency_key.trim() || undefined : undefined,
        delivery_mode:
            delivery_mode === 'WHATSAPP'
            || delivery_mode === 'EMAIL'
            || delivery_mode === 'BOTH'
            || delivery_mode === 'AUTO'
                ? delivery_mode
                : undefined,
        selected_targets: Array.isArray(selected_targets)
            ? selected_targets
                .filter((target) => Number.isInteger(target?.id) && Number(target.id) > 0)
                .map((target) => ({ id: Number(target.id) }))
            : undefined,
    };
}

function writeSseEvent(res: Response, event: string, payload: unknown) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
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

export async function approveEventBookingQrPayment(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const bookingId = parseId(req.params.bookingId);
    if (!bookingId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid bookingId' });
    }

    const result = await GroupBookingService.approveEventBookingQrPayment(companyId, bookingId);
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

export async function sendEventMassMessage(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupBookingService.sendEventMassMessage(companyId, eventId, parseEventMassMessagePayload(req.body));
    return res.status(result.code).json(result);
}

export async function streamEventMassMessage(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    try {
        const result = await GroupBookingService.sendEventMassMessageWithProgress(
            companyId,
            eventId,
            parseEventMassMessagePayload(req.body),
            async (progress) => {
                writeSseEvent(res, 'progress', progress);
            },
        );

        if (result.error) {
            writeSseEvent(res, 'error', {
                code: result.code,
                message: result.message,
            });
        } else {
            writeSseEvent(res, 'complete', result.data);
        }
    } catch (error) {
        writeSseEvent(res, 'error', {
            code: 500,
            message: error instanceof Error ? error.message : 'Failed to stream event mass message',
        });
    } finally {
        res.end();
    }
}

export async function sendClassMassMessage(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const result = await GroupBookingService.sendClassMassMessage(
        companyId,
        classId,
        parseClassMassMessagePayload(req.body),
    );
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

export async function issueClassEnrollmentTicket(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }

    const result = await GroupTicketService.issueClassTicketForEnrollment(companyId, enrollmentId);
    return res.status(result.code).json(result);
}

export async function confirmClassEnrollmentPayment(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }

    const result = await GroupBookingService.confirmClassEnrollmentPayment(companyId, enrollmentId);
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

export async function setClassSessionAttendanceStatus(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await GroupAttendanceService.setClassSessionAttendanceStatus(
        companyId,
        sessionId,
        payload.user_id,
        payload.status,
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

export async function updateEnrollmentInstallments(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }

    const adminUserId = req.authUser?.id;
    if (!adminUserId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const installments = Array.isArray(req.body?.installments) ? req.body.installments : [];
    const result = await InstallmentService.updateInstallments(companyId, enrollmentId, adminUserId, installments);
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

export async function listGroupPayments(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const result = await GroupPaymentsService.listCompanyGroupPayments(companyId, {
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        customer_key: typeof req.query.customer_key === 'string' ? req.query.customer_key : undefined,
        class_id: parsePositiveInt(req.query.class_id),
        payment_status: req.query.payment_status as any,
        payment_method: req.query.payment_method as any,
        row_type: req.query.row_type as any,
        due_window: req.query.due_window as any,
        overdue_only: req.query.overdue_only === 'true',
        page: parsePositiveInt(req.query.page),
        limit: parsePositiveInt(req.query.limit),
    });

    return res.status(result.code).json(result);
}

export async function sendInstallmentReminder(req: AuthenticatedRequest, res: Response) {
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

    const result = await GroupPaymentsService.sendInstallmentReminder(companyId, installmentId, adminUserId);
    return res.status(result.code).json(result);
}

export async function bulkSendInstallmentReminders(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const adminUserId = req.authUser?.id;
    if (!adminUserId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const payload = (req as any).validated ?? req.body ?? {};
    const result = await GroupPaymentsService.bulkSendInstallmentReminders(companyId, adminUserId, {
        installment_ids: Array.isArray(payload.installment_ids) ? payload.installment_ids : undefined,
        overdue_only: payload.overdue_only === true,
        class_id: typeof payload.class_id === 'number' ? payload.class_id : parsePositiveInt(payload.class_id),
        customer_key: typeof payload.customer_key === 'string' ? payload.customer_key : undefined,
    });
    return res.status(result.code).json(result);
}

export async function listInstallmentReminders(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const installmentId = parseId(req.params.installmentId);
    if (!installmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid installmentId' });
    }

    const result = await GroupPaymentsService.listInstallmentReminderLogs(companyId, installmentId);
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
