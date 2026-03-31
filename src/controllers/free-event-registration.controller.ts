import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/requireAuth';
import {
    getFreeRegistrationState,
    submitFreeRegistration,
    listInterestedUsers,
    exportInterestedUsersXlsx,
    getFreeRegistrationByReservationCode,
    checkInFreeEventByReservationCode,
} from '../services/free-event-registration.service';
import { CheckInMethod } from '@prisma/client';

function parseId(value: unknown): number | null {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function getCompanyId(req: AuthenticatedRequest): number | null {
    return parseId((req as any).companyID);
}

// ── Public: GET /group/events/:eventId/free-registration-state ──

export async function getFreeRegistrationStateHandler(req: AuthenticatedRequest, res: Response) {
    const companyId = parseId(req.query.company_id);
    const eventId = parseId(req.params.eventId);
    if (!companyId || !eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or eventId' });
    }

    const userId = req.authUser?.id as string | undefined;
    const userEmail = req.authUser?.email as string | undefined;

    const result = await getFreeRegistrationState(companyId, eventId, userId, userEmail);
    return res.status(result.code).json(result);
}

// ── Public: POST /group/events/:eventId/free-register ──

export async function submitFreeRegistrationHandler(req: AuthenticatedRequest, res: Response) {
    const companyId = parseId(req.body.company_id ?? req.query.company_id);
    const eventId = parseId(req.params.eventId);
    if (!companyId || !eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or eventId' });
    }

    const userId = req.authUser?.id as string | undefined;

    const result = await submitFreeRegistration(companyId, eventId, {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        gender: req.body.gender,
        age: Number(req.body.age),
        email: req.body.email,
        phonePrefix: req.body.phonePrefix,
        phoneNumber: req.body.phoneNumber,
        tosAccepted: Boolean(req.body.tosAccepted),
        createAccount: Boolean(req.body.createAccount),
        otpChannelPreference: typeof req.body.otpChannelPreference === 'string'
            ? req.body.otpChannelPreference
            : undefined,
    }, userId);

    return res.status(result.code).json(result);
}

// ── Admin/Staff: POST /group/events/:eventId/free-check-in/code ──

export async function freeEventCheckInByCodeHandler(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req);
    const eventId = parseId(req.params.eventId);
    if (!companyId || !eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or eventId' });
    }

    const reservationCode = typeof req.body.reservation_code === 'string' ? req.body.reservation_code.trim() : '';
    const methodRaw = typeof req.body.method === 'string' ? req.body.method.trim().toUpperCase() : '';
    const method: CheckInMethod = methodRaw === CheckInMethod.MANUAL ? CheckInMethod.MANUAL : CheckInMethod.QR_SCAN;

    const result = await checkInFreeEventByReservationCode(companyId, eventId, reservationCode, method);
    return res.status(result.code).json(result);
}

// ── Admin/Staff: GET /group/events/:eventId/free-check-in/code/:reservationCode ──

export async function freeEventLookupByCodeHandler(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req);
    const eventId = parseId(req.params.eventId);
    const reservationCode = typeof req.params.reservationCode === 'string' ? req.params.reservationCode.trim() : '';
    if (!companyId || !eventId || !reservationCode) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, eventId or reservationCode' });
    }

    const result = await getFreeRegistrationByReservationCode(companyId, eventId, reservationCode);
    return res.status(result.code).json(result);
}

// ── Admin Store: GET /api/admin/group/events/free-registrations/interested ──

export async function adminListInterestedHandler(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
    }

    const eventId = req.query.event_id ? parseId(req.query.event_id) : undefined;
    const result = await listInterestedUsers({
        companyId,
        eventId: eventId ?? undefined,
        ageGroup: req.query.age_group as string | undefined,
        dateFrom: req.query.date_from as string | undefined,
        dateTo: req.query.date_to as string | undefined,
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.page_size) || 50,
    });

    return res.json({ code: 200, error: false, message: 'OK', data: result });
}

// ── Admin Store: GET /api/admin/group/events/free-registrations/interested/export ──

export async function adminExportInterestedHandler(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
    }

    const eventId = req.query.event_id ? parseId(req.query.event_id) : undefined;
    const buffer = await exportInterestedUsersXlsx({
        companyId,
        eventId: eventId ?? undefined,
        ageGroup: req.query.age_group as string | undefined,
        dateFrom: req.query.date_from as string | undefined,
        dateTo: req.query.date_to as string | undefined,
    });

    const filename = `interesados_evento_${eventId ?? 'todos'}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
}

// ── Super Admin: GET /api/super-admin/group/events/free-registrations/interested ──

export async function superAdminListInterestedHandler(req: AuthenticatedRequest, res: Response) {
    const eventId = req.query.event_id ? parseId(req.query.event_id) : undefined;
    const companyId = req.query.company_id ? parseId(req.query.company_id) : undefined;

    const result = await listInterestedUsers({
        companyId: companyId ?? undefined,
        eventId: eventId ?? undefined,
        ageGroup: req.query.age_group as string | undefined,
        dateFrom: req.query.date_from as string | undefined,
        dateTo: req.query.date_to as string | undefined,
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.page_size) || 50,
    });

    return res.json({ code: 200, error: false, message: 'OK', data: result });
}

// ── Super Admin: GET /api/super-admin/group/events/free-registrations/interested/export ──

export async function superAdminExportInterestedHandler(req: AuthenticatedRequest, res: Response) {
    const eventId = req.query.event_id ? parseId(req.query.event_id) : undefined;
    const companyId = req.query.company_id ? parseId(req.query.company_id) : undefined;

    const buffer = await exportInterestedUsersXlsx({
        companyId: companyId ?? undefined,
        eventId: eventId ?? undefined,
        ageGroup: req.query.age_group as string | undefined,
        dateFrom: req.query.date_from as string | undefined,
        dateTo: req.query.date_to as string | undefined,
    });

    const filename = `interesados_global_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
}
