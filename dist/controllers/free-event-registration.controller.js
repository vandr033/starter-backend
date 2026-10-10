"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFreeRegistrationStateHandler = getFreeRegistrationStateHandler;
exports.submitFreeRegistrationHandler = submitFreeRegistrationHandler;
exports.freeEventCheckInByCodeHandler = freeEventCheckInByCodeHandler;
exports.freeEventLookupByCodeHandler = freeEventLookupByCodeHandler;
exports.adminListInterestedHandler = adminListInterestedHandler;
exports.adminExportInterestedHandler = adminExportInterestedHandler;
exports.adminListFreeRegistrationsHandler = adminListFreeRegistrationsHandler;
exports.adminCancelFreeRegistrationHandler = adminCancelFreeRegistrationHandler;
exports.adminListEventInterestedHandler = adminListEventInterestedHandler;
exports.adminInviteInterestedHandler = adminInviteInterestedHandler;
exports.superAdminListInterestedHandler = superAdminListInterestedHandler;
exports.superAdminExportInterestedHandler = superAdminExportInterestedHandler;
const free_event_registration_service_1 = require("../services/free-event-registration.service");
const client_1 = require("@prisma/client");
function parseId(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function getCompanyId(req) {
    return parseId(req.companyID);
}
// ── Public: GET /group/events/:eventId/free-registration-state ──
async function getFreeRegistrationStateHandler(req, res) {
    const companyId = parseId(req.query.company_id);
    const eventId = parseId(req.params.eventId);
    if (!companyId || !eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or eventId' });
    }
    const userId = req.authUser?.id;
    const userEmail = req.authUser?.email;
    const result = await (0, free_event_registration_service_1.getFreeRegistrationState)(companyId, eventId, userId, userEmail);
    return res.status(result.code).json(result);
}
// ── Public: POST /group/events/:eventId/free-register ──
async function submitFreeRegistrationHandler(req, res) {
    const companyId = parseId(req.body.company_id ?? req.query.company_id);
    const eventId = parseId(req.params.eventId);
    if (!companyId || !eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or eventId' });
    }
    const userId = req.authUser?.id;
    const result = await (0, free_event_registration_service_1.submitFreeRegistration)(companyId, eventId, {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        gender: req.body.gender,
        age: Number(req.body.age),
        email: req.body.email,
        countryCode: req.body.countryCode,
        phonePrefix: req.body.phonePrefix,
        phoneNumber: req.body.phoneNumber,
        tosAccepted: Boolean(req.body.tosAccepted),
        registrationQuestionAnswer: req.body.registrationQuestionAnswer,
        createAccount: Boolean(req.body.createAccount),
        otpChannelPreference: typeof req.body.otpChannelPreference === 'string'
            ? req.body.otpChannelPreference
            : undefined,
    }, userId);
    return res.status(result.code).json(result);
}
// ── Admin/Staff: POST /group/events/:eventId/free-check-in/code ──
async function freeEventCheckInByCodeHandler(req, res) {
    const companyId = getCompanyId(req);
    const eventId = parseId(req.params.eventId);
    if (!companyId || !eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or eventId' });
    }
    const reservationCode = typeof req.body.reservation_code === 'string' ? req.body.reservation_code.trim() : '';
    const methodRaw = typeof req.body.method === 'string' ? req.body.method.trim().toUpperCase() : '';
    const method = methodRaw === client_1.CheckInMethod.MANUAL ? client_1.CheckInMethod.MANUAL : client_1.CheckInMethod.QR_SCAN;
    const result = await (0, free_event_registration_service_1.checkInFreeEventByReservationCode)(companyId, eventId, reservationCode, method);
    return res.status(result.code).json(result);
}
// ── Admin/Staff: GET /group/events/:eventId/free-check-in/code/:reservationCode ──
async function freeEventLookupByCodeHandler(req, res) {
    const companyId = getCompanyId(req);
    const eventId = parseId(req.params.eventId);
    const reservationCode = typeof req.params.reservationCode === 'string' ? req.params.reservationCode.trim() : '';
    if (!companyId || !eventId || !reservationCode) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id, eventId or reservationCode' });
    }
    const result = await (0, free_event_registration_service_1.getFreeRegistrationByReservationCode)(companyId, eventId, reservationCode);
    return res.status(result.code).json(result);
}
// ── Admin Store: GET /api/admin/group/events/free-registrations/interested ──
async function adminListInterestedHandler(req, res) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
    }
    const eventId = req.query.event_id ? parseId(req.query.event_id) : undefined;
    const result = await (0, free_event_registration_service_1.listInterestedUsers)({
        companyId,
        eventId: eventId ?? undefined,
        ageGroup: req.query.age_group,
        dateFrom: req.query.date_from,
        dateTo: req.query.date_to,
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.page_size) || 50,
    });
    return res.json({ code: 200, error: false, message: 'OK', data: result });
}
// ── Admin Store: GET /api/admin/group/events/free-registrations/interested/export ──
async function adminExportInterestedHandler(req, res) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
    }
    const eventId = req.query.event_id ? parseId(req.query.event_id) : undefined;
    const buffer = await (0, free_event_registration_service_1.exportInterestedUsersXlsx)({
        companyId,
        eventId: eventId ?? undefined,
        ageGroup: req.query.age_group,
        dateFrom: req.query.date_from,
        dateTo: req.query.date_to,
    });
    const filename = `interesados_evento_${eventId ?? 'todos'}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
}
// ── Admin: GET /api/admin/group/events/:eventId/free-registrations ──
async function adminListFreeRegistrationsHandler(req, res) {
    const companyId = getCompanyId(req);
    const eventId = parseId(req.params.eventId);
    if (!companyId || !eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or eventId' });
    }
    const result = await (0, free_event_registration_service_1.listFreeEventRegistrations)(companyId, eventId);
    return res.status(result.code).json(result);
}
// ── Admin: DELETE /api/admin/group/events/:eventId/free-registrations/:registrationId ──
async function adminCancelFreeRegistrationHandler(req, res) {
    const companyId = getCompanyId(req);
    const eventId = parseId(req.params.eventId);
    const registrationId = parseId(req.params.registrationId);
    if (!companyId || !eventId || !registrationId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid parameters' });
    }
    const result = await (0, free_event_registration_service_1.cancelFreeEventRegistration)(companyId, eventId, registrationId);
    return res.status(result.code).json(result);
}
// ── Admin: GET /api/admin/group/events/:eventId/free-registrations/interested ──
async function adminListEventInterestedHandler(req, res) {
    const companyId = getCompanyId(req);
    const eventId = parseId(req.params.eventId);
    if (!companyId || !eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid company_id or eventId' });
    }
    const result = await (0, free_event_registration_service_1.listEventInterestedUsers)(companyId, eventId);
    return res.status(result.code).json(result);
}
// ── Admin: POST /api/admin/group/events/:eventId/free-registrations/:registrationId/invite ──
async function adminInviteInterestedHandler(req, res) {
    const companyId = getCompanyId(req);
    const eventId = parseId(req.params.eventId);
    const registrationId = parseId(req.params.registrationId);
    if (!companyId || !eventId || !registrationId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid parameters' });
    }
    const channels = {
        email: Boolean(req.body.email),
        whatsapp: Boolean(req.body.whatsapp),
    };
    const result = await (0, free_event_registration_service_1.inviteInterestedRegistration)(companyId, eventId, registrationId, channels);
    return res.status(result.code).json(result);
}
// ── Super Admin: GET /api/super-admin/group/events/free-registrations/interested ──
async function superAdminListInterestedHandler(req, res) {
    const eventId = req.query.event_id ? parseId(req.query.event_id) : undefined;
    const companyId = req.query.company_id ? parseId(req.query.company_id) : undefined;
    const result = await (0, free_event_registration_service_1.listInterestedUsers)({
        companyId: companyId ?? undefined,
        eventId: eventId ?? undefined,
        ageGroup: req.query.age_group,
        dateFrom: req.query.date_from,
        dateTo: req.query.date_to,
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.page_size) || 50,
    });
    return res.json({ code: 200, error: false, message: 'OK', data: result });
}
// ── Super Admin: GET /api/super-admin/group/events/free-registrations/interested/export ──
async function superAdminExportInterestedHandler(req, res) {
    const eventId = req.query.event_id ? parseId(req.query.event_id) : undefined;
    const companyId = req.query.company_id ? parseId(req.query.company_id) : undefined;
    const buffer = await (0, free_event_registration_service_1.exportInterestedUsersXlsx)({
        companyId: companyId ?? undefined,
        eventId: eventId ?? undefined,
        ageGroup: req.query.age_group,
        dateFrom: req.query.date_from,
        dateTo: req.query.date_to,
    });
    const filename = `interesados_global_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
}
