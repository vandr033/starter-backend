"use strict";
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
const client_2 = require("../prisma/client");
const sendEmail_1 = require("../utils/sendEmail");
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}
function normalizeDateOnly(value) {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
}
function normalizeTime(value) {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
        return trimmed.slice(0, 5);
    }
    return trimmed;
}
function isIntervalWithinWindows(startMinutes, endMinutes, windows) {
    return windows.some((window) => {
        const open = timeToMinutes(window.open_time);
        const close = timeToMinutes(window.close_time);
        return startMinutes >= open && endMinutes <= close;
    });
}
function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && aEnd > bStart;
}
async function getStaffById(companyId, staffId) {
    return client_2.prisma.staffProfile.findFirst({
        where: {
            id: staffId,
            company_id: companyId,
            deleted_at: null,
        },
        select: {
            id: true,
            user_id: true,
            display_name: true,
            start_date: true,
            end_date: true,
            is_bookable: true,
        },
    });
}
async function getStaffByUser(companyId, userId) {
    return client_2.prisma.staffProfile.findFirst({
        where: {
            company_id: companyId,
            user_id: userId,
            deleted_at: null,
        },
        select: {
            id: true,
            user_id: true,
            display_name: true,
            start_date: true,
            end_date: true,
            is_bookable: true,
        },
    });
}
function validateAvailabilitySlots(slots) {
    const groupedByDay = new Map();
    for (const slot of slots) {
        if (!Number.isInteger(slot.day_of_week) || slot.day_of_week < 0 || slot.day_of_week > 6) {
            return 'day_of_week must be an integer between 0 and 6';
        }
        if (!TIME_RE.test(slot.start_time) || !TIME_RE.test(slot.end_time)) {
            return 'start_time and end_time must use HH:MM format';
        }
        const start = timeToMinutes(slot.start_time);
        const end = timeToMinutes(slot.end_time);
        if (start >= end) {
            return 'Each availability slot must have start_time before end_time';
        }
        if (!groupedByDay.has(slot.day_of_week))
            groupedByDay.set(slot.day_of_week, []);
        groupedByDay.get(slot.day_of_week).push({ start, end });
    }
    for (const [, ranges] of groupedByDay) {
        ranges.sort((a, b) => a.start - b.start);
        for (let i = 1; i < ranges.length; i++) {
            if (overlaps(ranges[i - 1].start, ranges[i - 1].end, ranges[i].start, ranges[i].end)) {
                return 'Availability slots cannot overlap within the same day';
            }
        }
    }
    return null;
}
async function ensureSlotsWithinCompanyHours(companyId, slots) {
    const daySet = Array.from(new Set(slots.map((s) => s.day_of_week)));
    if (daySet.length === 0)
        return null;
    const companyHours = await client_2.prisma.hours.findMany({
        where: {
            company_id: companyId,
            day_of_week: { in: daySet },
        },
        orderBy: [{ day_of_week: 'asc' }, { open_time: 'asc' }],
    });
    const windowsByDay = new Map();
    for (const hour of companyHours) {
        if (hour.is_closed || !hour.open_time || !hour.close_time)
            continue;
        if (!windowsByDay.has(hour.day_of_week))
            windowsByDay.set(hour.day_of_week, []);
        windowsByDay.get(hour.day_of_week).push({
            open_time: hour.open_time,
            close_time: hour.close_time,
        });
    }
    for (const slot of slots) {
        const windows = windowsByDay.get(slot.day_of_week) || [];
        const start = timeToMinutes(slot.start_time);
        const end = timeToMinutes(slot.end_time);
        if (!isIntervalWithinWindows(start, end, windows)) {
            return `Slot ${slot.day_of_week} ${slot.start_time}-${slot.end_time} is outside company opening hours`;
        }
    }
    return null;
}
async function getAutoApproveSetting(companyId) {
    const settings = await client_2.prisma.companySettings.findUnique({
        where: { company_id: companyId },
        select: { auto_approve_staff_time_off: true },
    });
    return settings?.auto_approve_staff_time_off ?? false;
}
async function getStaffAvailability(companyId, staffId) {
    try {
        const staff = await getStaffById(companyId, staffId);
        if (!staff) {
            return { code: 404, error: true, message: 'Staff not found' };
        }
        const slots = await client_2.prisma.staffAvailability.findMany({
            where: {
                company_id: companyId,
                staff_id: staffId,
                is_active: true,
            },
            orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
        });
        return {
            code: 200,
            error: false,
            message: 'Staff availability retrieved successfully',
            data: {
                staff,
                slots,
            },
        };
    }
    catch (error) {
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve staff availability',
            technicalMessage: error.toString(),
        };
    }
}
async function getMyAvailability(companyId, userId) {
    const staff = await getStaffByUser(companyId, userId);
    if (!staff) {
        return { code: 404, error: true, message: 'Staff profile not found in this company' };
    }
    return getStaffAvailability(companyId, staff.id);
}
async function saveStaffAvailability(companyId, staffId, slots) {
    try {
        const staff = await getStaffById(companyId, staffId);
        if (!staff) {
            return { code: 404, error: true, message: 'Staff not found' };
        }
        const validation = validateAvailabilitySlots(slots);
        if (validation) {
            return { code: 400, error: true, message: validation };
        }
        const companyHoursValidation = await ensureSlotsWithinCompanyHours(companyId, slots);
        if (companyHoursValidation) {
            return { code: 400, error: true, message: companyHoursValidation };
        }
        await client_2.prisma.$transaction(async (tx) => {
            await tx.staffAvailability.deleteMany({
                where: { company_id: companyId, staff_id: staffId },
            });
            if (slots.length > 0) {
                await tx.staffAvailability.createMany({
                    data: slots.map((slot) => ({
                        company_id: companyId,
                        staff_id: staffId,
                        day_of_week: slot.day_of_week,
                        start_time: slot.start_time,
                        end_time: slot.end_time,
                        is_active: slot.is_active ?? true,
                    })),
                });
            }
        });
        return await getStaffAvailability(companyId, staffId);
    }
    catch (error) {
        return {
            code: 500,
            error: true,
            message: 'Failed to save staff availability',
            technicalMessage: error.toString(),
        };
    }
}
async function assignStaffAvailabilityFromCompanyHours(companyId, staffId, overwrite = false) {
    try {
        const staff = await getStaffById(companyId, staffId);
        if (!staff) {
            return { code: 404, error: true, message: 'Staff not found' };
        }
        const existingCount = await client_2.prisma.staffAvailability.count({
            where: { company_id: companyId, staff_id: staffId },
        });
        if (existingCount > 0 && !overwrite) {
            return {
                code: 409,
                error: true,
                message: 'Staff already has availability blocks. Confirm overwrite to continue.',
            };
        }
        const companyHours = await client_2.prisma.hours.findMany({
            where: {
                company_id: companyId,
                is_closed: false,
                open_time: { not: null },
                close_time: { not: null },
            },
            orderBy: [{ day_of_week: 'asc' }, { open_time: 'asc' }],
        });
        const slots = companyHours
            .map((hour) => ({
            day_of_week: hour.day_of_week,
            start_time: normalizeTime(hour.open_time),
            end_time: normalizeTime(hour.close_time),
            is_active: true,
        }))
            .filter((slot) => slot.start_time < slot.end_time);
        if (slots.length === 0) {
            return {
                code: 400,
                error: true,
                message: 'No open company hours found to copy',
            };
        }
        // Admin auto-assign is intentionally an overwrite, not a merge: the result should
        // exactly mirror current store hours and avoid accidental duplicate or expanded blocks.
        return await saveStaffAvailability(companyId, staffId, slots);
    }
    catch (error) {
        return {
            code: 500,
            error: true,
            message: 'Failed to assign availability from company hours',
            technicalMessage: error.toString(),
        };
    }
}
async function createTimeOffRequest(params) {
    const { companyId, actorUserId, actorRole, startsAt, endsAt, reason, staffId } = params;
    try {
        if (!(startsAt instanceof Date) || isNaN(startsAt.getTime())) {
            return { code: 400, error: true, message: 'Invalid starts_at' };
        }
        if (!(endsAt instanceof Date) || isNaN(endsAt.getTime())) {
            return { code: 400, error: true, message: 'Invalid ends_at' };
        }
        if (startsAt >= endsAt) {
            return { code: 400, error: true, message: 'starts_at must be before ends_at' };
        }
        let staff = null;
        if (actorRole === client_1.CompanyUserRole.STAFF) {
            staff = await getStaffByUser(companyId, actorUserId);
        }
        else {
            if (!staffId) {
                return { code: 400, error: true, message: 'staff_id is required' };
            }
            staff = await getStaffById(companyId, staffId);
        }
        if (!staff) {
            return { code: 404, error: true, message: 'Staff profile not found in this company' };
        }
        const requestDate = normalizeDateOnly(startsAt);
        if (staff.start_date && requestDate < normalizeDateOnly(new Date(staff.start_date))) {
            return { code: 400, error: true, message: 'Staff is not active yet for the selected date' };
        }
        if (staff.end_date && requestDate > normalizeDateOnly(new Date(staff.end_date))) {
            return { code: 400, error: true, message: 'Staff is not active for the selected date' };
        }
        const overlapping = await client_2.prisma.staffTimeOff.findFirst({
            where: {
                company_id: companyId,
                staff_id: staff.id,
                deleted_at: null,
                status: { in: [client_1.StaffTimeOffStatus.PENDING, client_1.StaffTimeOffStatus.APPROVED] },
                starts_at: { lt: endsAt },
                ends_at: { gt: startsAt },
            },
            select: { id: true },
        });
        if (overlapping) {
            return { code: 409, error: true, message: 'Overlapping time-off request already exists' };
        }
        const companyAutoApprove = await getAutoApproveSetting(companyId);
        // OWNER and ADMIN requests are always auto-approved
        const isPrivilegedRole = actorRole === client_1.CompanyUserRole.OWNER || actorRole === client_1.CompanyUserRole.ADMIN;
        const autoApprove = isPrivilegedRole || companyAutoApprove;
        const status = autoApprove ? client_1.StaffTimeOffStatus.APPROVED : client_1.StaffTimeOffStatus.PENDING;
        const created = await client_2.prisma.staffTimeOff.create({
            data: {
                company_id: companyId,
                staff_id: staff.id,
                requested_by_user_id: actorUserId,
                starts_at: startsAt,
                ends_at: endsAt,
                reason: reason || null,
                status,
                reviewed_by_user_id: autoApprove ? actorUserId : null,
                reviewed_at: autoApprove ? new Date() : null,
            },
            include: {
                staff: { select: { id: true, display_name: true } },
                requested_by: { select: { id: true, name: true, email: true } },
                reviewed_by: { select: { id: true, name: true, email: true } },
            },
        });
        if (!autoApprove && actorRole === client_1.CompanyUserRole.STAFF) {
            const owners = await client_2.prisma.companyUser.findMany({
                where: {
                    company_id: companyId,
                    role: client_1.CompanyUserRole.OWNER,
                    deleted_at: null,
                    user: {
                        deleted_at: null,
                    },
                },
                include: {
                    user: {
                        select: {
                            email: true,
                            name: true,
                        },
                    },
                    company: {
                        select: {
                            name: true,
                        },
                    },
                },
            });
            for (const owner of owners) {
                if (!owner.user.email)
                    continue;
                await (0, sendEmail_1.sendStaffTimeOffRequestEmail)({
                    companyId,
                    ownerEmail: owner.user.email,
                    ownerName: owner.user.name || 'Owner',
                    companyName: owner.company?.name || 'Your company',
                    staffName: staff.display_name,
                    startsAt,
                    endsAt,
                    reason: reason || null,
                    dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/dashboard/permissions`,
                });
            }
        }
        return {
            code: 201,
            error: false,
            message: autoApprove
                ? 'Time-off request created and auto-approved'
                : 'Time-off request created and pending review',
            data: created,
        };
    }
    catch (error) {
        return {
            code: 500,
            error: true,
            message: 'Failed to create time-off request',
            technicalMessage: error.toString(),
        };
    }
}
async function listTimeOffRequests(params) {
    const { companyId, actorUserId, actorRole, staffId, status } = params;
    try {
        let resolvedStaffId = undefined;
        if (actorRole === client_1.CompanyUserRole.STAFF) {
            const staff = await getStaffByUser(companyId, actorUserId);
            if (!staff) {
                return { code: 404, error: true, message: 'Staff profile not found in this company' };
            }
            resolvedStaffId = staff.id;
        }
        else {
            resolvedStaffId = staffId;
        }
        const rows = await client_2.prisma.staffTimeOff.findMany({
            where: {
                company_id: companyId,
                deleted_at: null,
                ...(resolvedStaffId ? { staff_id: resolvedStaffId } : {}),
                ...(status ? { status } : {}),
            },
            include: {
                staff: {
                    select: {
                        id: true,
                        display_name: true,
                    },
                },
                requested_by: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                reviewed_by: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });
        return {
            code: 200,
            error: false,
            message: 'Time-off requests retrieved successfully',
            data: rows,
        };
    }
    catch (error) {
        return {
            code: 500,
            error: true,
            message: 'Failed to list time-off requests',
            technicalMessage: error.toString(),
        };
    }
}
async function reviewTimeOffRequest(params) {
    const { companyId, requestId, reviewerUserId, status, reviewNote } = params;
    try {
        const request = await client_2.prisma.staffTimeOff.findFirst({
            where: {
                id: requestId,
                company_id: companyId,
                deleted_at: null,
            },
            select: {
                id: true,
                status: true,
            },
        });
        if (!request) {
            return { code: 404, error: true, message: 'Time-off request not found' };
        }
        if (request.status !== client_1.StaffTimeOffStatus.PENDING) {
            return {
                code: 400,
                error: true,
                message: 'Only pending requests can be reviewed',
            };
        }
        const updated = await client_2.prisma.staffTimeOff.update({
            where: { id: requestId },
            data: {
                status,
                review_note: reviewNote || null,
                reviewed_by_user_id: reviewerUserId,
                reviewed_at: new Date(),
            },
            include: {
                staff: { select: { id: true, display_name: true } },
                requested_by: { select: { id: true, name: true, email: true } },
                reviewed_by: { select: { id: true, name: true, email: true } },
            },
        });
        return {
            code: 200,
            error: false,
            message: `Request ${status.toLowerCase()} successfully`,
            data: updated,
        };
    }
    catch (error) {
        return {
            code: 500,
            error: true,
            message: 'Failed to review time-off request',
            technicalMessage: error.toString(),
        };
    }
}
async function cancelTimeOffRequest(params) {
    const { companyId, requestId, actorUserId, actorRole } = params;
    try {
        const request = await client_2.prisma.staffTimeOff.findFirst({
            where: {
                id: requestId,
                company_id: companyId,
                deleted_at: null,
            },
            include: {
                staff: {
                    select: {
                        id: true,
                        user_id: true,
                    },
                },
            },
        });
        if (!request) {
            return { code: 404, error: true, message: 'Time-off request not found' };
        }
        if (actorRole === client_1.CompanyUserRole.STAFF && request.staff.user_id !== actorUserId) {
            return { code: 403, error: true, message: 'You can only cancel your own requests' };
        }
        if (request.status !== client_1.StaffTimeOffStatus.PENDING && request.status !== client_1.StaffTimeOffStatus.APPROVED) {
            return {
                code: 400,
                error: true,
                message: 'Only pending or approved requests can be cancelled',
            };
        }
        if (actorRole === client_1.CompanyUserRole.STAFF && request.starts_at <= new Date()) {
            return {
                code: 400,
                error: true,
                message: 'Cannot cancel time-off requests that have already started',
            };
        }
        const updated = await client_2.prisma.staffTimeOff.update({
            where: { id: requestId },
            data: {
                status: client_1.StaffTimeOffStatus.CANCELLED,
                reviewed_by_user_id: actorUserId,
                reviewed_at: new Date(),
            },
            include: {
                staff: { select: { id: true, display_name: true } },
                requested_by: { select: { id: true, name: true, email: true } },
                reviewed_by: { select: { id: true, name: true, email: true } },
            },
        });
        return {
            code: 200,
            error: false,
            message: 'Request cancelled successfully',
            data: updated,
        };
    }
    catch (error) {
        return {
            code: 500,
            error: true,
            message: 'Failed to cancel time-off request',
            technicalMessage: error.toString(),
        };
    }
}
