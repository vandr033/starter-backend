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
exports.createClass = createClass;
exports.updateClass = updateClass;
exports.setClassStatus = setClassStatus;
exports.listClasses = listClasses;
exports.getClassById = getClassById;
exports.deleteClass = deleteClass;
exports.generateClassSessions = generateClassSessions;
exports.listClassSessions = listClassSessions;
exports.getSessionDetail = getSessionDetail;
exports.cancelSession = cancelSession;
exports.getSessionPublicAttendance = getSessionPublicAttendance;
exports.updateSessionPublicAttendance = updateSessionPublicAttendance;
exports.rotateSessionPublicAttendance = rotateSessionPublicAttendance;
exports.listClassEnrollments = listClassEnrollments;
exports.createClassEnrollmentAdmin = createClassEnrollmentAdmin;
exports.listClassSessionAttendance = listClassSessionAttendance;
const GroupClassService = __importStar(require("../services/group-class.service"));
const GroupSessionService = __importStar(require("../services/group-session.service"));
const GroupBookingService = __importStar(require("../services/group-booking.service"));
const GroupAttendanceService = __importStar(require("../services/group-attendance.service"));
function parseId(raw) {
    if (!raw)
        return null;
    const normalized = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function parseStatus(raw) {
    if (typeof raw !== 'string')
        return undefined;
    if (raw === 'DRAFT' || raw === 'PUBLISHED' || raw === 'ARCHIVED')
        return raw;
    return undefined;
}
function requireCompanyId(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
        return null;
    }
    return companyId;
}
async function createClass(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const payload = req.validated ?? req.body;
    const result = await GroupClassService.createGroupClass(companyId, userId, payload);
    return res.status(result.code).json(result);
}
async function updateClass(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const payload = req.validated ?? req.body;
    const result = await GroupClassService.updateGroupClass(companyId, classId, payload);
    return res.status(result.code).json(result);
}
async function setClassStatus(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const status = parseStatus(req.validated?.status ?? req.body?.status);
    if (!status) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid status' });
    }
    const result = await GroupClassService.setGroupClassStatus(companyId, classId, status);
    return res.status(result.code).json(result);
}
async function listClasses(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const status = parseStatus(req.query.status);
    const result = await GroupClassService.listGroupClasses(companyId, { status });
    return res.status(result.code).json(result);
}
async function getClassById(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const result = await GroupClassService.getGroupClassById(companyId, classId);
    return res.status(result.code).json(result);
}
async function deleteClass(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const result = await GroupClassService.deleteGroupClass(companyId, classId);
    return res.status(result.code).json(result);
}
async function generateClassSessions(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const count = await GroupSessionService.regenerateSessions(companyId, classId);
    return res.status(200).json({ code: 200, error: false, message: 'Sessions generated', data: { created: count } });
}
async function listClassSessions(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
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
async function getSessionDetail(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }
    const result = await GroupSessionService.getSessionDetail(companyId, sessionId);
    return res.status(result.code).json(result);
}
async function cancelSession(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const result = await GroupSessionService.cancelSession(companyId, sessionId, reason);
    return res.status(result.code).json(result);
}
async function getSessionPublicAttendance(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }
    const result = await GroupSessionService.getSessionPublicAttendanceSettings(companyId, sessionId);
    return res.status(result.code).json(result);
}
async function updateSessionPublicAttendance(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }
    const payload = req.validated ?? req.body;
    const result = await GroupSessionService.updateSessionPublicAttendanceSettings(companyId, sessionId, payload);
    return res.status(result.code).json(result);
}
async function rotateSessionPublicAttendance(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }
    const result = await GroupSessionService.rotateSessionPublicAttendanceToken(companyId, sessionId);
    return res.status(result.code).json(result);
}
async function listClassEnrollments(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const classId = parseId(req.params.classId);
    if (!classId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid classId' });
    }
    const result = await GroupBookingService.listClassEnrollments(companyId, classId);
    return res.status(result.code).json(result);
}
async function createClassEnrollmentAdmin(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
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
            phone_prefix: typeof req.body.new_member.phone_prefix === 'string'
                ? req.body.new_member.phone_prefix.trim()
                : '',
            country_code: typeof req.body.new_member.country_code === 'string'
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
async function listClassSessionAttendance(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid sessionId' });
    }
    const result = await GroupAttendanceService.listClassSessionAttendance(companyId, sessionId);
    return res.status(result.code).json(result);
}
