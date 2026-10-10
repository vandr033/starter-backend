"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDefaultStaffAvailabilityFromCompanyHours = ensureDefaultStaffAvailabilityFromCompanyHours;
const client_1 = require("../prisma/client");
function normalizeTime(value) {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
        return trimmed.slice(0, 5);
    }
    return trimmed;
}
async function ensureDefaultStaffAvailabilityFromCompanyHours(params) {
    const db = params.db ?? client_1.prisma;
    const existingCount = await db.staffAvailability.count({
        where: {
            company_id: params.companyId,
            staff_id: params.staffId,
        },
    });
    if (existingCount > 0) {
        return;
    }
    const companyHours = await db.hours.findMany({
        where: {
            company_id: params.companyId,
            is_closed: false,
            open_time: { not: null },
            close_time: { not: null },
        },
        orderBy: [{ day_of_week: 'asc' }, { open_time: 'asc' }],
    });
    const slots = companyHours
        .map((hour) => ({
        company_id: params.companyId,
        staff_id: params.staffId,
        day_of_week: hour.day_of_week,
        start_time: normalizeTime(hour.open_time),
        end_time: normalizeTime(hour.close_time),
        is_active: true,
    }))
        .filter((slot) => slot.start_time < slot.end_time);
    if (slots.length === 0) {
        return;
    }
    await db.staffAvailability.createMany({
        data: slots,
    });
}
