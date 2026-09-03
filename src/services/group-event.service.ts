import { GroupItemStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../prisma/client';
import { MensajeApi } from '../types/MensajeApi';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';
import { sanitizeRichText } from '../utils/richText';
import { parseDateTimeInTimeZone } from '../utils/timezone';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateGroupEventInput {
    title: string;
    slug?: string;
    description?: string | null;
    no_availability_message?: string | null;
    cover_image_url?: string | null;
    thumbnail_url?: string | null;
    is_private?: boolean;
    is_free: boolean;
    price_cents: number;
    max_capacity: number;
    capacity_visible?: boolean;
    registration_question_text?: string | null;
    registration_question_required?: boolean;
    start_at: string; // ISO date-time
    end_at: string;
    location_text?: string | null;
    staff_assignments?: StaffAssignmentInput[];
}

export interface UpdateGroupEventInput {
    title?: string;
    slug?: string;
    description?: string | null;
    no_availability_message?: string | null;
    cover_image_url?: string | null;
    thumbnail_url?: string | null;
    is_private?: boolean;
    is_free?: boolean;
    price_cents?: number;
    max_capacity?: number;
    capacity_visible?: boolean;
    registration_question_text?: string | null;
    registration_question_required?: boolean;
    start_at?: string;
    end_at?: string;
    location_text?: string | null;
    staff_assignments?: StaffAssignmentInput[];
}

export interface StaffAssignmentInput {
    staff_profile_id?: number | null;
    display_name?: string | null;
    display_phone?: string | null;
    role?: 'INSTRUCTOR' | 'ASSISTANT';
}

type ServiceResult = MensajeApi & { data?: any };
type EventBookingSpots = { confirmed: number; pending: number };

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function shortenSlug(base: string, suffix?: string): string {
    const normalizedBase = (base || 'event').slice(0, 255);
    if (!suffix) return normalizedBase;

    const cleanSuffix = suffix.slice(0, 24);
    const maxBaseLength = Math.max(1, 255 - cleanSuffix.length - 1);
    return `${normalizedBase.slice(0, maxBaseLength)}-${cleanSuffix}`;
}

async function resolveUniqueEventSlug(companyId: number, source: string, excludeEventId?: number): Promise<string> {
    const baseSlug = shortenSlug(slugify(source || 'event'));
    const whereBase = {
        company_id: companyId,
        slug: baseSlug,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    };

    const existingBase = await prisma.groupEvent.findFirst({ where: whereBase });
    if (!existingBase) return baseSlug;

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = shortenSlug(baseSlug, randomUUID().slice(0, 8));
        const conflict = await prisma.groupEvent.findFirst({
            where: {
                company_id: companyId,
                slug: candidate,
                ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
            },
        });
        if (!conflict) return candidate;
    }

    return shortenSlug(baseSlug, randomUUID().replace(/-/g, '').slice(0, 12));
}

async function getDefaultCompanyLocationText(companyId: number): Promise<string | null> {
    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { address: true, city: true, state: true },
    });

    if (!company) return null;
    const location = [company.address, company.city, company.state]
        .map((value) => (value ?? '').trim())
        .filter((value) => value.length > 0)
        .join(', ');

    return location.length > 0 ? location : null;
}

async function getCompanyTimeZone(companyId: number): Promise<string> {
    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { timezone: true },
    });

    return company?.timezone || 'UTC';
}

// ─── Service ────────────────────────────────────────────────────────────────

