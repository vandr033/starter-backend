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
exports.listPublicEvents = listPublicEvents;
exports.getPublicEventById = getPublicEventById;
exports.listPublicClasses = listPublicClasses;
exports.getPublicClassById = getPublicClassById;
exports.listPublicClassSessions = listPublicClassSessions;
exports.createEventBooking = createEventBooking;
exports.startPaidEventGuestCheckout = startPaidEventGuestCheckout;
exports.resendPaidEventGuestCheckout = resendPaidEventGuestCheckout;
exports.verifyPaidEventGuestCheckout = verifyPaidEventGuestCheckout;
exports.createClassEnrollment = createClassEnrollment;
exports.startClassGuestEnrollment = startClassGuestEnrollment;
exports.resendClassGuestEnrollment = resendClassGuestEnrollment;
exports.verifyClassGuestEnrollment = verifyClassGuestEnrollment;
exports.getPublicSessionAttendanceState = getPublicSessionAttendanceState;
exports.startPublicSessionAttendanceVerification = startPublicSessionAttendanceVerification;
exports.resendPublicSessionAttendanceVerification = resendPublicSessionAttendanceVerification;
exports.verifyPublicSessionAttendanceVerification = verifyPublicSessionAttendanceVerification;
exports.submitPublicSessionAttendance = submitPublicSessionAttendance;
exports.joinEventWaitlist = joinEventWaitlist;
exports.leaveEventWaitlist = leaveEventWaitlist;
exports.captureEventInterest = captureEventInterest;
exports.captureClassInterest = captureClassInterest;
exports.getMyEventBookings = getMyEventBookings;
exports.getMyClassEnrollments = getMyClassEnrollments;
exports.resendMyClassTicket = resendMyClassTicket;
exports.getMyInstallments = getMyInstallments;
exports.getMyPaymentPlans = getMyPaymentPlans;
exports.submitInstallmentQrProof = submitInstallmentQrProof;
const GroupEventService = __importStar(require("../services/group-event.service"));
const GroupClassService = __importStar(require("../services/group-class.service"));
const GroupSessionService = __importStar(require("../services/group-session.service"));
const GroupBookingService = __importStar(require("../services/group-booking.service"));
const InstallmentService = __importStar(require("../services/enrollment-installment.service"));
const GroupPaymentsService = __importStar(require("../services/group-payments.service"));
const group_ticket_service_1 = require("../services/group-ticket.service");
const PaidEventGuestCheckoutService = __importStar(require("../services/paid-event-guest-checkout.service"));
const ClassGuestEnrollmentService = __importStar(require("../services/class-guest-enrollment.service"));
const PublicSessionAttendanceService = __importStar(require("../services/public-class-session-attendance.service"));
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
async function listPublicEvents(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const upcoming = req.query.upcoming !== 'false';
    const result = await GroupEventService.listGroupEvents(companyId, {
        status: 'PUBLISHED',
        upcoming,
        isPrivate: false,
    });
    return res.status(result.code).json(result);
}
async function getPublicEventById(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupEventService.getGroupEventById(companyId, eventId);
    if (!result.error && result.data && result.data.status !== 'PUBLISHED') {
        return res.status(404).json({ code: 404, error: true, message: 'Event not found' });
    }
    return res.status(result.code).json(result);
}
async function listPublicClasses(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const result = await GroupClassService.listGroupClasses(companyId, {
        status: 'PUBLISHED',
    });
    return res.status(result.code).json(result);
}
async function getPublicClassById(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const result = await GroupClassService.getGroupClassById(companyId, classId);
    if (!result.error && result.data && result.data.status !== 'PUBLISHED') {
        return res.status(404).json({ code: 404, error: true, message: 'Class not found' });
    }
    return res.status(result.code).json(result);
}
async function listPublicClassSessions(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const result = await GroupSessionService.listClassSessions(companyId, classId, {
        upcoming: true,
        includeCancelled: false,
    });
    if (!result.error && Array.isArray(result.data)) {
        const sanitized = result.data.map((session) => ({
            id: session.id,
            company_id: session.company_id,
            group_class_id: session.group_class_id,
            start_at: session.start_at,
            end_at: session.end_at,
            status: session.status,
            max_capacity_override: session.max_capacity_override ?? null,
            cancelled_at: session.cancelled_at,
            cancel_reason: session.cancel_reason,
            created_at: session.created_at,
            updated_at: session.updated_at,
            max_capacity: session.max_capacity,
            booked_count: session.booked_count,
            attendance_count: session.attendance_count,
        }));
        return res.status(result.code).json({
            ...result,
            data: sanitized,
        });
    }
    return res.status(result.code).json(result);
}
async function createEventBooking(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const payload = req.validated ?? req.body;
    const result = await GroupBookingService.createEventBooking(companyId, userId, {
        group_event_id: payload.group_event_id,
        booked_spots: payload.booked_spots,
        payment_method: payload.payment_method,
        qr_proof_image_url: payload.qr_proof_image_url,
        upload_intent: payload.upload_intent,
        registration_question_answer: payload.registration_question_answer,
        notes: payload.notes,
        extra_attendees: payload.extra_attendees,
    });
    return res.status(result.code).json(result);
}
async function startPaidEventGuestCheckout(req, res) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const eventId = parseId(req.params.eventId);
    if (!companyId || !eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or eventId' });
    }
    const result = await PaidEventGuestCheckoutService.startPaidEventGuestCheckout(companyId, eventId, {
        full_name: typeof req.body?.full_name === 'string' ? req.body.full_name : '',
        email: typeof req.body?.email === 'string' ? req.body.email : '',
        phonePrefix: typeof req.body?.phonePrefix === 'string' ? req.body.phonePrefix : '',
        phoneNumber: typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber : '',
        tosAccepted: Boolean(req.body?.tosAccepted),
    });
    return res.status(result.code).json(result);
}
async function resendPaidEventGuestCheckout(req, res) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const eventId = parseId(req.params.eventId);
    const sessionId = typeof req.body?.checkout_session_id === 'string' ? req.body.checkout_session_id.trim() : '';
    if (!companyId || !eventId || !sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, eventId or checkout_session_id' });
    }
    const result = await PaidEventGuestCheckoutService.resendPaidEventGuestCheckoutCode(companyId, eventId, sessionId);
    return res.status(result.code).json(result);
}
async function verifyPaidEventGuestCheckout(req, res) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const eventId = parseId(req.params.eventId);
    const sessionId = typeof req.body?.checkout_session_id === 'string' ? req.body.checkout_session_id.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!companyId || !eventId || !sessionId || !code.trim()) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, eventId, checkout_session_id or code' });
    }
    const result = await PaidEventGuestCheckoutService.verifyPaidEventGuestCheckout(companyId, eventId, sessionId, code, req.headers);
    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }
    return res.status(result.code).json(result);
}
async function createClassEnrollment(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const payload = req.validated ?? req.body;
    const result = await GroupBookingService.createClassEnrollment(companyId, userId, {
        group_class_id: payload.group_class_id,
        group_class_session_id: payload.group_class_session_id,
        payment_method: payload.payment_method,
        qr_proof_image_url: payload.qr_proof_image_url,
        upload_intent: payload.upload_intent,
    });
    return res.status(result.code).json(result);
}
async function startClassGuestEnrollment(req, res) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const classId = parseId(req.params.classId);
    if (!companyId || !classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or classId' });
    }
    const result = await ClassGuestEnrollmentService.startClassGuestEnrollment(companyId, classId, {
        full_name: typeof req.body?.full_name === 'string' ? req.body.full_name : '',
        email: typeof req.body?.email === 'string' ? req.body.email : '',
        phonePrefix: typeof req.body?.phonePrefix === 'string' ? req.body.phonePrefix : '',
        phoneNumber: typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber : '',
    });
    return res.status(result.code).json(result);
}
async function resendClassGuestEnrollment(req, res) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const classId = parseId(req.params.classId);
    const sessionId = typeof req.body?.checkout_session_id === 'string' ? req.body.checkout_session_id.trim() : '';
    if (!companyId || !classId || !sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, classId or checkout_session_id' });
    }
    const result = await ClassGuestEnrollmentService.resendClassGuestEnrollmentCode(companyId, classId, sessionId);
    return res.status(result.code).json(result);
}
async function verifyClassGuestEnrollment(req, res) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const classId = parseId(req.params.classId);
    const sessionId = typeof req.body?.checkout_session_id === 'string' ? req.body.checkout_session_id.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!companyId || !classId || !sessionId || !code.trim()) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, classId, checkout_session_id or code' });
    }
    const result = await ClassGuestEnrollmentService.verifyClassGuestEnrollment(companyId, classId, sessionId, code, req.headers);
    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }
    return res.status(result.code).json(result);
}
async function getPublicSessionAttendanceState(req, res) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!token) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token' });
    }
    const result = await PublicSessionAttendanceService.getPublicSessionAttendanceState(token, req.authUser, req.headers['x-forwarded-for'] ?? req.ip);
    return res.status(result.code).json(result);
}
async function startPublicSessionAttendanceVerification(req, res) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!token) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token' });
    }
    const payload = req.validated ?? req.body;
    const result = await PublicSessionAttendanceService.startPublicSessionAttendanceGuestVerification(token, {
        full_name: typeof payload?.full_name === 'string' ? payload.full_name : '',
        email: typeof payload?.email === 'string' ? payload.email : '',
        countryCode: typeof payload?.countryCode === 'string' ? payload.countryCode : undefined,
        phonePrefix: typeof payload?.phonePrefix === 'string' ? payload.phonePrefix : '',
        phoneNumber: typeof payload?.phoneNumber === 'string' ? payload.phoneNumber : '',
    }, req.headers['x-forwarded-for'] ?? req.ip);
    return res.status(result.code).json(result);
}
async function resendPublicSessionAttendanceVerification(req, res) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    const payload = req.validated ?? req.body;
    const checkoutSessionId = typeof payload?.checkout_session_id === 'string'
        ? payload.checkout_session_id.trim()
        : '';
    if (!token || !checkoutSessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token or checkout_session_id' });
    }
    const result = await PublicSessionAttendanceService.resendPublicSessionAttendanceGuestVerification(token, checkoutSessionId, req.headers['x-forwarded-for'] ?? req.ip);
    return res.status(result.code).json(result);
}
async function verifyPublicSessionAttendanceVerification(req, res) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    const payload = req.validated ?? req.body;
    const checkoutSessionId = typeof payload?.checkout_session_id === 'string'
        ? payload.checkout_session_id.trim()
        : '';
    const code = typeof payload?.code === 'string' ? payload.code : '';
    if (!token || !checkoutSessionId || !code.trim()) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token, checkout_session_id or code' });
    }
    const result = await PublicSessionAttendanceService.verifyPublicSessionAttendanceGuestVerification(token, checkoutSessionId, code, req.headers, req.headers['x-forwarded-for'] ?? req.ip);
    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }
    return res.status(result.code).json(result);
}
async function submitPublicSessionAttendance(req, res) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!token) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token' });
    }
    const payload = req.validated ?? req.body;
    const result = await PublicSessionAttendanceService.submitPublicSessionAttendance(token, {
        checkout_session_id: typeof payload?.checkout_session_id === 'string' && payload.checkout_session_id.trim()
            ? payload.checkout_session_id.trim()
            : undefined,
        access_code: typeof payload?.access_code === 'string'
            ? payload.access_code
            : null,
        full_name: typeof payload?.full_name === 'string' ? payload.full_name : undefined,
        email: typeof payload?.email === 'string' ? payload.email : undefined,
        countryCode: typeof payload?.countryCode === 'string' ? payload.countryCode : undefined,
        phonePrefix: typeof payload?.phonePrefix === 'string' ? payload.phonePrefix : undefined,
        phoneNumber: typeof payload?.phoneNumber === 'string' ? payload.phoneNumber : undefined,
    }, req.authUser, req.headers['x-forwarded-for'] ?? req.ip);
    return res.status(result.code).json(result);
}
async function joinEventWaitlist(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupBookingService.joinWaitlist(companyId, userId, eventId);
    return res.status(result.code).json(result);
}
async function leaveEventWaitlist(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupBookingService.leaveWaitlist(companyId, userId, eventId);
    return res.status(result.code).json(result);
}
async function captureEventInterest(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupBookingService.captureEventInterest(companyId, userId, eventId);
    return res.status(result.code).json(result);
}
async function captureClassInterest(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const result = await GroupBookingService.captureClassInterest(companyId, userId, classId);
    return res.status(result.code).json(result);
}
async function getMyEventBookings(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const result = await GroupBookingService.getMyEventBookings(userId);
    return res.status(result.code).json(result);
}
async function getMyClassEnrollments(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const result = await GroupBookingService.getMyClassEnrollments(userId);
    return res.status(result.code).json(result);
}
async function resendMyClassTicket(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }
    // Verify the enrollment belongs to this user and find its active ticket
    const { prisma } = await Promise.resolve().then(() => __importStar(require('../prisma/client')));
    const enrollment = await prisma.groupClassEnrollment.findFirst({
        where: { id: enrollmentId, user_id: userId },
        include: {
            tickets: {
                where: { status: { in: ['ACTIVE', 'USED'] } },
                orderBy: { created_at: 'desc' },
                take: 1,
                select: { ticket_code: true, company_id: true },
            },
        },
    });
    if (!enrollment) {
        return res.status(404).json({ code: 404, error: true, message: 'Enrollment not found' });
    }
    const ticket = enrollment.tickets[0];
    if (!ticket) {
        return res.status(404).json({ code: 404, error: true, message: 'No active ticket found for this enrollment' });
    }
    const result = await (0, group_ticket_service_1.resendTicketByCode)(ticket.company_id, ticket.ticket_code);
    return res.status(result.code).json(result);
}
async function getMyInstallments(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const companyId = req.companyID;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
    }
    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }
    const result = await GroupPaymentsService.getEnrollmentInstallmentPlan(companyId, enrollmentId, userId);
    return res.status(result.code).json(result);
}
async function getMyPaymentPlans(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const result = await GroupPaymentsService.listMyPaymentPlans(userId);
    return res.status(result.code).json(result);
}
async function submitInstallmentQrProof(req, res) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const companyId = req.companyID;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
    }
    const enrollmentId = parseId(req.params.enrollmentId);
    const installmentId = parseId(req.params.installmentId);
    if (!enrollmentId || !installmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId or installmentId' });
    }
    const qrProofImageUrl = typeof req.body?.qr_proof_image_url === 'string' ? req.body.qr_proof_image_url.trim() : '';
    if (!qrProofImageUrl) {
        return res.status(400).json({ code: 400, error: true, message: 'qr_proof_image_url is required' });
    }
    const result = await InstallmentService.submitInstallmentQrProof(companyId, enrollmentId, installmentId, userId, qrProofImageUrl);
    return res.status(result.code).json(result);
}
