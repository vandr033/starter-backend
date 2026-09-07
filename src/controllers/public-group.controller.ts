import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as GroupEventService from '../services/group-event.service';
import * as GroupClassService from '../services/group-class.service';
import * as GroupSessionService from '../services/group-session.service';
import * as GroupBookingService from '../services/group-booking.service';
import * as InstallmentService from '../services/enrollment-installment.service';
import * as GroupPaymentsService from '../services/group-payments.service';
import { resendTicketByCode } from '../services/group-ticket.service';
import * as PaidEventGuestCheckoutService from '../services/paid-event-guest-checkout.service';
import * as ClassGuestEnrollmentService from '../services/class-guest-enrollment.service';
import * as PublicSessionAttendanceService from '../services/public-class-session-attendance.service';

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

export async function listPublicEvents(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const upcoming = req.query.upcoming !== 'false';
    const result = await GroupEventService.listGroupEvents(companyId, {
        status: 'PUBLISHED',
        upcoming,
        isPrivate: false,
    });

    return res.status(result.code).json(result);
}

export async function getPublicEventById(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupEventService.getGroupEventById(companyId, eventId);
    if (!result.error && result.data && (result.data as any).status !== 'PUBLISHED') {
        return res.status(404).json({ code: 404, error: true, message: 'Event not found' });
    }

    return res.status(result.code).json(result);
}

export async function listPublicClasses(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const result = await GroupClassService.listGroupClasses(companyId, {
        status: 'PUBLISHED',
    });

    return res.status(result.code).json(result);
}

export async function getPublicClassById(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const result = await GroupClassService.getGroupClassById(companyId, classId);
    if (!result.error && result.data && (result.data as any).status !== 'PUBLISHED') {
        return res.status(404).json({ code: 404, error: true, message: 'Class not found' });
    }

    return res.status(result.code).json(result);
}

export async function listPublicClassSessions(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const result = await GroupSessionService.listClassSessions(companyId, classId, {
        upcoming: true,
        includeCancelled: false,
    });

    if (!result.error && Array.isArray(result.data)) {
        const sanitized = result.data.map((session: any) => ({
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

export async function createEventBooking(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const payload = (req as any).validated ?? req.body;
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

export async function startPaidEventGuestCheckout(req: AuthenticatedRequest, res: Response) {
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

export async function resendPaidEventGuestCheckout(req: AuthenticatedRequest, res: Response) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const eventId = parseId(req.params.eventId);
    const sessionId = typeof req.body?.checkout_session_id === 'string' ? req.body.checkout_session_id.trim() : '';
    if (!companyId || !eventId || !sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, eventId or checkout_session_id' });
    }

    const result = await PaidEventGuestCheckoutService.resendPaidEventGuestCheckoutCode(companyId, eventId, sessionId);
    return res.status(result.code).json(result);
}

export async function verifyPaidEventGuestCheckout(req: AuthenticatedRequest, res: Response) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const eventId = parseId(req.params.eventId);
    const sessionId = typeof req.body?.checkout_session_id === 'string' ? req.body.checkout_session_id.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!companyId || !eventId || !sessionId || !code.trim()) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, eventId, checkout_session_id or code' });
    }

    const result = await PaidEventGuestCheckoutService.verifyPaidEventGuestCheckout(
        companyId,
        eventId,
        sessionId,
        code,
        req.headers as HeadersInit,
    );

    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }

    return res.status(result.code).json(result);
}

export async function createClassEnrollment(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const payload = (req as any).validated ?? req.body;
    const result = await GroupBookingService.createClassEnrollment(companyId, userId, {
        group_class_id: payload.group_class_id,
        group_class_session_id: payload.group_class_session_id,
        payment_method: payload.payment_method,
        qr_proof_image_url: payload.qr_proof_image_url,
        upload_intent: payload.upload_intent,
    });

    return res.status(result.code).json(result);
}

export async function startClassGuestEnrollment(req: AuthenticatedRequest, res: Response) {
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

export async function resendClassGuestEnrollment(req: AuthenticatedRequest, res: Response) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const classId = parseId(req.params.classId);
    const sessionId = typeof req.body?.checkout_session_id === 'string' ? req.body.checkout_session_id.trim() : '';
    if (!companyId || !classId || !sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, classId or checkout_session_id' });
    }

    const result = await ClassGuestEnrollmentService.resendClassGuestEnrollmentCode(companyId, classId, sessionId);
    return res.status(result.code).json(result);
}

export async function verifyClassGuestEnrollment(req: AuthenticatedRequest, res: Response) {
    const companyId = parseId(req.body?.company_id ?? req.query.company_id);
    const classId = parseId(req.params.classId);
    const sessionId = typeof req.body?.checkout_session_id === 'string' ? req.body.checkout_session_id.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!companyId || !classId || !sessionId || !code.trim()) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, classId, checkout_session_id or code' });
    }

    const result = await ClassGuestEnrollmentService.verifyClassGuestEnrollment(
        companyId,
        classId,
        sessionId,
        code,
        req.headers as HeadersInit,
    );

    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }

    return res.status(result.code).json(result);
}

