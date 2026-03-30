import { Response } from 'express';
import { GroupItemStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as GroupEventService from '../services/group-event.service';
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

export async function createEvent(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await GroupEventService.createGroupEvent(companyId, userId, payload);
    return res.status(result.code).json(result);
}

export async function updateEvent(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await GroupEventService.updateGroupEvent(companyId, eventId, payload);
    return res.status(result.code).json(result);
}

export async function setEventStatus(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const status = parseStatus((req as any).validated?.status ?? req.body?.status);
    if (!status) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid status' });
    }

    const result = await GroupEventService.setGroupEventStatus(companyId, eventId, status);
    return res.status(result.code).json(result);
}

export async function listEvents(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const status = parseStatus(req.query.status);
    const upcoming = req.query.upcoming === 'true';

    const result = await GroupEventService.listGroupEvents(companyId, {
        status,
        upcoming,
    });

    return res.status(result.code).json(result);
}

export async function getEventById(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupEventService.getGroupEventById(companyId, eventId);
    return res.status(result.code).json(result);
}

export async function deleteEvent(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupEventService.deleteGroupEvent(companyId, eventId);
    return res.status(result.code).json(result);
}

export async function listEventBookings(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupBookingService.listEventBookings(companyId, eventId);
    return res.status(result.code).json(result);
}

export async function listEventInterests(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupBookingService.listEventInterests(companyId, eventId);
    return res.status(result.code).json(result);
}

export async function listEventAttendance(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }

    const result = await GroupAttendanceService.listEventAttendance(companyId, eventId);
    return res.status(result.code).json(result);
}
