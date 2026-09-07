import { Response } from 'express';
import { GroupItemStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as GroupEventService from '../services/group-event.service';
import * as GroupBookingService from '../services/group-booking.service';
import * as GroupAttendanceService from '../services/group-attendance.service';
import { prisma } from '../prisma/client';
import { createWhatsappGroup, isWhatsappEnqueueAccepted, queueWhatsappGroupMessage } from '../utils/whatsappSender';

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

export async function listWhatsappGroups(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) return res.status(400).json({ message: 'Invalid eventId' });

    const event = await prisma.groupEvent.findFirst({ where: { id: eventId, company_id: companyId } });
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const groups = await prisma.whatsappEventGroup.findMany({ where: { group_event_id: eventId }, orderBy: { created_at: 'desc' } });
    return res.json({ groups });
}

export async function createEventWhatsappGroup(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const eventId = parseId(req.params.eventId);
    if (!eventId) return res.status(400).json({ message: 'Invalid eventId' });

    const event = await prisma.groupEvent.findFirst({ where: { id: eventId, company_id: companyId }, include: { company: true } });
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const { groupName, staffPhones = [], includeParticipants = true } = req.body as {
        groupName?: string;
        staffPhones?: string[];
        includeParticipants?: boolean;
    };

    const name = groupName?.trim() || event.title;

    const phones: string[] = [...staffPhones];

    if (includeParticipants) {
        const registrations = await prisma.freeEventRegistration.findMany({
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
    const result = await createWhatsappGroup(name, unique);
    if (!result) return res.status(502).json({ message: 'Failed to create WhatsApp group' });

    const saved = await prisma.whatsappEventGroup.create({
        data: { group_event_id: eventId, group_jid: result.jid, group_name: result.name },
    });
    return res.status(201).json({ group: saved });
}

export async function sendMessageToWhatsappGroup(req: AuthenticatedRequest, res: Response) {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const eventId = parseId(req.params.eventId);
    const groupId = parseId(req.params.groupId);
    if (!eventId || !groupId) return res.status(400).json({ message: 'Invalid params' });

    const group = await prisma.whatsappEventGroup.findFirst({
        where: { id: groupId, group_event_id: eventId, group_event: { company_id: companyId } },
    });
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const { message } = req.body as { message?: string };
    if (!message?.trim()) return res.status(400).json({ message: 'Message is required' });

    const result = await queueWhatsappGroupMessage(group.group_jid, message.trim(), {
        companyId,
        sourceType: 'EVENT_GROUP_MESSAGE',
        sourceId: String(group.id),
        dedupeKey: `event-group-message:${group.id}:${message.trim()}`,
    });
    if (!isWhatsappEnqueueAccepted(result)) {
        return res.status(502).json({ ok: false, message: 'WhatsApp message could not be queued', reason: result.reason });
    }
    return res.json({ ok: true, queued: true, job_id: result.jobId, status: result.status });
}
