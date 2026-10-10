"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkInEventAttendance = checkInEventAttendance;
exports.checkInClassSessionAttendance = checkInClassSessionAttendance;
exports.setClassSessionAttendanceStatus = setClassSessionAttendanceStatus;
exports.checkInByTicketCode = checkInByTicketCode;
exports.listEventAttendance = listEventAttendance;
exports.listClassSessionAttendance = listClassSessionAttendance;
exports.getAttendanceSummary = getAttendanceSummary;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const plan_enforcement_service_1 = require("./plan-enforcement.service");
const group_ticket_service_1 = require("./group-ticket.service");
const group_ticket_qr_service_1 = require("./group-ticket-qr.service");
const enrollment_installment_service_1 = require("./enrollment-installment.service");
function buildScanResponse(scanStatus, message, data) {
    return {
        code: 200,
        error: false,
        message,
        data: {
            scan_status: scanStatus,
            ...data,
        },
    };
}
async function checkInEventAttendance(companyId, eventId, userId, method = client_1.CheckInMethod.MANUAL) {
    const canUseEvents = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'GROUP_EVENTS');
    if (!canUseEvents) {
        return { code: 403, error: true, message: 'Group events require Business plan or higher' };
    }
    const booking = await client_2.prisma.groupEventBooking.findFirst({
        where: {
            company_id: companyId,
            group_event_id: eventId,
            user_id: userId,
            status: 'CONFIRMED',
        },
        select: {
            id: true,
            group_event_id: true,
            customer_profile_id: true,
        },
    });
    if (!booking) {
        return { code: 404, error: true, message: 'Confirmed event booking not found for this user' };
    }
    const existing = await client_2.prisma.groupSessionAttendance.findFirst({
        where: {
            company_id: companyId,
            group_event_id: eventId,
            user_id: userId,
        },
    });
    if (existing?.checked_in_at) {
        return { code: 200, error: false, message: 'Already checked in', data: existing };
    }
    if (existing) {
        const updated = await client_2.prisma.groupSessionAttendance.update({
            where: { id: existing.id },
            data: {
                event_booking_id: booking.id,
                customer_profile_id: booking.customer_profile_id,
                checked_in_at: new Date(),
                checked_in_method: method,
            },
        });
        return { code: 200, error: false, message: 'Checked in', data: updated };
    }
    try {
        const created = await client_2.prisma.groupSessionAttendance.create({
            data: {
                company_id: companyId,
                group_event_id: eventId,
                user_id: userId,
                event_booking_id: booking.id,
                customer_profile_id: booking.customer_profile_id,
                checked_in_at: new Date(),
                checked_in_method: method,
            },
        });
        return { code: 201, error: false, message: 'Checked in', data: created };
    }
    catch (error) {
        if (error?.code === 'P2002') {
            const concurrent = await client_2.prisma.groupSessionAttendance.findFirst({
                where: {
                    company_id: companyId,
                    group_event_id: eventId,
                    user_id: userId,
                },
            });
            if (concurrent) {
                return { code: 200, error: false, message: 'Already checked in', data: concurrent };
            }
        }
        throw error;
    }
}
async function checkInClassSessionAttendance(companyId, sessionId, userId, method = client_1.CheckInMethod.MANUAL) {
    return setClassSessionAttendanceStatus(companyId, sessionId, userId, 'SHOW', method);
}
async function setClassSessionAttendanceStatus(companyId, sessionId, userId, status, method = client_1.CheckInMethod.MANUAL) {
    const canUseClasses = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'GROUP_CLASSES');
    if (!canUseClasses) {
        return { code: 403, error: true, message: 'Group classes require Pro plan' };
    }
    const session = await client_2.prisma.groupClassSession.findFirst({
        where: {
            id: sessionId,
            company_id: companyId,
            cancelled_at: null,
        },
        select: {
            id: true,
            group_class_id: true,
            start_at: true,
        },
    });
    if (!session) {
        return { code: 404, error: true, message: 'Class session not found' };
    }
    const enrollment = await client_2.prisma.groupClassEnrollment.findFirst({
        where: {
            company_id: companyId,
            group_class_id: session.group_class_id,
            user_id: userId,
            status: 'CONFIRMED',
            valid_from: { lte: session.start_at },
            valid_until: { gte: session.start_at },
        },
        select: {
            id: true,
            customer_profile_id: true,
        },
    });
    if (!enrollment) {
        return { code: 404, error: true, message: 'No active confirmed enrollment for this session' };
    }
    const existing = await client_2.prisma.groupSessionAttendance.findFirst({
        where: {
            company_id: companyId,
            group_class_session_id: sessionId,
            user_id: userId,
        },
    });
    if (status === 'SHOW') {
        if (existing?.checked_in_at) {
            return { code: 200, error: false, message: 'Already checked in', data: existing };
        }
        if (existing) {
            const updated = await client_2.prisma.groupSessionAttendance.update({
                where: { id: existing.id },
                data: {
                    enrollment_id: enrollment.id,
                    customer_profile_id: enrollment.customer_profile_id,
                    checked_in_at: new Date(),
                    checked_in_method: method,
                },
            });
            return { code: 200, error: false, message: 'Checked in', data: updated };
        }
        try {
            const created = await client_2.prisma.groupSessionAttendance.create({
                data: {
                    company_id: companyId,
                    group_class_session_id: sessionId,
                    user_id: userId,
                    enrollment_id: enrollment.id,
                    customer_profile_id: enrollment.customer_profile_id,
                    checked_in_at: new Date(),
                    checked_in_method: method,
                },
            });
            return { code: 201, error: false, message: 'Checked in', data: created };
        }
        catch (error) {
            if (error?.code === 'P2002') {
                const concurrent = await client_2.prisma.groupSessionAttendance.findFirst({
                    where: {
                        company_id: companyId,
                        group_class_session_id: sessionId,
                        user_id: userId,
                    },
                });
                if (concurrent) {
                    return { code: 200, error: false, message: 'Already checked in', data: concurrent };
                }
            }
            throw error;
        }
    }
    if (existing) {
        const updated = await client_2.prisma.groupSessionAttendance.update({
            where: { id: existing.id },
            data: {
                enrollment_id: enrollment.id,
                customer_profile_id: enrollment.customer_profile_id,
                checked_in_at: null,
                checked_in_method: null,
            },
        });
        return { code: 200, error: false, message: 'Marked as no-show', data: updated };
    }
    try {
        const created = await client_2.prisma.groupSessionAttendance.create({
            data: {
                company_id: companyId,
                group_class_session_id: sessionId,
                user_id: userId,
                enrollment_id: enrollment.id,
                customer_profile_id: enrollment.customer_profile_id,
                checked_in_at: null,
                checked_in_method: null,
            },
        });
        return { code: 201, error: false, message: 'Marked as no-show', data: created };
    }
    catch (error) {
        if (error?.code === 'P2002') {
            const concurrent = await client_2.prisma.groupSessionAttendance.findFirst({
                where: {
                    company_id: companyId,
                    group_class_session_id: sessionId,
                    user_id: userId,
                },
            });
            if (concurrent) {
                return { code: 200, error: false, message: 'Marked as no-show', data: concurrent };
            }
        }
        throw error;
    }
}
async function checkInByTicketCode(companyId, payload, method = client_1.CheckInMethod.QR_SCAN) {
    const canUseAdvanced = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'GROUP_ADVANCED');
    if (!canUseAdvanced) {
        return { code: 403, error: true, message: 'Ticket scan requires Pro plan' };
    }
    const resolved = (0, group_ticket_qr_service_1.resolveTicketCodeFromScanInput)(companyId, {
        ticket_code: payload.ticket_code,
        qr_token: payload.qr_token,
    });
    if (!resolved.ok || !resolved.ticketCode) {
        return buildScanResponse('INVALID', resolved.error ?? 'Invalid ticket QR payload', {
            reason: 'INVALID_QR',
        });
    }
    const ticket = await client_2.prisma.groupTicket.findFirst({
        where: {
            company_id: companyId,
            ticket_code: resolved.ticketCode,
        },
        include: {
            event_booking: {
                select: {
                    id: true,
                    group_event_id: true,
                    user_id: true,
                    status: true,
                },
            },
            class_enrollment: {
                select: {
                    id: true,
                    group_class_id: true,
                    user_id: true,
                    status: true,
                    valid_from: true,
                    valid_until: true,
                },
            },
        },
    });
    if (!ticket) {
        return buildScanResponse('INVALID', 'Ticket not found', { reason: 'TICKET_NOT_FOUND' });
    }
    if (ticket.status === client_1.TicketStatus.CANCELLED) {
        return buildScanResponse('INVALID', 'Ticket is cancelled', {
            reason: 'TICKET_CANCELLED',
            ticket_code: ticket.ticket_code,
        });
    }
    if (ticket.status === client_1.TicketStatus.EXPIRED) {
        return buildScanResponse('INVALID', 'Ticket is expired', {
            reason: 'TICKET_EXPIRED',
            ticket_code: ticket.ticket_code,
        });
    }
    const now = new Date();
    if (ticket.status === client_1.TicketStatus.ACTIVE && ticket.valid_until < now) {
        await client_2.prisma.groupTicket.update({
            where: { id: ticket.id },
            data: { status: client_1.TicketStatus.EXPIRED },
        });
        return buildScanResponse('INVALID', 'Ticket is expired', {
            reason: 'TICKET_EXPIRED',
            ticket_code: ticket.ticket_code,
        });
    }
    if (ticket.group_event_booking_id && ticket.event_booking) {
        if (payload.event_id && payload.event_id !== ticket.event_booking.group_event_id) {
            return buildScanResponse('INVALID', 'Ticket does not match this event', {
                reason: 'EVENT_MISMATCH',
                ticket_code: ticket.ticket_code,
            });
        }
        if (ticket.event_booking.status !== 'CONFIRMED') {
            return buildScanResponse('INVALID', 'Booking is not confirmed', {
                reason: 'BOOKING_NOT_CONFIRMED',
                ticket_code: ticket.ticket_code,
            });
        }
        if (ticket.status === client_1.TicketStatus.USED) {
            return buildScanResponse('ALREADY_USED', 'Ticket already used', {
                reason: 'TICKET_ALREADY_USED',
                ticket_code: ticket.ticket_code,
                ticket_type: 'EVENT',
            });
        }
        const attendanceResult = await checkInEventAttendance(companyId, ticket.event_booking.group_event_id, ticket.event_booking.user_id, method);
        if (attendanceResult.error) {
            return buildScanResponse('INVALID', attendanceResult.message, {
                reason: 'ATTENDANCE_REJECTED',
                ticket_code: ticket.ticket_code,
            });
        }
        const alreadyCheckedIn = attendanceResult.message.toLowerCase().includes('already');
        const ticketResult = await (0, group_ticket_service_1.markEventTicketUsed)(companyId, ticket.ticket_code);
        if (ticketResult.error && ticketResult.message !== 'Ticket already used') {
            return buildScanResponse('INVALID', ticketResult.message, {
                reason: 'TICKET_USE_FAILED',
                ticket_code: ticket.ticket_code,
            });
        }
        if (ticketResult.message === 'Ticket already used') {
            return buildScanResponse('ALREADY_USED', 'Attendee already checked in', {
                reason: 'ALREADY_CHECKED_IN',
                ticket_code: ticket.ticket_code,
                ticket_type: 'EVENT',
                attendance: attendanceResult.data,
                ticket: ticketResult.data,
            });
        }
        // A booking may contain multiple tickets (booked_spots > 1). In that case,
        // attendance can already exist for the booking owner, but each ticket must
        // still validate once and become USED.
        if (alreadyCheckedIn) {
            return buildScanResponse('VALID', 'Additional event ticket validated', {
                reason: 'ADDITIONAL_TICKET_VALIDATED',
                ticket_code: ticket.ticket_code,
                ticket_type: 'EVENT',
                attendance: attendanceResult.data,
                ticket: ticketResult.data,
            });
        }
        return buildScanResponse('VALID', 'Event attendance validated by ticket', {
            ticket_code: ticket.ticket_code,
            ticket_type: 'EVENT',
            attendance: attendanceResult.data,
            ticket: ticketResult.data,
        });
    }
    if (ticket.group_class_enrollment_id && ticket.class_enrollment) {
        const targetSessionId = payload.class_session_id ?? ticket.group_class_session_id ?? undefined;
        if (!targetSessionId) {
            return buildScanResponse('INVALID', 'Class session is required for class pass validation', {
                reason: 'SESSION_REQUIRED',
                ticket_code: ticket.ticket_code,
            });
        }
        const targetSession = await client_2.prisma.groupClassSession.findFirst({
            where: {
                id: targetSessionId,
                company_id: companyId,
                cancelled_at: null,
            },
            select: {
                id: true,
                group_class_id: true,
                start_at: true,
            },
        });
        if (!targetSession) {
            return buildScanResponse('INVALID', 'Class session not found', {
                reason: 'SESSION_NOT_FOUND',
                ticket_code: ticket.ticket_code,
            });
        }
        if (ticket.class_enrollment.status !== 'CONFIRMED') {
            return buildScanResponse('INVALID', 'Enrollment is not confirmed', {
                reason: 'ENROLLMENT_NOT_CONFIRMED',
                ticket_code: ticket.ticket_code,
            });
        }
        // For FULL_COURSE enrollments, check the current month's installment is paid
        const enrollmentWithPricing = await client_2.prisma.groupClassEnrollment.findUnique({
            where: { id: ticket.class_enrollment.id },
            select: { pricing_mode: true },
        });
        if (enrollmentWithPricing?.pricing_mode === 'FULL_COURSE') {
            const installment = await (0, enrollment_installment_service_1.getCurrentMonthInstallment)(ticket.class_enrollment.id);
            if (!installment || installment.payment_status !== 'PAID') {
                return buildScanResponse('INVALID', 'Monthly payment is required to access this class. Please contact the front desk.', {
                    reason: 'INSTALLMENT_UNPAID',
                    ticket_code: ticket.ticket_code,
                    due_date: installment?.due_date ?? null,
                    amount_cents: installment?.amount_cents ?? null,
                });
            }
        }
        if (ticket.class_enrollment.group_class_id !== targetSession.group_class_id) {
            return buildScanResponse('INVALID', 'Ticket does not match this class session', {
                reason: 'SESSION_MISMATCH',
                ticket_code: ticket.ticket_code,
            });
        }
        if (ticket.class_enrollment.valid_from > targetSession.start_at
            || ticket.class_enrollment.valid_until < targetSession.start_at) {
            return buildScanResponse('INVALID', 'Class pass is not active for this session', {
                reason: 'PASS_NOT_ACTIVE_FOR_SESSION',
                ticket_code: ticket.ticket_code,
            });
        }
        const attendanceResult = await checkInClassSessionAttendance(companyId, targetSession.id, ticket.class_enrollment.user_id, method);
        if (attendanceResult.error) {
            return buildScanResponse('INVALID', attendanceResult.message, {
                reason: 'ATTENDANCE_REJECTED',
                ticket_code: ticket.ticket_code,
            });
        }
        if (attendanceResult.message.toLowerCase().includes('already')) {
            return buildScanResponse('ALREADY_USED', 'Attendee already checked in for this session', {
                reason: 'ALREADY_CHECKED_IN',
                ticket_code: ticket.ticket_code,
                ticket_type: 'CLASS',
                attendance: attendanceResult.data,
            });
        }
        return buildScanResponse('VALID', 'Class session attendance validated by ticket', {
            ticket_code: ticket.ticket_code,
            ticket_type: 'CLASS',
            attendance: attendanceResult.data,
            class_session_id: targetSession.id,
        });
    }
    return buildScanResponse('INVALID', 'Ticket is not linked to an event booking or class enrollment', {
        reason: 'TICKET_ORPHAN',
        ticket_code: ticket.ticket_code,
    });
}
async function listEventAttendance(companyId, eventId) {
    const attendances = await client_2.prisma.groupSessionAttendance.findMany({
        where: {
            company_id: companyId,
            group_event_id: eventId,
        },
        include: {
            user: { select: { id: true, name: true, email: true, phoneNumber: true } },
            customer_profile: { select: { id: true } },
            event_booking: { select: { id: true, status: true, payment_status: true } },
        },
        orderBy: [{ checked_in_at: 'desc' }, { created_at: 'desc' }],
    });
    return { code: 200, error: false, message: 'Event attendance retrieved', data: attendances };
}
async function listClassSessionAttendance(companyId, sessionId) {
    const attendances = await client_2.prisma.groupSessionAttendance.findMany({
        where: {
            company_id: companyId,
            group_class_session_id: sessionId,
        },
        include: {
            user: { select: { id: true, name: true, email: true, phoneNumber: true } },
            customer_profile: { select: { id: true } },
            enrollment: { select: { id: true, status: true, valid_from: true, valid_until: true } },
        },
        orderBy: [{ checked_in_at: 'desc' }, { created_at: 'desc' }],
    });
    return { code: 200, error: false, message: 'Session attendance retrieved', data: attendances };
}
async function getAttendanceSummary(companyId) {
    const [eventCheckedIn, classCheckedIn, totalRows] = await Promise.all([
        client_2.prisma.groupSessionAttendance.count({
            where: {
                company_id: companyId,
                group_event_id: { not: null },
                checked_in_at: { not: null },
            },
        }),
        client_2.prisma.groupSessionAttendance.count({
            where: {
                company_id: companyId,
                group_class_session_id: { not: null },
                checked_in_at: { not: null },
            },
        }),
        client_2.prisma.groupSessionAttendance.count({
            where: {
                company_id: companyId,
            },
        }),
    ]);
    return {
        code: 200,
        error: false,
        message: 'Attendance summary retrieved',
        data: {
            total_rows: totalRows,
            event_checked_in: eventCheckedIn,
            class_checked_in: classCheckedIn,
        },
    };
}
