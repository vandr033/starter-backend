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
exports.getStaffAvailability = getStaffAvailability;
exports.getMyAvailability = getMyAvailability;
exports.saveStaffAvailability = saveStaffAvailability;
exports.assignStaffAvailabilityFromCompanyHours = assignStaffAvailabilityFromCompanyHours;
exports.createTimeOffRequest = createTimeOffRequest;
exports.listTimeOffRequests = listTimeOffRequests;
exports.reviewTimeOffRequest = reviewTimeOffRequest;
exports.cancelTimeOffRequest = cancelTimeOffRequest;
const client_1 = require("@prisma/client");
const StaffAvailabilityService = __importStar(require("../services/staff-availability.service"));
let mensaje;
function getCompanyContext(req) {
    const companyId = req.companyID;
    const userId = req.authUser?.id;
    const role = (req.companyUser?.role || undefined);
    return { companyId, userId, role };
}
async function getStaffAvailability(req, res) {
    const { companyId } = getCompanyContext(req);
    const staffId = parseInt(req.params.id, 10);
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
async function getMyAvailability(req, res) {
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
async function saveStaffAvailability(req, res) {
    const { companyId } = getCompanyContext(req);
    const staffId = parseInt(req.params.id, 10);
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
async function assignStaffAvailabilityFromCompanyHours(req, res) {
    const { companyId } = getCompanyContext(req);
    const staffId = parseInt(req.params.id, 10);
    const overwrite = req.body?.overwrite === true;
    if (!companyId) {
        mensaje = { code: 400, error: true, message: 'Company context not found' };
        return res.status(400).json(mensaje);
    }
    if (isNaN(staffId)) {
        mensaje = { code: 400, error: true, message: 'Invalid staff id' };
        return res.status(400).json(mensaje);
    }
    const result = await StaffAvailabilityService.assignStaffAvailabilityFromCompanyHours(companyId, staffId, overwrite);
    return res.status(result.code).json(result);
}
async function createTimeOffRequest(req, res) {
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
async function listTimeOffRequests(req, res) {
    const { companyId, userId, role } = getCompanyContext(req);
    const status = req.query.status;
    const staffId = req.query.staff_id ? parseInt(req.query.staff_id, 10) : undefined;
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
    let parsedStatus;
    if (status) {
        if (!Object.values(client_1.StaffTimeOffStatus).includes(status)) {
            mensaje = { code: 400, error: true, message: 'Invalid status' };
            return res.status(400).json(mensaje);
        }
        parsedStatus = status;
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
async function reviewTimeOffRequest(req, res) {
    const { companyId, userId } = getCompanyContext(req);
    const requestId = parseInt(req.params.id, 10);
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
    if (![client_1.StaffTimeOffStatus.APPROVED, client_1.StaffTimeOffStatus.REJECTED].includes(status)) {
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
async function cancelTimeOffRequest(req, res) {
    const { companyId, userId, role } = getCompanyContext(req);
    const requestId = parseInt(req.params.id, 10);
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
