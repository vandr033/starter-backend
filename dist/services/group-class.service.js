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
exports.createGroupClass = createGroupClass;
exports.updateGroupClass = updateGroupClass;
exports.setGroupClassStatus = setGroupClassStatus;
exports.deleteGroupClass = deleteGroupClass;
exports.listGroupClasses = listGroupClasses;
exports.getGroupClassById = getGroupClassById;
const crypto_1 = require("crypto");
const client_1 = require("../prisma/client");
const logger_1 = require("../config/logger");
const plan_enforcement_service_1 = require("./plan-enforcement.service");
const recurrence_1 = require("../utils/recurrence");
const group_session_service_1 = require("./group-session.service");
const richText_1 = require("../utils/richText");
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
    const normalizedBase = (base || 'class').slice(0, 255);
    if (!suffix)
        return normalizedBase;
    const cleanSuffix = suffix.slice(0, 24);
    const maxBaseLength = Math.max(1, 255 - cleanSuffix.length - 1);
    return `${normalizedBase.slice(0, maxBaseLength)}-${cleanSuffix}`;
}
async function resolveUniqueClassSlug(companyId, source, excludeClassId) {
    const baseSlug = shortenSlug(slugify(source || 'class'));
    const whereBase = {
        company_id: companyId,
        slug: baseSlug,
        ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
    };
    const existingBase = await client_1.prisma.groupClass.findFirst({ where: whereBase });
    if (!existingBase)
        return baseSlug;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = shortenSlug(baseSlug, (0, crypto_1.randomUUID)().slice(0, 8));
        const conflict = await client_1.prisma.groupClass.findFirst({
            where: {
                company_id: companyId,
                slug: candidate,
                ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
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
function parseDateOnlyToUtc(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match)
        return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day) {
        return null;
    }
    return parsed;
}
function sanitizeSessionForClassPayload(session) {
    const { public_attendance_enabled: _publicAttendanceEnabled, attendance_public_token: _attendancePublicToken, attendance_public_token_created_at: _attendancePublicTokenCreatedAt, attendance_public_token_rotated_at: _attendancePublicTokenRotatedAt, attendance_access_code_enabled: _attendanceAccessCodeEnabled, attendance_access_code_hash: _attendanceAccessCodeHash, attendance_access_code_updated_at: _attendanceAccessCodeUpdatedAt, attendance_access_code_configured: _attendanceAccessCodeConfigured, ...rest } = session;
    return rest;
}
// ─── Service ────────────────────────────────────────────────────────────────
async function createGroupClass(companyId, userId, input) {
    const canUse = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'GROUP_CLASSES');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group classes require Pro plan' };
    }
    if (!(await CategoryRepo.getCategoryById(input.category_id, companyId))) {
        return { code: 400, error: true, message: 'Category not found for this company' };
    }
    // Validate recurrence config
    const configError = (0, recurrence_1.validateRecurrenceConfig)(input.recurrence_type, input.recurrence_config);
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
    const groupClass = await client_1.prisma.groupClass.create({
        data: {
            company_id: companyId,
            category_id: input.category_id,
            title: input.title,
            slug,
            description: (0, richText_1.sanitizeRichText)(input.description) ?? null,
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
            recurrence_config: input.recurrence_config,
            recurrence_start_date: recurrenceStartDate,
            recurrence_end_date: recurrenceEndDate,
            start_time: input.start_time,
            location_text: locationText,
            created_by_user_id: userId,
        },
    });
    // Create staff assignments
    if (input.staff_assignments?.length) {
        await client_1.prisma.groupStaffAssignment.createMany({
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
    const sessionCount = await (0, group_session_service_1.generateSessions)(companyId, groupClass.id);
    logger_1.logger.info(`Generated ${sessionCount} sessions for class ${groupClass.id}`);
    const full = await getClassWithRelations(groupClass.id, companyId);
    return { code: 201, error: false, message: 'Class created', data: full };
}
async function updateGroupClass(companyId, classId, input) {
    const canUse = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'GROUP_CLASSES');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group classes require Pro plan' };
    }
    const existing = await client_1.prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Class not found' };
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
        updateData.slug = await resolveUniqueClassSlug(companyId, slugSource, classId);
    }
    if (input.description !== undefined)
        updateData.description = (0, richText_1.sanitizeRichText)(input.description) ?? null;
    if (input.cover_image_url !== undefined)
        updateData.cover_image_url = input.cover_image_url;
    if (input.thumbnail_url !== undefined)
        updateData.thumbnail_url = input.thumbnail_url;
    if (input.pricing_mode !== undefined)
        updateData.pricing_mode = input.pricing_mode;
    if (input.price_cents !== undefined) {
        if (input.price_cents < 0) {
            return { code: 400, error: true, message: 'price_cents must be non-negative' };
        }
        updateData.price_cents = input.price_cents;
    }
    if (input.monthly_price_cents !== undefined)
        updateData.monthly_price_cents = input.monthly_price_cents;
    if (input.billing_day !== undefined)
        updateData.billing_day = input.billing_day;
    if (input.max_capacity_per_session !== undefined) {
        if (input.max_capacity_per_session < 1) {
            return { code: 400, error: true, message: 'max_capacity_per_session must be at least 1' };
        }
        updateData.max_capacity_per_session = input.max_capacity_per_session;
    }
    if (input.capacity_visible !== undefined)
        updateData.capacity_visible = input.capacity_visible;
    if (input.session_duration_minutes !== undefined) {
        if (input.session_duration_minutes < 5) {
            return { code: 400, error: true, message: 'session_duration_minutes must be at least 5' };
        }
        updateData.session_duration_minutes = input.session_duration_minutes;
    }
    if (input.location_text !== undefined)
        updateData.location_text = input.location_text;
    // If recurrence changed, validate and regenerate sessions
    let recurrenceChanged = false;
    if (input.start_time !== undefined && input.start_time !== existing.start_time) {
        updateData.start_time = input.start_time;
        recurrenceChanged = true;
    }
    else if (input.start_time !== undefined) {
        updateData.start_time = input.start_time;
    }
    if (input.recurrence_type !== undefined) {
        updateData.recurrence_type = input.recurrence_type;
        recurrenceChanged = true;
    }
    if (input.recurrence_config !== undefined) {
        const finalType = input.recurrence_type ?? existing.recurrence_type;
        const configError = (0, recurrence_1.validateRecurrenceConfig)(finalType, input.recurrence_config);
        if (configError) {
            return { code: 400, error: true, message: configError };
        }
        updateData.recurrence_config = input.recurrence_config;
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
        }
        else {
            updateData.recurrence_end_date = null;
        }
        recurrenceChanged = true;
    }
    const finalRecurrenceType = input.recurrence_type ?? existing.recurrence_type;
    const finalRecurrenceConfig = (input.recurrence_config ?? existing.recurrence_config);
    if (recurrenceChanged) {
        const configError = (0, recurrence_1.validateRecurrenceConfig)(finalRecurrenceType, finalRecurrenceConfig);
        if (configError) {
            return { code: 400, error: true, message: configError };
        }
        const finalStartDate = updateData.recurrence_start_date ?? existing.recurrence_start_date;
        const finalEndDate = Object.prototype.hasOwnProperty.call(updateData, 'recurrence_end_date')
            ? updateData.recurrence_end_date
            : existing.recurrence_end_date;
        if (finalEndDate && finalEndDate.getTime() < finalStartDate.getTime()) {
            return { code: 400, error: true, message: 'recurrence_end_date must be on or after recurrence_start_date' };
        }
    }
    await client_1.prisma.groupClass.update({
        where: { id: classId },
        data: updateData,
    });
    // Replace staff assignments if provided
    if (input.staff_assignments !== undefined) {
        await client_1.prisma.groupStaffAssignment.deleteMany({
            where: { group_class_id: classId },
        });
        if (input.staff_assignments.length > 0) {
            await client_1.prisma.groupStaffAssignment.createMany({
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
        const count = await (0, group_session_service_1.regenerateSessions)(companyId, classId);
        logger_1.logger.info(`Regenerated ${count} sessions for class ${classId}`);
    }
    const full = await getClassWithRelations(classId, companyId);
    return { code: 200, error: false, message: 'Class updated', data: full };
}
async function setGroupClassStatus(companyId, classId, status) {
    const canUse = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'GROUP_CLASSES');
    if (!canUse) {
        return { code: 403, error: true, message: 'Group classes require Pro plan' };
    }
    const existing = await client_1.prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Class not found' };
    }
    await client_1.prisma.groupClass.update({
        where: { id: classId },
        data: { status },
    });
    return { code: 200, error: false, message: `Class ${status.toLowerCase()}` };
}
async function deleteGroupClass(companyId, classId) {
    const existing = await client_1.prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'Class not found' };
    }
    await client_1.prisma.groupClass.update({
        where: { id: classId },
        data: { deleted_at: new Date() },
    });
    return { code: 200, error: false, message: 'Class deleted' };
}
async function listGroupClasses(companyId, filters) {
    const where = {
        company_id: companyId,
        deleted_at: null,
    };
    if (filters?.status) {
        where.status = filters.status;
    }
    const classes = await client_1.prisma.groupClass.findMany({
        where,
        include: {
            category: { select: { id: true, name: true, slug: true, position: true } },
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
            description: (0, richText_1.sanitizeRichText)(groupClass.description) ?? null,
        })),
    };
}
async function getGroupClassById(companyId, classId) {
    const gc = await getClassWithRelations(classId, companyId);
    if (!gc) {
        return { code: 404, error: true, message: 'Class not found' };
    }
    return { code: 200, error: false, message: 'Class retrieved', data: gc };
}
// ─── Private ────────────────────────────────────────────────────────────────
async function getClassWithRelations(classId, companyId) {
    const groupClass = await client_1.prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
        include: {
            category: { select: { id: true, name: true, slug: true, position: true } },
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
    if (!groupClass)
        return null;
    return {
        ...groupClass,
        sessions: (groupClass.sessions ?? []).map((session) => sanitizeSessionForClassPayload(session)),
        description: (0, richText_1.sanitizeRichText)(groupClass.description) ?? null,
    };
}
