import { Response } from 'express';
import { GroupItemStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as GroupClassService from '../services/group-class.service';
import * as GroupSessionService from '../services/group-session.service';
import * as GroupBookingService from '../services/group-booking.service';
import * as GroupAttendanceService from '../services/group-attendance.service';

function parseId(raw: string | string[] | undefined): number | null {
    if (!raw) return null;
    const normalized = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseStatus(raw: unknown): GroupItemStatus | undefined {
    if (typeof raw !== 'string') return undefined;
    if (raw === 'DRAFT' || raw === 'PUBLISHED' || raw === 'ARCHIVED') return raw;
    return undefined;
}

function requireCompanyId(req: AuthenticatedRequest, res: Response): number | null {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
        return null;
    }
    return companyId;
}

export async function createClass(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await GroupClassService.createGroupClass(companyId, userId, payload);
    return res.status(result.code).json(result);
}

export async function updateClass(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await GroupClassService.updateGroupClass(companyId, classId, payload);
    return res.status(result.code).json(result);
}

export async function setClassStatus(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const status = parseStatus((req as any).validated?.status ?? req.body?.status);
    if (!status) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid status' });
    }

    const result = await GroupClassService.setGroupClassStatus(companyId, classId, status);
    return res.status(result.code).json(result);
}

export async function listClasses(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const status = parseStatus(req.query.status);
    const result = await GroupClassService.listGroupClasses(companyId, { status });
    return res.status(result.code).json(result);
}

export async function getClassById(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const result = await GroupClassService.getGroupClassById(companyId, classId);
    return res.status(result.code).json(result);
}

export async function deleteClass(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const result = await GroupClassService.deleteGroupClass(companyId, classId);
    return res.status(result.code).json(result);
}

export async function generateClassSessions(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const count = await GroupSessionService.regenerateSessions(companyId, classId);
    return res.status(200).json({ code: 200, error: false, message: 'Sessions generated', data: { created: count } });
}

export async function listClassSessions(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const upcoming = req.query.upcoming === 'true';
    const includeCancelled = req.query.include_cancelled === 'true';

    const result = await GroupSessionService.listClassSessions(companyId, classId, {
        upcoming,
        includeCancelled,
    });

    return res.status(result.code).json(result);
}

export async function getSessionDetail(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }

    const result = await GroupSessionService.getSessionDetail(companyId, sessionId);
    return res.status(result.code).json(result);
}

export async function cancelSession(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const result = await GroupSessionService.cancelSession(companyId, sessionId, reason);
    return res.status(result.code).json(result);
}

export async function getSessionPublicAttendance(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }

    const result = await GroupSessionService.getSessionPublicAttendanceSettings(companyId, sessionId);
    return res.status(result.code).json(result);
}

export async function updateSessionPublicAttendance(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await GroupSessionService.updateSessionPublicAttendanceSettings(companyId, sessionId, payload);
    return res.status(result.code).json(result);
}

export async function rotateSessionPublicAttendance(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }

    const result = await GroupSessionService.rotateSessionPublicAttendanceToken(companyId, sessionId);
    return res.status(result.code).json(result);
}

export async function listClassEnrollments(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const result = await GroupBookingService.listClassEnrollments(companyId, classId);
    return res.status(result.code).json(result);
}

export async function createClassEnrollmentAdmin(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }

    const adminUserId = req.authUser?.id;
    if (!adminUserId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const customerId = typeof req.body?.customer_id === 'number' ? req.body.customer_id : null;
    const newMember = req.body?.new_member && typeof req.body.new_member === 'object'
        ? {
            name: typeof req.body.new_member.name === 'string' ? req.body.new_member.name.trim() : '',
            email: typeof req.body.new_member.email === 'string' ? req.body.new_member.email.trim() : '',
            phone: typeof req.body.new_member.phone === 'string' ? req.body.new_member.phone.trim() : '',
            phone_prefix:
                typeof req.body.new_member.phone_prefix === 'string'
                    ? req.body.new_member.phone_prefix.trim()
                    : '',
            country_code:
                typeof req.body.new_member.country_code === 'string'
                    ? req.body.new_member.country_code.trim().toUpperCase()
                    : '',
        }
        : null;

    if (!customerId && !newMember) {
        return res.status(400).json({ code: 400, error: true, message: 'customer_id or new_member is required' });
    }

    if (newMember && (!newMember.name || (!newMember.email && !newMember.phone))) {
        return res.status(400).json({ code: 400, error: true, message: 'new_member requires a name and at least an email or phone' });
    }

    const paymentMethod = req.body?.payment_method;
    if (!paymentMethod || !['NONE', 'CASH', 'QR'].includes(paymentMethod)) {
        return res.status(400).json({ code: 400, error: true, message: 'payment_method must be NONE, CASH, or QR' });
    }

    const markAsPaid = req.body?.mark_as_paid === true;

    const result = await GroupBookingService.adminCreateClassEnrollment(companyId, classId, {
        customer_id: customerId ?? undefined,
        new_member: newMember ?? undefined,
        payment_method: paymentMethod,
        mark_as_paid: markAsPaid,
        qr_proof_image_url: typeof req.body?.qr_proof_image_url === 'string' ? req.body.qr_proof_image_url : undefined,
        admin_user_id: adminUserId,
    });
    return res.status(result.code).json(result);
}

export async function listClassSessionAttendance(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }

    const result = await GroupAttendanceService.listClassSessionAttendance(companyId, sessionId);
    return res.status(result.code).json(result);
}