export async function getPublicSessionAttendanceState(req: AuthenticatedRequest, res: Response) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!token) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token' });
    }

    const result = await PublicSessionAttendanceService.getPublicSessionAttendanceState(
        token,
        req.authUser,
        (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    );
    return res.status(result.code).json(result);
}

export async function startPublicSessionAttendanceVerification(req: AuthenticatedRequest, res: Response) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!token) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await PublicSessionAttendanceService.startPublicSessionAttendanceGuestVerification(
        token,
        {
            full_name: typeof payload?.full_name === 'string' ? payload.full_name : '',
            email: typeof payload?.email === 'string' ? payload.email : '',
            countryCode: typeof payload?.countryCode === 'string' ? payload.countryCode : undefined,
            phonePrefix: typeof payload?.phonePrefix === 'string' ? payload.phonePrefix : '',
            phoneNumber: typeof payload?.phoneNumber === 'string' ? payload.phoneNumber : '',
        },
        (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    );

    return res.status(result.code).json(result);
}

export async function resendPublicSessionAttendanceVerification(req: AuthenticatedRequest, res: Response) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    const payload = (req as any).validated ?? req.body;
    const checkoutSessionId =
        typeof payload?.checkout_session_id === 'string'
            ? payload.checkout_session_id.trim()
            : '';

    if (!token || !checkoutSessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token or checkout_session_id' });
    }

    const result = await PublicSessionAttendanceService.resendPublicSessionAttendanceGuestVerification(
        token,
        checkoutSessionId,
        (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    );

    return res.status(result.code).json(result);
}

export async function verifyPublicSessionAttendanceVerification(req: AuthenticatedRequest, res: Response) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    const payload = (req as any).validated ?? req.body;
    const checkoutSessionId =
        typeof payload?.checkout_session_id === 'string'
            ? payload.checkout_session_id.trim()
            : '';
    const code = typeof payload?.code === 'string' ? payload.code : '';

    if (!token || !checkoutSessionId || !code.trim()) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token, checkout_session_id or code' });
    }

    const result = await PublicSessionAttendanceService.verifyPublicSessionAttendanceGuestVerification(
        token,
        checkoutSessionId,
        code,
        req.headers as HeadersInit,
        (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    );

    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }

    return res.status(result.code).json(result);
}

export async function submitPublicSessionAttendance(req: AuthenticatedRequest, res: Response) {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!token) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid token' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await PublicSessionAttendanceService.submitPublicSessionAttendance(
        token,
        {
            checkout_session_id:
                typeof payload?.checkout_session_id === 'string' && payload.checkout_session_id.trim()
                    ? payload.checkout_session_id.trim()
                    : undefined,
            access_code:
                typeof payload?.access_code === 'string'
                    ? payload.access_code
                    : null,
            full_name: typeof payload?.full_name === 'string' ? payload.full_name : undefined,
            email: typeof payload?.email === 'string' ? payload.email : undefined,
            countryCode: typeof payload?.countryCode === 'string' ? payload.countryCode : undefined,
            phonePrefix: typeof payload?.phonePrefix === 'string' ? payload.phonePrefix : undefined,
            phoneNumber: typeof payload?.phoneNumber === 'string' ? payload.phoneNumber : undefined,
        },
        req.authUser,
        (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    );

    return res.status(result.code).json(result);
}

export async function joinEventWaitlist(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupBookingService.joinWaitlist(companyId, userId, eventId);
    return res.status(result.code).json(result);
}

export async function leaveEventWaitlist(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupBookingService.leaveWaitlist(companyId, userId, eventId);
    return res.status(result.code).json(result);
}

export async function captureEventInterest(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupBookingService.captureEventInterest(companyId, userId, eventId);
    return res.status(result.code).json(result);
}

export async function captureClassInterest(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const result = await GroupBookingService.captureClassInterest(companyId, userId, classId);
    return res.status(result.code).json(result);
}

export async function getMyEventBookings(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const result = await GroupBookingService.getMyEventBookings(userId);
    return res.status(result.code).json(result);
}

export async function getMyClassEnrollments(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const result = await GroupBookingService.getMyClassEnrollments(userId);
    return res.status(result.code).json(result);
}

export async function resendMyClassTicket(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const enrollmentId = parseId(req.params.enrollmentId);
    if (!enrollmentId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid enrollmentId' });
    }

    // Verify the enrollment belongs to this user and find its active ticket
    const { prisma } = await import('../prisma/client');
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

    const result = await resendTicketByCode(ticket.company_id, ticket.ticket_code);
    return res.status(result.code).json(result);
}

export async function getMyInstallments(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const companyId = (req as any).companyID as number | undefined;
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

export async function getMyPaymentPlans(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const result = await GroupPaymentsService.listMyPaymentPlans(userId);
    return res.status(result.code).json(result);
}

export async function submitInstallmentQrProof(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const companyId = (req as any).companyID as number | undefined;
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

    const result = await InstallmentService.submitInstallmentQrProof(
        companyId,
        enrollmentId,
        installmentId,
        userId,
        qrProofImageUrl,
    );
    return res.status(result.code).json(result);
}
