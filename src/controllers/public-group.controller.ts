import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as GroupEventService from '../services/group-event.service';
import * as GroupClassService from '../services/group-class.service';
import * as GroupSessionService from '../services/group-session.service';
import * as GroupBookingService from '../services/group-booking.service';
import * as InstallmentService from '../services/enrollment-installment.service';
import { resendTicketByCode } from '../services/group-ticket.service';

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
        notes: payload.notes,
        extra_attendees: payload.extra_attendees,
    });

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
    });

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

    const result = await InstallmentService.listInstallments(companyId, enrollmentId);
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