export async function createGroupEvent(companyId: number, userId: string, input: CreateGroupEventInput): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_EVENTS');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group events require Business plan or higher' };
    }

    const slugSource = input.slug?.trim() || input.title;
    const slug = await resolveUniqueEventSlug(companyId, slugSource);

    const timeZone = await getCompanyTimeZone(companyId);
    const startAt = parseDateTimeInTimeZone(input.start_at, timeZone);
    const endAt = parseDateTimeInTimeZone(input.end_at, timeZone);
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

    const event = await prisma.groupEvent.create({
        data: {
            company_id: companyId,
            title: input.title,
            slug,
            description: sanitizeRichText(input.description) ?? null,
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
        await prisma.groupStaffAssignment.createMany({
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

export async function updateGroupEvent(companyId: number, eventId: number, input: UpdateGroupEventInput): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_EVENTS');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group events require Business plan or higher' };
    }

    const existing = await prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Event not found' };
    }

    const updateData: Prisma.GroupEventUpdateInput = {};

    if (input.title !== undefined) updateData.title = input.title;
    if (input.slug !== undefined || input.title !== undefined) {
        const slugSource = input.slug?.trim() || input.title || existing.title;
        updateData.slug = await resolveUniqueEventSlug(companyId, slugSource, eventId);
    }
    if (input.description !== undefined) updateData.description = sanitizeRichText(input.description) ?? null;
    if (input.no_availability_message !== undefined) {
        updateData.no_availability_message = input.no_availability_message?.trim() || null;
    }
    if (input.cover_image_url !== undefined) updateData.cover_image_url = input.cover_image_url;
    if (input.thumbnail_url !== undefined) updateData.thumbnail_url = input.thumbnail_url;
    if (input.is_private !== undefined) updateData.is_private = input.is_private;
    if (input.is_free !== undefined) updateData.is_free = input.is_free;
    if (input.price_cents !== undefined) updateData.price_cents = input.price_cents;
    if (input.max_capacity !== undefined) {
        if (input.max_capacity < 1) {
            return { code: 400, error: true, message: 'max_capacity must be at least 1' };
        }
        updateData.max_capacity = input.max_capacity;
    }
    if (input.capacity_visible !== undefined) updateData.capacity_visible = input.capacity_visible;
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
    if (input.start_at !== undefined) updateData.start_at = parseDateTimeInTimeZone(input.start_at, timeZone);
    if (input.end_at !== undefined) updateData.end_at = parseDateTimeInTimeZone(input.end_at, timeZone);
    if (input.location_text !== undefined) updateData.location_text = input.location_text;

    const finalStartAt = input.start_at ? parseDateTimeInTimeZone(input.start_at, timeZone) : existing.start_at;
    const finalEndAt = input.end_at ? parseDateTimeInTimeZone(input.end_at, timeZone) : existing.end_at;
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
    } else {
        updateData.no_availability_message = null;
    }

    await prisma.groupEvent.update({
        where: { id: eventId },
        data: updateData,
    });

    // Replace staff assignments if provided
    if (input.staff_assignments !== undefined) {
        await prisma.groupStaffAssignment.deleteMany({
            where: { group_event_id: eventId },
        });
        if (input.staff_assignments.length > 0) {
            await prisma.groupStaffAssignment.createMany({
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

export async function setGroupEventStatus(companyId: number, eventId: number, status: GroupItemStatus): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_EVENTS');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group events require Business plan or higher' };
    }

    const existing = await prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Event not found' };
    }

    await prisma.groupEvent.update({
        where: { id: eventId },
        data: { status },
    });

    return { code: 200, error: false, message: `Event ${status.toLowerCase()}` };
}

export async function deleteGroupEvent(companyId: number, eventId: number): Promise<ServiceResult> {
    const existing = await prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Event not found' };
    }

    await prisma.groupEvent.update({
        where: { id: eventId },
        data: { deleted_at: new Date() },
    });

    return { code: 200, error: false, message: 'Event deleted' };
}

export async function listGroupEvents(companyId: number, filters?: {
    status?: GroupItemStatus;
    upcoming?: boolean;
    isPrivate?: boolean;
}): Promise<ServiceResult> {
    const where: Prisma.GroupEventWhereInput = {
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

    const events = await prisma.groupEvent.findMany({
        where,
        include: {
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
            description: sanitizeRichText(event.description) ?? null,
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

export async function getGroupEventById(companyId: number, eventId: number): Promise<ServiceResult> {
    const event = await getEventWithRelations(eventId, companyId);
    if (!event) {
        return { code: 404, error: true, message: 'Event not found' };
    }
    return { code: 200, error: false, message: 'Event retrieved', data: event };
}

// ─── Private ────────────────────────────────────────────────────────────────

async function getEventWithRelations(eventId: number, companyId: number) {
    const event = await prisma.groupEvent.findFirst({
        where: { id: eventId, company_id: companyId, deleted_at: null },
        include: {
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

    if (!event) return null;

    const spotsByEvent = await getEventBookingSpots(companyId, [event.id]);
    const spots = spotsByEvent.get(event.id) ?? { confirmed: 0, pending: 0 };

    return {
        ...event,
        description: sanitizeRichText(event.description) ?? null,
        _count: {
            ...event._count,
            bookings: spots.confirmed,
        },
        booked_spots_confirmed: spots.confirmed,
        booked_spots_pending: spots.pending,
    };
}

async function getEventBookingSpots(companyId: number, eventIds: number[]): Promise<Map<number, EventBookingSpots>> {
    const result = new Map<number, EventBookingSpots>();
    if (eventIds.length === 0) return result;

    const [bookingRows, freeRegistrationRows] = await Promise.all([
        prisma.groupEventBooking.groupBy({
            by: ['group_event_id', 'status'],
            where: {
                company_id: companyId,
                group_event_id: { in: eventIds },
                status: { in: ['CONFIRMED', 'PENDING'] },
            },
            _sum: { booked_spots: true },
        }),
        prisma.freeEventRegistration.groupBy({
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
        } else if (row.status === 'PENDING') {
            current.pending += spots;
        }
        result.set(row.group_event_id, current);
    }

    for (const row of freeRegistrationRows) {
        const current = result.get(row.group_event_id) ?? { confirmed: 0, pending: 0 };
        const spots = row._count._all ?? 0;
        if (row.status === 'CONFIRMED') {
            current.confirmed += spots;
        } else if (row.status === 'PENDING') {
            current.pending += spots;
        }
        result.set(row.group_event_id, current);
    }

    return result;
}
