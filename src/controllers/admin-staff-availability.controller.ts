import { Response } from 'express';
import { CompanyUserRole, StaffTimeOffStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as StaffAvailabilityService from '../services/staff-availability.service';
import { MensajeApi } from '../types/MensajeApi';

let mensaje: MensajeApi;

function getCompanyContext(req: AuthenticatedRequest): { companyId?: number; userId?: string; role?: CompanyUserRole } {
    const companyId = (req as any).companyID as number | undefined;
    const userId = req.authUser?.id;
    const role = ((req as any).companyUser?.role || undefined) as CompanyUserRole | undefined;
    return { companyId, userId, role };
}

export async function getStaffAvailability(req: AuthenticatedRequest, res: Response) {
    const { companyId } = getCompanyContext(req);
    const staffId = parseInt(req.params.id as string, 10);

    if (!companyId) {
        mensaje = { code: 400, error: true, message: 'Company context not found' };
        return res.status(400).json(mensaje);
    }

    if (isNaN(staffId)) {
        mensaje = { code: 400, error: true, message: 'Invalid staff id' };
        return res.status(400).json(mensaje);
    }

    const result = await StaffAvailabilityService.getStaffAvailability(companyId, staffId);
    return res.status(result.code).json(result);
}

export async function getMyAvailability(req: AuthenticatedRequest, res: Response) {
    const { companyId, userId } = getCompanyContext(req);

    if (!companyId) {
        mensaje = { code: 400, error: true, message: 'Company context not found' };
        return res.status(400).json(mensaje);
    }
    if (!userId) {
        mensaje = { code: 401, error: true, message: 'Unauthorized' };
        return res.status(401).json(mensaje);
    }

    const result = await StaffAvailabilityService.getMyAvailability(companyId, userId);
    return res.status(result.code).json(result);
}

export async function saveStaffAvailability(req: AuthenticatedRequest, res: Response) {
    const { companyId } = getCompanyContext(req);
    const staffId = parseInt(req.params.id as string, 10);
    const slots = req.body?.slots;

    if (!companyId) {
        mensaje = { code: 400, error: true, message: 'Company context not found' };
        return res.status(400).json(mensaje);
    }
    if (isNaN(staffId)) {
        mensaje = { code: 400, error: true, message: 'Invalid staff id' };
        return res.status(400).json(mensaje);
    }
    if (!Array.isArray(slots)) {
        mensaje = { code: 400, error: true, message: 'slots must be an array' };
        return res.status(400).json(mensaje);
    }

    const result = await StaffAvailabilityService.saveStaffAvailability(companyId, staffId, slots);
    return res.status(result.code).json(result);
}

export async function createTimeOffRequest(req: AuthenticatedRequest, res: Response) {
    const { companyId, userId, role } = getCompanyContext(req);
    const { starts_at, ends_at, reason, staff_id } = req.body || {};

    if (!companyId) {
        mensaje = { code: 400, error: true, message: 'Company context not found' };
        return res.status(400).json(mensaje);
    }
    if (!userId || !role) {
        mensaje = { code: 401, error: true, message: 'Unauthorized' };
        return res.status(401).json(mensaje);
    }
    if (!starts_at || !ends_at) {
        mensaje = { code: 400, error: true, message: 'starts_at and ends_at are required' };
        return res.status(400).json(mensaje);
    }

    const startsAt = new Date(starts_at);
    const endsAt = new Date(ends_at);
    const parsedStaffId = staff_id !== undefined ? parseInt(staff_id, 10) : undefined;

    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
        mensaje = { code: 400, error: true, message: 'Invalid starts_at or ends_at' };
        return res.status(400).json(mensaje);
    }
    if (parsedStaffId !== undefined && isNaN(parsedStaffId)) {
        mensaje = { code: 400, error: true, message: 'Invalid staff_id' };
        return res.status(400).json(mensaje);
    }

    const result = await StaffAvailabilityService.createTimeOffRequest({
        companyId,
        actorUserId: userId,
        actorRole: role,
        startsAt,
        endsAt,
        reason: typeof reason === 'string' ? reason.trim() : null,
        staffId: parsedStaffId,
    });
    return res.status(result.code).json(result);
}

export async function listTimeOffRequests(req: AuthenticatedRequest, res: Response) {
    const { companyId, userId, role } = getCompanyContext(req);
    const status = req.query.status as string | undefined;
    const staffId = req.query.staff_id ? parseInt(req.query.staff_id as string, 10) : undefined;

    if (!companyId) {
        mensaje = { code: 400, error: true, message: 'Company context not found' };
        return res.status(400).json(mensaje);
    }
    if (!userId || !role) {
        mensaje = { code: 401, error: true, message: 'Unauthorized' };
        return res.status(401).json(mensaje);
    }
    if (staffId !== undefined && isNaN(staffId)) {
        mensaje = { code: 400, error: true, message: 'Invalid staff_id' };
        return res.status(400).json(mensaje);
    }

    let parsedStatus: StaffTimeOffStatus | undefined;
    if (status) {
        if (!Object.values(StaffTimeOffStatus).includes(status as StaffTimeOffStatus)) {
            mensaje = { code: 400, error: true, message: 'Invalid status' };
            return res.status(400).json(mensaje);
        }
        parsedStatus = status as StaffTimeOffStatus;
    }

    const result = await StaffAvailabilityService.listTimeOffRequests({
        companyId,
        actorUserId: userId,
        actorRole: role,
        staffId,
        status: parsedStatus,
    });
    return res.status(result.code).json(result);
}

export async function reviewTimeOffRequest(req: AuthenticatedRequest, res: Response) {
    const { companyId, userId } = getCompanyContext(req);
    const requestId = parseInt(req.params.id as string, 10);
    const { status, review_note } = req.body || {};

    if (!companyId) {
        mensaje = { code: 400, error: true, message: 'Company context not found' };
        return res.status(400).json(mensaje);
    }
    if (!userId) {
        mensaje = { code: 401, error: true, message: 'Unauthorized' };
        return res.status(401).json(mensaje);
    }
    if (isNaN(requestId)) {
        mensaje = { code: 400, error: true, message: 'Invalid request id' };
        return res.status(400).json(mensaje);
    }
    if (![StaffTimeOffStatus.APPROVED, StaffTimeOffStatus.REJECTED].includes(status)) {
        mensaje = { code: 400, error: true, message: 'status must be APPROVED or REJECTED' };
        return res.status(400).json(mensaje);
    }

    const result = await StaffAvailabilityService.reviewTimeOffRequest({
        companyId,
        requestId,
        reviewerUserId: userId,
        status,
        reviewNote: typeof review_note === 'string' ? review_note.trim() : null,
    });

    return res.status(result.code).json(result);
}

export async function cancelTimeOffRequest(req: AuthenticatedRequest, res: Response) {
    const { companyId, userId, role } = getCompanyContext(req);
    const requestId = parseInt(req.params.id as string, 10);

    if (!companyId) {
        mensaje = { code: 400, error: true, message: 'Company context not found' };
        return res.status(400).json(mensaje);
    }
    if (!userId || !role) {
        mensaje = { code: 401, error: true, message: 'Unauthorized' };
        return res.status(401).json(mensaje);
    }
    if (isNaN(requestId)) {
        mensaje = { code: 400, error: true, message: 'Invalid request id' };
        return res.status(400).json(mensaje);
    }

    const result = await StaffAvailabilityService.cancelTimeOffRequest({
        companyId,
        requestId,
        actorUserId: userId,
        actorRole: role,
    });

    return res.status(result.code).json(result);
}
