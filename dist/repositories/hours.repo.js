"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHoursByCompany = getHoursByCompany;
exports.replaceAllHours = replaceAllHours;
exports.createMissingDays = createMissingDays;
const client_1 = require("../prisma/client");
/**
 * Get all hours for a company
 */
async function getHoursByCompany(companyId) {
    return client_1.prisma.hours.findMany({
        where: {
            company_id: companyId,
        },
        orderBy: {
            day_of_week: 'asc',
        },
    });
}
/**
 * Replace all hours for a company (delete existing, insert new)
 */
async function replaceAllHours(companyId, hoursData) {
    return client_1.prisma.$transaction(async (tx) => {
        // Delete all existing hours for this company
        await tx.hours.deleteMany({
            where: {
                company_id: companyId,
            },
        });
        // Insert new hours
        if (hoursData.length > 0) {
            await tx.hours.createMany({
                data: hoursData.map((data) => ({
                    company_id: companyId,
                    day_of_week: data.day_of_week,
                    open_time: data.is_closed ? null : data.open_time,
                    close_time: data.is_closed ? null : data.close_time,
                    is_closed: data.is_closed,
                })),
            });
        }
    });
}
/**
 * Create missing days with is_closed = true
 */
async function createMissingDays(companyId) {
    // Get existing days
    const existingHours = await getHoursByCompany(companyId);
    const existingDays = new Set(existingHours.map(h => h.day_of_week));
    // Create missing days (0-6 for Sunday-Saturday)
    const missingDays = [];
    for (let day = 0; day <= 6; day++) {
        if (!existingDays.has(day)) {
            missingDays.push({
                company_id: companyId,
                day_of_week: day,
                is_closed: true,
                open_time: null,
                close_time: null,
            });
        }
    }
    if (missingDays.length > 0) {
        await client_1.prisma.hours.createMany({
            data: missingDays,
        });
    }
    return missingDays.length;
}
