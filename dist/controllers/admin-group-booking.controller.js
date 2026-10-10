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
exports.confirmEventBooking = confirmEventBooking;
exports.unconfirmEventBooking = unconfirmEventBooking;
exports.approveEventBookingQrPayment = approveEventBookingQrPayment;
exports.cancelEventBooking = cancelEventBooking;
exports.sendEventMassMessage = sendEventMassMessage;
exports.streamEventMassMessage = streamEventMassMessage;
exports.sendClassMassMessage = sendClassMassMessage;
exports.confirmClassEnrollment = confirmClassEnrollment;
exports.unconfirmClassEnrollment = unconfirmClassEnrollment;
exports.cancelClassEnrollment = cancelClassEnrollment;
exports.issueClassEnrollmentTicket = issueClassEnrollmentTicket;
exports.confirmClassEnrollmentPayment = confirmClassEnrollmentPayment;
exports.checkInEvent = checkInEvent;
exports.checkInClassSession = checkInClassSession;
exports.setClassSessionAttendanceStatus = setClassSessionAttendanceStatus;
exports.checkInByTicket = checkInByTicket;
exports.getAttendanceSummary = getAttendanceSummary;
exports.listTickets = listTickets;
exports.getTicketByCode = getTicketByCode;
exports.resendTicket = resendTicket;
exports.cancelTicket = cancelTicket;
exports.listEnrollmentInstallments = listEnrollmentInstallments;
exports.markInstallmentPaid = markInstallmentPaid;
exports.updateEnrollmentInstallments = updateEnrollmentInstallments;
exports.confirmInstallmentQrPayment = confirmInstallmentQrPayment;
exports.listGroupPayments = listGroupPayments;
exports.sendInstallmentReminder = sendInstallmentReminder;
exports.bulkSendInstallmentReminders = bulkSendInstallmentReminders;
exports.listInstallmentReminders = listInstallmentReminders;
exports.getGroupMetrics = getGroupMetrics;
const client_1 = require("@prisma/client");
const GroupBookingService = __importStar(require("../services/group-booking.service"));
const GroupAttendanceService = __importStar(require("../services/group-attendance.service"));
const GroupTicketService = __importStar(require("../services/group-ticket.service"));
const GroupMetricsService = __importStar(require("../services/group-metrics.service"));
const InstallmentService = __importStar(require("../services/enrollment-installment.service"));
const GroupPaymentsService = __importStar(require("../services/group-payments.service"));
function parseId(raw) {
    if (!raw)
        return null;
    const normalized = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function requireCompanyId(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
        return null;
    }
    return companyId;
}
function parseCheckInMethod(raw) {
    return raw === client_1.CheckInMethod.QR_SCAN ? client_1.CheckInMethod.QR_SCAN : client_1.CheckInMethod.MANUAL;
}
function parseTicketStatus(raw) {
    if (raw === client_1.TicketStatus.ACTIVE || raw === client_1.TicketStatus.USED || raw === client_1.TicketStatus.CANCELLED || raw === client_1.TicketStatus.EXPIRED) {
        return raw;
    }
    return undefined;
}
function parseItemStatus(raw) {
    if (raw === 'DRAFT' || raw === 'PUBLISHED' || raw === 'ARCHIVED') {
        return raw;
    }
    return undefined;
}
function parseBookingStatus(raw) {
    if (raw === 'PENDING' || raw === 'CONFIRMED' || raw === 'CANCELLED' || raw === 'WAITLISTED') {
        return raw;
    }
    return undefined;
}
function parseFreePaid(raw) {
    if (raw === 'FREE' || raw === 'PAID')
        return raw;
    return undefined;
}
function parseDateQuery(raw) {
    if (typeof raw !== 'string' || raw.trim().length === 0)
        return undefined;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime()))
        return undefined;
    return date;
}
function parsePositiveInt(raw) {
    if (typeof raw !== 'string' || raw.trim().length === 0)
        return undefined;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return undefined;
    return parsed;
}
function parseEventMassMessagePayload(body) {
    const { message, delivery_mode, selected_targets, idempotency_key } = (body ?? {});
    return {
        message: message || '',
        idempotency_key: typeof idempotency_key === 'string' ? idempotency_key.trim() || undefined : undefined,
        delivery_mode: delivery_mode === 'WHATSAPP'
            || delivery_mode === 'EMAIL'
            || delivery_mode === 'BOTH'
            || delivery_mode === 'AUTO'
            ? delivery_mode
            : undefined,
        selected_targets: Array.isArray(selected_targets)
            ? selected_targets
                .filter((target) => (target?.source === 'GROUP_EVENT_BOOKING' || target?.source === 'FREE_REGISTRATION')
                && Number.isInteger(target?.id)
                && Number(target.id) > 0)
                .map((target) => ({
                source: target.source,
                id: Number(target.id),
            }))
            : undefined,
    };
}
function parseClassMassMessagePayload(body) {
    const { message, delivery_mode, selected_targets, idempotency_key } = (body ?? {});
    return {
        message: message || '',
        idempotency_key: typeof idempotency_key === 'string' ? idempotency_key.trim() || undefined : undefined,
        delivery_mode: delivery_mode === 'WHATSAPP'
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
function writeSseEvent(res, event, payload) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
async function confirmEventBooking(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const bookingId = parseId(req.params.bookingId);
    if (!bookingId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid bookingId' });
    }
    const result = await GroupBookingService.confirmEventBooking(companyId, bookingId);
    return res.status(result.code).json(result);
}
async function unconfirmEventBooking(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const bookingId = parseId(req.params.bookingId);
    if (!bookingId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid bookingId' });
    }
    const result = await GroupBookingService.unconfirmEventBooking(companyId, bookingId);
    return res.status(result.code).json(result);
}
async function approveEventBookingQrPayment(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const bookingId = parseId(req.params.bookingId);
    if (!bookingId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid bookingId' });
    }
    const result = await GroupBookingService.approveEventBookingQrPayment(companyId, bookingId);
    return res.status(result.code).json(result);
}
async function cancelEventBooking(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const bookingId = parseId(req.params.bookingId);
    if (!bookingId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid bookingId' });
    }
    const result = await GroupBookingService.cancelEventBooking(companyId, bookingId);
    return res.status(result.code).json(result);
}
async function sendEventMassMessage(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupBookingService.sendEventMassMessage(companyId, eventId, parseEventMassMessagePayload(req.body));
    return res.status(result.code).json(result);
}
async function streamEventMassMessage(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
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
        const result = await GroupBookingService.sendEventMassMessageWithProgress(companyId, eventId, parseEventMassMessagePayload(req.body), async (progress) => {
            writeSseEvent(res, 'progress', progress);
        });
        if (result.error) {
            writeSseEvent(res, 'error', {
                code: result.code,
                message: result.message,
            });
        }
        else {
            writeSseEvent(res, 'complete', result.data);
        }
    }
    catch (error) {
        writeSseEvent(res, 'error', {
            code: 500,
            message: error instanceof Error ? error.message : 'Failed to stream event mass message',
        });
    }
    finally {
        res.end();
    }
}
async function sendClassMassMessage(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const result = await GroupBookingService.sendClassMassMessage(companyId, classId, parseClassMassMessagePayload(req.body));
    return res.status(result.code).json(result);
}
async function confirmClassEnrollment(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }
    const result = await GroupBookingService.confirmClassEnrollment(companyId, enrollmentId);
    return res.status(result.code).json(result);
}
async function unconfirmClassEnrollment(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }
    const result = await GroupBookingService.unconfirmClassEnrollment(companyId, enrollmentId);
    return res.status(result.code).json(result);
}
async function cancelClassEnrollment(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }
    const result = await GroupBookingService.cancelClassEnrollment(companyId, enrollmentId);
    return res.status(result.code).json(result);
}
async function issueClassEnrollmentTicket(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }
    const result = await GroupTicketService.issueClassTicketForEnrollment(companyId, enrollmentId);
    return res.status(result.code).json(result);
}
async function confirmClassEnrollmentPayment(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }
    const result = await GroupBookingService.confirmClassEnrollmentPayment(companyId, enrollmentId);
    return res.status(result.code).json(result);
}
async function checkInEvent(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const payload = req.validated ?? req.body;
    const result = await GroupAttendanceService.checkInEventAttendance(companyId, eventId, payload.user_id, parseCheckInMethod(payload.method));
    return res.status(result.code).json(result);
}
async function checkInClassSession(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }
    const payload = req.validated ?? req.body;
    const result = await GroupAttendanceService.checkInClassSessionAttendance(companyId, sessionId, payload.user_id, parseCheckInMethod(payload.method));
    return res.status(result.code).json(result);
}
async function setClassSessionAttendanceStatus(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }
    const payload = req.validated ?? req.body;
    const result = await GroupAttendanceService.setClassSessionAttendanceStatus(companyId, sessionId, payload.user_id, payload.status, parseCheckInMethod(payload.method));
    return res.status(result.code).json(result);
}
async function checkInByTicket(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const payload = req.validated ?? req.body;
    const result = await GroupAttendanceService.checkInByTicketCode(companyId, {
        ticket_code: payload.ticket_code,
        qr_token: payload.qr_token,
        class_session_id: payload.class_session_id,
        event_id: payload.event_id,
    }, parseCheckInMethod(payload.method ?? client_1.CheckInMethod.QR_SCAN));
    return res.status(result.code).json(result);
}
async function getAttendanceSummary(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const result = await GroupAttendanceService.getAttendanceSummary(companyId);
    return res.status(result.code).json(result);
}
async function listTickets(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
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
async function getTicketByCode(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const ticketCode = typeof req.params.ticketCode === 'string' ? req.params.ticketCode.trim() : '';
    if (!ticketCode) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid ticketCode' });
    }
    const result = await GroupTicketService.getTicketByCode(companyId, ticketCode);
    return res.status(result.code).json(result);
}
async function resendTicket(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const ticketCode = typeof req.params.ticketCode === 'string' ? req.params.ticketCode.trim() : '';
    if (!ticketCode) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid ticketCode' });
    }
    const result = await GroupTicketService.resendTicketByCode(companyId, ticketCode);
    return res.status(result.code).json(result);
}
async function cancelTicket(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const ticketCode = typeof req.params.ticketCode === 'string' ? req.params.ticketCode.trim() : '';
    if (!ticketCode) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid ticketCode' });
    }
    const result = await GroupTicketService.cancelTicketByCode(companyId, ticketCode);
    return res.status(result.code).json(result);
}
async function listEnrollmentInstallments(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }
    const result = await InstallmentService.listInstallments(companyId, enrollmentId);
    return res.status(result.code).json(result);
}
async function markInstallmentPaid(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
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
async function updateEnrollmentInstallments(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
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
async function confirmInstallmentQrPayment(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
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
async function listGroupPayments(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const result = await GroupPaymentsService.listCompanyGroupPayments(companyId, {
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        customer_key: typeof req.query.customer_key === 'string' ? req.query.customer_key : undefined,
        class_id: parsePositiveInt(req.query.class_id),
        payment_status: req.query.payment_status,
        payment_method: req.query.payment_method,
        row_type: req.query.row_type,
        due_window: req.query.due_window,
        overdue_only: req.query.overdue_only === 'true',
        page: parsePositiveInt(req.query.page),
        limit: parsePositiveInt(req.query.limit),
    });
    return res.status(result.code).json(result);
}
async function sendInstallmentReminder(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
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
async function bulkSendInstallmentReminders(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const adminUserId = req.authUser?.id;
    if (!adminUserId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const payload = req.validated ?? req.body ?? {};
    const result = await GroupPaymentsService.bulkSendInstallmentReminders(companyId, adminUserId, {
        installment_ids: Array.isArray(payload.installment_ids) ? payload.installment_ids : undefined,
        overdue_only: payload.overdue_only === true,
        class_id: typeof payload.class_id === 'number' ? payload.class_id : parsePositiveInt(payload.class_id),
        customer_key: typeof payload.customer_key === 'string' ? payload.customer_key : undefined,
    });
    return res.status(result.code).json(result);
}
async function listInstallmentReminders(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const installmentId = parseId(req.params.installmentId);
    if (!installmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid installmentId' });
    }
    const result = await GroupPaymentsService.listInstallmentReminderLogs(companyId, installmentId);
    return res.status(result.code).json(result);
}
async function getGroupMetrics(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
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
