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
exports.createEvent = createEvent;
exports.updateEvent = updateEvent;
exports.setEventStatus = setEventStatus;
exports.listEvents = listEvents;
exports.getEventById = getEventById;
exports.deleteEvent = deleteEvent;
exports.listEventBookings = listEventBookings;
exports.listEventInterests = listEventInterests;
exports.listEventAttendance = listEventAttendance;
exports.listWhatsappGroups = listWhatsappGroups;
exports.createEventWhatsappGroup = createEventWhatsappGroup;
exports.sendMessageToWhatsappGroup = sendMessageToWhatsappGroup;
const GroupEventService = __importStar(require("../services/group-event.service"));
const GroupBookingService = __importStar(require("../services/group-booking.service"));
const GroupAttendanceService = __importStar(require("../services/group-attendance.service"));
const client_1 = require("../prisma/client");
const whatsappSender_1 = require("../utils/whatsappSender");
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
async function createEvent(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const payload = req.validated ?? req.body;
    const result = await GroupEventService.createGroupEvent(companyId, userId, payload);
    return res.status(result.code).json(result);
}
async function updateEvent(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const payload = req.validated ?? req.body;
    const result = await GroupEventService.updateGroupEvent(companyId, eventId, payload);
    return res.status(result.code).json(result);
}
async function setEventStatus(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const status = parseStatus(req.validated?.status ?? req.body?.status);
    if (!status) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid status' });
    }
    const result = await GroupEventService.setGroupEventStatus(companyId, eventId, status);
    return res.status(result.code).json(result);
}
async function listEvents(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const status = parseStatus(req.query.status);
    const upcoming = req.query.upcoming === 'true';
    const result = await GroupEventService.listGroupEvents(companyId, {
        status,
        upcoming,
    });
    return res.status(result.code).json(result);
}
async function getEventById(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupEventService.getGroupEventById(companyId, eventId);
    return res.status(result.code).json(result);
}
async function deleteEvent(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupEventService.deleteGroupEvent(companyId, eventId);
    return res.status(result.code).json(result);
}
async function listEventBookings(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupBookingService.listEventBookings(companyId, eventId);
    return res.status(result.code).json(result);
}
async function listEventInterests(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupBookingService.listEventInterests(companyId, eventId);
    return res.status(result.code).json(result);
}
async function listEventAttendance(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid eventId' });
    }
    const result = await GroupAttendanceService.listEventAttendance(companyId, eventId);
    return res.status(result.code).json(result);
}
async function listWhatsappGroups(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId)
        return res.status(400).json({ message: 'Invalid eventId' });
    const event = await client_1.prisma.groupEvent.findFirst({ where: { id: eventId, company_id: companyId } });
    if (!event)
        return res.status(404).json({ message: 'Event not found' });
    const groups = await client_1.prisma.whatsappEventGroup.findMany({ where: { group_event_id: eventId }, orderBy: { created_at: 'desc' } });
    return res.json({ groups });
}
async function createEventWhatsappGroup(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    if (!eventId)
        return res.status(400).json({ message: 'Invalid eventId' });
    const event = await client_1.prisma.groupEvent.findFirst({ where: { id: eventId, company_id: companyId }, include: { company: true } });
    if (!event)
        return res.status(404).json({ message: 'Event not found' });
    const { groupName, staffPhones = [], includeParticipants = true } = req.body;
    const name = groupName?.trim() || event.title;
    const phones = [...staffPhones];
    if (includeParticipants) {
        const registrations = await client_1.prisma.freeEventRegistration.findMany({
            where: { group_event_id: eventId, status: 'CONFIRMED' },
            select: { phone_prefix: true, phone_number: true },
        });
        for (const r of registrations) {
            if (r.phone_prefix && r.phone_number) {
                phones.push(`${r.phone_prefix.replace(/\D/g, '')}${r.phone_number.replace(/\D/g, '')}`);
            }
        }
    }
    const unique = [...new Set(phones.filter(Boolean))];
    const result = await (0, whatsappSender_1.createWhatsappGroup)(name, unique);
    if (!result)
        return res.status(502).json({ message: 'Failed to create WhatsApp group' });
    const saved = await client_1.prisma.whatsappEventGroup.create({
        data: { group_event_id: eventId, group_jid: result.jid, group_name: result.name },
    });
    return res.status(201).json({ group: saved });
}
async function sendMessageToWhatsappGroup(req, res) {
    const companyId = requireCompanyId(req, res);
    if (!companyId)
        return;
    const eventId = parseId(req.params.eventId);
    const groupId = parseId(req.params.groupId);
    if (!eventId || !groupId)
        return res.status(400).json({ message: 'Invalid params' });
    const group = await client_1.prisma.whatsappEventGroup.findFirst({
        where: { id: groupId, group_event_id: eventId, group_event: { company_id: companyId } },
    });
    if (!group)
        return res.status(404).json({ message: 'Group not found' });
    const { message } = req.body;
    if (!message?.trim())
        return res.status(400).json({ message: 'Message is required' });
    const result = await (0, whatsappSender_1.queueWhatsappGroupMessage)(group.group_jid, message.trim(), {
        companyId,
        sourceType: 'EVENT_GROUP_MESSAGE',
        sourceId: String(group.id),
        dedupeKey: `event-group-message:${group.id}:${message.trim()}`,
    });
    if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
        return res.status(502).json({ ok: false, message: 'WhatsApp message could not be queued', reason: result.reason });
    }
    return res.json({ ok: true, queued: true, job_id: result.jobId, status: result.status });
}
