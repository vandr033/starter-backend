import { GroupItemStatus, Prisma, RecurrenceType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../prisma/client';
import { logger } from '../config/logger';
import { MensajeApi } from '../types/MensajeApi';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';
import { validateRecurrenceConfig } from '../utils/recurrence';
import { generateSessions, regenerateSessions } from './group-session.service';
import { sanitizeRichText } from '../utils/richText';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateGroupClassInput {
    title: string;
    slug?: string;
    description?: string | null;
    cover_image_url?: string | null;
    thumbnail_url?: string | null;
    pricing_mode: 'PER_SESSION' | 'WEEKLY_PASS' | 'MONTHLY_PASS' | 'FULL_COURSE';
    price_cents: number;
    monthly_price_cents?: number | null;
    billing_day?: number | null;
    max_capacity_per_session: number;
    capacity_visible?: boolean;
    session_duration_minutes: number;
    recurrence_type: RecurrenceType;
    recurrence_config: Record<string, unknown>;
    recurrence_start_date: string; // YYYY-MM-DD
    recurrence_end_date?: string | null;
    start_time: string; // HH:MM
    location_text?: string | null;
    staff_assignments?: StaffAssignmentInput[];
}

export interface UpdateGroupClassInput {
    title?: string;
    slug?: string;
    description?: string | null;
    cover_image_url?: string | null;
    thumbnail_url?: string | null;
    pricing_mode?: 'PER_SESSION' | 'WEEKLY_PASS' | 'MONTHLY_PASS' | 'FULL_COURSE';
    price_cents?: number;
    monthly_price_cents?: number | null;
    billing_day?: number | null;
    max_capacity_per_session?: number;
    capacity_visible?: boolean;
    session_duration_minutes?: number;
    recurrence_type?: RecurrenceType;
    recurrence_config?: Record<string, unknown>;
    recurrence_start_date?: string;
    recurrence_end_date?: string | null;
    start_time?: string;
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
    const normalizedBase = (base || 'class').slice(0, 255);
    if (!suffix) return normalizedBase;

    const cleanSuffix = suffix.slice(0, 24);
    const maxBaseLength = Math.max(1, 255 - cleanSuffix.length - 1);
    return `${normalizedBase.slice(0, maxBaseLength)}-${cleanSuffix}`;
}

async function resolveUniqueClassSlug(companyId: number, source: string, excludeClassId?: number): Promise<string> {
    const baseSlug = shortenSlug(slugify(source || 'class'));
    const whereBase = {
        company_id: companyId,
        slug: baseSlug,
        ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
    };

    const existingBase = await prisma.groupClass.findFirst({ where: whereBase });
    if (!existingBase) return baseSlug;

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = shortenSlug(baseSlug, randomUUID().slice(0, 8));
        const conflict = await prisma.groupClass.findFirst({
            where: {
                company_id: companyId,
                slug: candidate,
                ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
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

function parseDateOnlyToUtc(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        return null;
    }

    return parsed;
}

// ─── Service ────────────────────────────────────────────────────────────────

export async function createGroupClass(companyId: number, userId: string, input: CreateGroupClassInput): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_CLASSES');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group classes require Pro plan' };
    }

    // Validate recurrence config
    const configError = validateRecurrenceConfig(input.recurrence_type, input.recurrence_config);
    if (configError) {
        return { code: 400, error: true, message: configError };
    }

    const slugSource = input.slug?.trim() || input.title;
    const slug = await resolveUniqueClassSlug(companyId, slugSource);

    if (input.max_capacity_per_session < 1) {
        return { code: 400, error: true, message: 'max_capacity_per_session must be at least 1' };
    }
    if (input.session_duration_minutes < 5) {
        return { code: 400, error: true, message: 'session_duration_minutes must be at least 5' };
    }
    if (input.price_cents < 0) {
        return { code: 400, error: true, message: 'price_cents must be non-negative' };
    }
    if (input.pricing_mode === 'FULL_COURSE') {
        if (!input.monthly_price_cents || input.monthly_price_cents <= 0) {
            return { code: 400, error: true, message: 'monthly_price_cents is required and must be positive for FULL_COURSE classes' };
        }
        if (!input.billing_day || input.billing_day < 1 || input.billing_day > 28) {
            return { code: 400, error: true, message: 'billing_day is required and must be between 1 and 28 for FULL_COURSE classes' };
        }
        if (!input.recurrence_end_date) {
            return { code: 400, error: true, message: 'recurrence_end_date is required for FULL_COURSE classes' };
        }
    }

    const recurrenceStartDate = parseDateOnlyToUtc(input.recurrence_start_date);
    if (!recurrenceStartDate) {
        return { code: 400, error: true, message: 'recurrence_start_date must be a valid YYYY-MM-DD date' };
    }

    const recurrenceEndDate = input.recurrence_end_date ? parseDateOnlyToUtc(input.recurrence_end_date) : null;
    if (input.recurrence_end_date && !recurrenceEndDate) {
        return { code: 400, error: true, message: 'recurrence_end_date must be a valid YYYY-MM-DD date' };
    }
    if (recurrenceEndDate && recurrenceEndDate.getTime() < recurrenceStartDate.getTime()) {
        return { code: 400, error: true, message: 'recurrence_end_date must be on or after recurrence_start_date' };
    }

    const requestedLocation = input.location_text?.trim() ?? '';
    const locationText = requestedLocation.length > 0
        ? requestedLocation
        : await getDefaultCompanyLocationText(companyId);

    const groupClass = await prisma.groupClass.create({
        data: {
            company_id: companyId,
            title: input.title,
            slug,
            description: sanitizeRichText(input.description) ?? null,
            cover_image_url: input.cover_image_url ?? null,
            thumbnail_url: input.thumbnail_url ?? null,
            pricing_mode: input.pricing_mode,
            price_cents: input.price_cents,
            monthly_price_cents: input.monthly_price_cents ?? null,
            billing_day: input.billing_day ?? null,
            max_capacity_per_session: input.max_capacity_per_session,
            capacity_visible: input.capacity_visible ?? false,
            session_duration_minutes: input.session_duration_minutes,
            recurrence_type: input.recurrence_type,
            recurrence_config: input.recurrence_config as any,
            recurrence_start_date: recurrenceStartDate,
            recurrence_end_date: recurrenceEndDate,
            start_time: input.start_time,
            location_text: locationText,
            created_by_user_id: userId,
        },
    });

    // Create staff assignments
    if (input.staff_assignments?.length) {
        await prisma.groupStaffAssignment.createMany({
            data: input.staff_assignments.map((sa) => ({
                company_id: companyId,
                group_class_id: groupClass.id,
                staff_profile_id: sa.staff_profile_id ?? null,
                display_name: sa.display_name ?? null,
                display_phone: sa.display_phone ?? null,
                role: sa.role ?? 'INSTRUCTOR',
            })),
        });
    }

    // Auto-generate sessions
    const sessionCount = await generateSessions(companyId, groupClass.id);
    logger.info(`Generated ${sessionCount} sessions for class ${groupClass.id}`);

    const full = await getClassWithRelations(groupClass.id, companyId);
    return { code: 201, error: false, message: 'Class created', data: full };
}

export async function updateGroupClass(companyId: number, classId: number, input: UpdateGroupClassInput): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_CLASSES');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group classes require Pro plan' };
    }

    const existing = await prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Class not found' };
    }

    const updateData: Prisma.GroupClassUpdateInput = {};

    if (input.title !== undefined) updateData.title = input.title;
    if (input.slug !== undefined || input.title !== undefined) {
        const slugSource = input.slug?.trim() || input.title || existing.title;
        updateData.slug = await resolveUniqueClassSlug(companyId, slugSource, classId);
    }
    if (input.description !== undefined) updateData.description = sanitizeRichText(input.description) ?? null;
    if (input.cover_image_url !== undefined) updateData.cover_image_url = input.cover_image_url;
    if (input.thumbnail_url !== undefined) updateData.thumbnail_url = input.thumbnail_url;
    if (input.pricing_mode !== undefined) updateData.pricing_mode = input.pricing_mode;
    if (input.price_cents !== undefined) {
        if (input.price_cents < 0) {
            return { code: 400, error: true, message: 'price_cents must be non-negative' };
        }
        updateData.price_cents = input.price_cents;
    }
    if (input.monthly_price_cents !== undefined) updateData.monthly_price_cents = input.monthly_price_cents;
    if (input.billing_day !== undefined) updateData.billing_day = input.billing_day;
    if (input.max_capacity_per_session !== undefined) {
        if (input.max_capacity_per_session < 1) {
            return { code: 400, error: true, message: 'max_capacity_per_session must be at least 1' };
        }
        updateData.max_capacity_per_session = input.max_capacity_per_session;
    }
    if (input.capacity_visible !== undefined) updateData.capacity_visible = input.capacity_visible;
    if (input.session_duration_minutes !== undefined) {
        if (input.session_duration_minutes < 5) {
            return { code: 400, error: true, message: 'session_duration_minutes must be at least 5' };
        }
        updateData.session_duration_minutes = input.session_duration_minutes;
    }
    if (input.location_text !== undefined) updateData.location_text = input.location_text;

    // If recurrence changed, validate and regenerate sessions
    let recurrenceChanged = false;
    if (input.start_time !== undefined && input.start_time !== existing.start_time) {
        updateData.start_time = input.start_time;
        recurrenceChanged = true;
    } else if (input.start_time !== undefined) {
        updateData.start_time = input.start_time;
    }
    if (input.recurrence_type !== undefined) {
        updateData.recurrence_type = input.recurrence_type;
        recurrenceChanged = true;
    }
    if (input.recurrence_config !== undefined) {
        const finalType = input.recurrence_type ?? existing.recurrence_type;
        const configError = validateRecurrenceConfig(finalType, input.recurrence_config);
        if (configError) {
            return { code: 400, error: true, message: configError };
        }
        updateData.recurrence_config = input.recurrence_config as any;
        recurrenceChanged = true;
    }
    if (input.recurrence_start_date !== undefined) {
        const parsedStartDate = parseDateOnlyToUtc(input.recurrence_start_date);
        if (!parsedStartDate) {
            return { code: 400, error: true, message: 'recurrence_start_date must be a valid YYYY-MM-DD date' };
        }
        updateData.recurrence_start_date = parsedStartDate;
        recurrenceChanged = true;
    }
    if (input.recurrence_end_date !== undefined) {
        if (input.recurrence_end_date) {
            const parsedEndDate = parseDateOnlyToUtc(input.recurrence_end_date);
            if (!parsedEndDate) {
                return { code: 400, error: true, message: 'recurrence_end_date must be a valid YYYY-MM-DD date' };
            }
            updateData.recurrence_end_date = parsedEndDate;
        } else {
            updateData.recurrence_end_date = null;
        }
        recurrenceChanged = true;
    }

    const finalRecurrenceType = input.recurrence_type ?? existing.recurrence_type;
    const finalRecurrenceConfig = (input.recurrence_config ?? existing.recurrence_config) as Record<string, unknown>;
    if (recurrenceChanged) {
        const configError = validateRecurrenceConfig(finalRecurrenceType, finalRecurrenceConfig);
        if (configError) {
            return { code: 400, error: true, message: configError };
        }

        const finalStartDate = (updateData.recurrence_start_date as Date | undefined) ?? existing.recurrence_start_date;
        const finalEndDate = Object.prototype.hasOwnProperty.call(updateData, 'recurrence_end_date')
            ? (updateData.recurrence_end_date as Date | null)
            : existing.recurrence_end_date;
        if (finalEndDate && finalEndDate.getTime() < finalStartDate.getTime()) {
            return { code: 400, error: true, message: 'recurrence_end_date must be on or after recurrence_start_date' };
        }
    }

    await prisma.groupClass.update({
        where: { id: classId },
        data: updateData,
    });

    // Replace staff assignments if provided
    if (input.staff_assignments !== undefined) {
        await prisma.groupStaffAssignment.deleteMany({
            where: { group_class_id: classId },
        });
        if (input.staff_assignments.length > 0) {
            await prisma.groupStaffAssignment.createMany({
                data: input.staff_assignments.map((sa) => ({
                    company_id: companyId,
                    group_class_id: classId,
                    staff_profile_id: sa.staff_profile_id ?? null,
                    display_name: sa.display_name ?? null,
                    display_phone: sa.display_phone ?? null,
                    role: sa.role ?? 'INSTRUCTOR',
                })),
            });
        }
    }

    // Regenerate future sessions if schedule changed
    if (recurrenceChanged) {
        const count = await regenerateSessions(companyId, classId);
        logger.info(`Regenerated ${count} sessions for class ${classId}`);
    }

    const full = await getClassWithRelations(classId, companyId);
    return { code: 200, error: false, message: 'Class updated', data: full };
}

