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
exports.createGroupEvent = createGroupEvent;
exports.updateGroupEvent = updateGroupEvent;
exports.setGroupEventStatus = setGroupEventStatus;
exports.deleteGroupEvent = deleteGroupEvent;
exports.listGroupEvents = listGroupEvents;
exports.getGroupEventById = getGroupEventById;
const crypto_1 = require("crypto");
const client_1 = require("../prisma/client");
const plan_enforcement_service_1 = require("./plan-enforcement.service");
const richText_1 = require("../utils/richText");
const timezone_1 = require("../utils/timezone");
const CategoryRepo = __importStar(require("../repositories/category.repo"));
// ─── Helpers ────────────────────────────────────────────────────────────────
function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
function shortenSlug(base, suffix) {
    const normalizedBase = (base || 'event').slice(0, 255);
    if (!suffix)
        return normalizedBase;
    const cleanSuffix = suffix.slice(0, 24);
    const maxBaseLength = Math.max(1, 255 - cleanSuffix.length - 1);
    return `${normalizedBase.slice(0, maxBaseLength)}-${cleanSuffix}`;
}
async function resolveUniqueEventSlug(companyId, source, excludeEventId) {
    const baseSlug = shortenSlug(slugify(source || 'event'));
    const whereBase = {
        company_id: companyId,
        slug: baseSlug,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    };
    const existingBase = await client_1.prisma.groupEvent.findFirst({ where: whereBase });
    if (!existingBase)
        return baseSlug;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = shortenSlug(baseSlug, (0, crypto_1.randomUUID)().slice(0, 8));
        const conflict = await client_1.prisma.groupEvent.findFirst({
            where: {
                company_id: companyId,
                slug: candidate,
                ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
            },
        });
        if (!conflict)
            return candidate;
    }
    return shortenSlug(baseSlug, (0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12));
}
async function getDefaultCompanyLocationText(companyId) {
    const company = await client_1.prisma.company.findUnique({
        where: { id: companyId },
        select: { address: true, city: true, state: true },
    });
    if (!company)
        return null;
    const location = [company.address, company.city, company.state]
        .map((value) => (value ?? '').trim())
        .filter((value) => value.length > 0)
        .join(', ');
    return location.length > 0 ? location : null;
}
async function getCompanyTimeZone(companyId) {
    const company = await client_1.prisma.company.findUnique({
        where: { id: companyId },
        select: { timezone: true },
    });
    return company?.timezone || 'UTC';
}
// ─── Service ────────────────────────────────────────────────────────────────
async function createGroupEvent(companyId, userId, input) {
    const canUse = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'GROUP_EVENTS');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group events require Business plan or higher' };
    }
    if (!(await CategoryRepo.getCategoryById(input.category_id, companyId))) {
        return { code: 400, error: true, message: 'Category not found for this company' };
    }
    const slugSource = input.slug?.trim() || input.title;
    const slug = await resolveUniqueEventSlug(companyId, slugSource);
    const timeZone = await getCompanyTimeZone(companyId);
    const startAt = (0, timezone_1.parseDateTimeInTimeZone)(input.start_at, timeZone);
    const endAt = (0, timezone_1.parseDateTimeInTimeZone)(input.end_at, timeZone);
    if (endAt <= startAt) {
        return { code: 400, error: true, message: 'end_at must be after start_at' };
    }
    if (input.max_capacity < 1) {
        return { code: 400, error: true, message: 'max_capacity must be at least 1' };
    }
    if (!input.is_free && input.price_cents < 0) {
        return { code: 400, error: true, message: 'price_cents must be non-negative' };
    }
    const requestedLocation = input.location_text?.trim() ?? '';
    const locationText = requestedLocation.length > 0
        ? requestedLocation
        : await getDefaultCompanyLocationText(companyId);
    const noAvailabilityMessage = input.is_free
        ? (input.no_availability_message?.trim() || null)
        : null;
    const registrationQuestionText = input.registration_question_text?.trim() || null;
    if (input.registration_question_required && !registrationQuestionText) {
        return { code: 400, error: true, message: 'A registration question is required before it can be marked required' };
    }
    const event = await client_1.prisma.groupEvent.create({
        data: {
            company_id: companyId,
            category_id: input.category_id,
            title: input.title,
            slug,
            description: (0, richText_1.sanitizeRichText)(input.description) ?? null,
            no_availability_message: noAvailabilityMessage,
            cover_image_url: input.cover_image_url ?? null,
            thumbnail_url: input.thumbnail_url ?? null,
            is_private: input.is_private ?? false,
            is_free: input.is_free,
            price_cents: input.is_free ? 0 : input.price_cents,
            max_capacity: input.max_capacity,
            capacity_visible: input.capacity_visible ?? false,
            registration_question_text: registrationQuestionText,
            registration_question_required: registrationQuestionText ? (input.registration_question_required ?? false) : false,
            start_at: startAt,
            end_at: endAt,
            location_text: locationText,
            created_by_user_id: userId,
        },
    });
    // Create staff assignments
    if (input.staff_assignments?.length) {
        await client_1.prisma.groupStaffAssignment.createMany({
            data: input.staff_assignments.map((sa) => ({
                company_id: companyId,
                group_event_id: event.id,
                staff_profile_id: sa.staff_profile_id ?? null,
                display_name: sa.display_name ?? null,
                display_phone: sa.display_phone ?? null,
                role: sa.role ?? 'INSTRUCTOR',
            })),
        });
    }
    const full = await getEventWithRelations(event.id, companyId);
    return { code: 201, error: false, message: 'Event created', data: full };
}
async function updateGroupEvent(companyId, eventId, input) {
    const canUse = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'GROUP_EVENTS');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group events require Business plan or higher' };
    }
    const existing = await client_1.prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Event not found' };
    }
    const updateData = {};
    if (input.title !== undefined)
        updateData.title = input.title;
    if (input.category_id !== undefined) {
        if (!(await CategoryRepo.getCategoryById(input.category_id, companyId))) {
            return { code: 400, error: true, message: 'Category not found for this company' };
        }
        updateData.category = { connect: { id: input.category_id } };
    }
    if (input.slug !== undefined || input.title !== undefined) {
        const slugSource = input.slug?.trim() || input.title || existing.title;
        updateData.slug = await resolveUniqueEventSlug(companyId, slugSource, eventId);
    }
    if (input.description !== undefined)
        updateData.description = (0, richText_1.sanitizeRichText)(input.description) ?? null;
    if (input.no_availability_message !== undefined) {
        updateData.no_availability_message = input.no_availability_message?.trim() || null;
    }
    if (input.cover_image_url !== undefined)
        updateData.cover_image_url = input.cover_image_url;
    if (input.thumbnail_url !== undefined)
        updateData.thumbnail_url = input.thumbnail_url;
    if (input.is_private !== undefined)
        updateData.is_private = input.is_private;
    if (input.is_free !== undefined)
        updateData.is_free = input.is_free;
    if (input.price_cents !== undefined)
        updateData.price_cents = input.price_cents;
    if (input.max_capacity !== undefined) {
        if (input.max_capacity < 1) {
            return { code: 400, error: true, message: 'max_capacity must be at least 1' };
        }
        updateData.max_capacity = input.max_capacity;
    }
    if (input.capacity_visible !== undefined)
        updateData.capacity_visible = input.capacity_visible;
    if (input.registration_question_text !== undefined || input.registration_question_required !== undefined) {
        const finalQuestionText = input.registration_question_text !== undefined
            ? input.registration_question_text?.trim() || null
            : existing.registration_question_text;
        const finalQuestionRequired = input.registration_question_required ?? existing.registration_question_required;
        if (finalQuestionRequired && !finalQuestionText) {
            return { code: 400, error: true, message: 'A registration question is required before it can be marked required' };
        }
        updateData.registration_question_text = finalQuestionText;
        updateData.registration_question_required = finalQuestionText ? finalQuestionRequired : false;
    }
    const timeZone = await getCompanyTimeZone(companyId);
    if (input.start_at !== undefined)
        updateData.start_at = (0, timezone_1.parseDateTimeInTimeZone)(input.start_at, timeZone);
    if (input.end_at !== undefined)
        updateData.end_at = (0, timezone_1.parseDateTimeInTimeZone)(input.end_at, timeZone);
    if (input.location_text !== undefined)
        updateData.location_text = input.location_text;
    const finalStartAt = input.start_at ? (0, timezone_1.parseDateTimeInTimeZone)(input.start_at, timeZone) : existing.start_at;
    const finalEndAt = input.end_at ? (0, timezone_1.parseDateTimeInTimeZone)(input.end_at, timeZone) : existing.end_at;
    if (finalEndAt <= finalStartAt) {
        return { code: 400, error: true, message: 'end_at must be after start_at' };
    }
    const finalIsFree = input.is_free ?? existing.is_free;
    const finalPrice = input.price_cents ?? existing.price_cents;
    if (!finalIsFree && finalPrice < 0) {
        return { code: 400, error: true, message: 'price_cents must be non-negative' };
    }
    if (finalIsFree) {
        updateData.price_cents = 0;
    }
    else {
        updateData.no_availability_message = null;
    }
    await client_1.prisma.groupEvent.update({
        where: { id: eventId },
        data: updateData,
    });
    // Replace staff assignments if provided
    if (input.staff_assignments !== undefined) {
        await client_1.prisma.groupStaffAssignment.deleteMany({
            where: { group_event_id: eventId },
        });
        if (input.staff_assignments.length > 0) {
            await client_1.prisma.groupStaffAssignment.createMany({
                data: input.staff_assignments.map((sa) => ({
                    company_id: companyId,
                    group_event_id: eventId,
                    staff_profile_id: sa.staff_profile_id ?? null,
                    display_name: sa.display_name ?? null,
                    display_phone: sa.display_phone ?? null,
                    role: sa.role ?? 'INSTRUCTOR',
                })),
            });
        }
    }
    const full = await getEventWithRelations(eventId, companyId);
    return { code: 200, error: false, message: 'Event updated', data: full };
}
async function setGroupEventStatus(companyId, eventId, status) {
    const canUse = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'GROUP_EVENTS');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group events require Business plan or higher' };
    }
    const existing = await client_1.prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Event not found' };
    }
    await client_1.prisma.groupEvent.update({
        where: { id: eventId },
        data: { status },
    });
    return { code: 200, error: false, message: `Event ${status.toLowerCase()}` };
}
async function deleteGroupEvent(companyId, eventId) {
    const existing = await client_1.prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Event not found' };
    }
    await client_1.prisma.groupEvent.update({
        where: { id: eventId },
        data: { deleted_at: new Date() },
    });
    return { code: 200, error: false, message: 'Event deleted' };
}
async function listGroupEvents(companyId, filters) {
    const where = {
        company_id: companyId,
        deleted_at: null,
    };
    if (filters?.status) {
        where.status = filters.status;
    }
    if (filters?.upcoming) {
        where.start_at = { gte: new Date() };
    }
    if (filters?.isPrivate !== undefined) {
        where.is_private = filters.isPrivate;
    }
    const events = await client_1.prisma.groupEvent.findMany({
        where,
        include: {
            category: { select: { id: true, name: true, slug: true, position: true } },
            staff_assignments: {
                include: { staff_profile: { select: { id: true, display_name: true, image_url: true } } },
            },
            _count: {
                select: {
                    bookings: { where: { status: 'CONFIRMED' } },
                },
            },
        },
        orderBy: { start_at: 'asc' },
    });
    const spotsByEvent = await getEventBookingSpots(companyId, events.map((event) => event.id));
    const withBookingSpots = events.map((event) => {
        const spots = spotsByEvent.get(event.id) ?? { confirmed: 0, pending: 0 };
        return {
            ...event,
            description: (0, richText_1.sanitizeRichText)(event.description) ?? null,
            _count: {
                ...event._count,
                // Keep the existing response shape while reporting real seat usage.
                bookings: spots.confirmed,
            },
            booked_spots_confirmed: spots.confirmed,
            booked_spots_pending: spots.pending,
        };
    });
    return { code: 200, error: false, message: 'Events retrieved', data: withBookingSpots };
}
async function getGroupEventById(companyId, eventId) {
    const event = await getEventWithRelations(eventId, companyId);
    if (!event) {
        return { code: 404, error: true, message: 'Event not found' };
    }
    return { code: 200, error: false, message: 'Event retrieved', data: event };
}
// ─── Private ────────────────────────────────────────────────────────────────
async function getEventWithRelations(eventId, companyId) {
    const event = await client_1.prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
        include: {
            category: { select: { id: true, name: true, slug: true, position: true } },
            staff_assignments: {
                include: { staff_profile: { select: { id: true, display_name: true, image_url: true } } },
            },
            _count: {
                select: {
                    bookings: { where: { status: 'CONFIRMED' } },
                    interests: true,
                },
            },
        },
    });
    if (!event)
        return null;
    const spotsByEvent = await getEventBookingSpots(companyId, [event.id]);
    const spots = spotsByEvent.get(event.id) ?? { confirmed: 0, pending: 0 };
    return {
        ...event,
        description: (0, richText_1.sanitizeRichText)(event.description) ?? null,
        _count: {
            ...event._count,
            bookings: spots.confirmed,
        },
        booked_spots_confirmed: spots.confirmed,
        booked_spots_pending: spots.pending,
    };
}
async function getEventBookingSpots(companyId, eventIds) {
    const result = new Map();
    if (eventIds.length === 0)
        return result;
    const [bookingRows, freeRegistrationRows] = await Promise.all([
        client_1.prisma.groupEventBooking.groupBy({
            by: ['group_event_id', 'status'],
            where: {
                company_id: companyId,
                group_event_id: { in: eventIds },
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
            _sum: { booked_spots: true },
        }),
        client_1.prisma.freeEventRegistration.groupBy({
            by: ['group_event_id', 'status'],
            where: {
                company_id: companyId,
                group_event_id: { in: eventIds },
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
            _count: { _all: true },
        }),
    ]);
    for (const row of bookingRows) {
        const current = result.get(row.group_event_id) ?? { confirmed: 0, pending: 0 };
        const spots = row._sum.booked_spots ?? 0;
        if (row.status === 'CONFIRMED') {
            current.confirmed += spots;
        }
        else if (row.status === 'PENDING') {
            current.pending += spots;
        }
        result.set(row.group_event_id, current);
    }
    for (const row of freeRegistrationRows) {
        const current = result.get(row.group_event_id) ?? { confirmed: 0, pending: 0 };
        const spots = row._count._all ?? 0;
        if (row.status === 'CONFIRMED') {
            current.confirmed += spots;
        }
        else if (row.status === 'PENDING') {
            current.pending += spots;
        }
        result.set(row.group_event_id, current);
    }
    return result;
}