export async function setGroupClassStatus(companyId: number, classId: number, status: GroupItemStatus): Promise<ServiceResult> {
    const canUse = await isFeatureEnabledForCompany(companyId, 'GROUP_CLASSES');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group classes require Pro plan' };
    }

    const existing = await prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Class not found' };
    }

    await prisma.groupClass.update({
        where: { id: classId },
        data: { status },
    });

    return { code: 200, error: false, message: `Class ${status.toLowerCase()}` };
}

export async function deleteGroupClass(companyId: number, classId: number): Promise<ServiceResult> {
    const existing = await prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Class not found' };
    }

    await prisma.groupClass.update({
        where: { id: classId },
        data: { deleted_at: new Date() },
    });

    return { code: 200, error: false, message: 'Class deleted' };
}

export async function listGroupClasses(companyId: number, filters?: {
    status?: GroupItemStatus;
}): Promise<ServiceResult> {
    const where: Prisma.GroupClassWhereInput = {
        company_id: companyId,
        deleted_at: null,
    };
    if (filters?.status) {
        where.status = filters.status;
    }

    const classes = await prisma.groupClass.findMany({
        where,
        include: {
            staff_assignments: {
                include: { staff_profile: { select: { id: true, display_name: true, image_url: true } } },
            },
            _count: {
                select: {
                    sessions: { where: { start_at: { gte: new Date() }, cancelled_at: null } },
                    enrollments: { where: { status: { in: ['CONFIRMED', 'PENDING'] } } },
                },
            },
        },
        orderBy: { created_at: 'desc' },
    });

    return {
        code: 200,
        error: false,
        message: 'Classes retrieved',
        data: classes.map((groupClass) => ({
            ...groupClass,
            description: sanitizeRichText(groupClass.description) ?? null,
        })),
    };
}

export async function getGroupClassById(companyId: number, classId: number): Promise<ServiceResult> {
    const gc = await getClassWithRelations(classId, companyId);
    if (!gc) {
        return { code: 404, error: true, message: 'Class not found' };
    }
    return { code: 200, error: false, message: 'Class retrieved', data: gc };
}

// ─── Private ────────────────────────────────────────────────────────────────

async function getClassWithRelations(classId: number, companyId: number) {
    const groupClass = await prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
        include: {
            staff_assignments: {
                include: { staff_profile: { select: { id: true, display_name: true, image_url: true } } },
            },
            sessions: {
                where: { start_at: { gte: new Date() }, cancelled_at: null },
                orderBy: { start_at: 'asc' },
                take: 20,
            },
            _count: {
                select: {
                    sessions: true,
                    enrollments: { where: { status: { in: ['CONFIRMED', 'PENDING'] } } },
                },
            },
        },
    });

    if (!groupClass) return null;

    return {
        ...groupClass,
        description: sanitizeRichText(groupClass.description) ?? null,
    };
}
