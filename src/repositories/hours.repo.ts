import { prisma } from '../prisma/client';

/**
 * Get all hours for a company
 */
export async function getHoursByCompany(companyId: number) {
    return prisma.hours.findMany({
        where: {
            company_id: companyId,
        },
        orderBy: {
            day_of_week: 'asc',
        },
    });
}

/**
 * Upsert hours for a specific day
 */
export async function upsertHours(data: {
    companyId: number;
    dayOfWeek: number;
    openTime?: string;
    closeTime?: string;
    isClosed: boolean;
}) {
    return prisma.hours.upsert({
        where: {
            company_id_day_of_week: {
                company_id: data.companyId,
                day_of_week: data.dayOfWeek,
            },
        },
        update: {
            open_time: data.isClosed ? null : data.openTime,
            close_time: data.isClosed ? null : data.closeTime,
            is_closed: data.isClosed,
        },
        create: {
            company_id: data.companyId,
            day_of_week: data.dayOfWeek,
            open_time: data.isClosed ? null : data.openTime,
            close_time: data.isClosed ? null : data.closeTime,
            is_closed: data.isClosed,
        },
    });
}

/**
 * Batch upsert hours for multiple days
 */
export async function batchUpsertHours(
    companyId: number,
    hoursData: Array<{
        day_of_week: number;
        open_time?: string;
        close_time?: string;
        is_closed: boolean;
    }>
) {
    // Use transaction to ensure all updates succeed or fail together
    return prisma.$transaction(
        hoursData.map((data) =>
            prisma.hours.upsert({
                where: {
                    company_id_day_of_week: {
                        company_id: companyId,
                        day_of_week: data.day_of_week,
                    },
                },
                update: {
                    open_time: data.is_closed ? null : data.open_time,
                    close_time: data.is_closed ? null : data.close_time,
                    is_closed: data.is_closed,
                },
                create: {
                    company_id: companyId,
                    day_of_week: data.day_of_week,
                    open_time: data.is_closed ? null : data.open_time,
                    close_time: data.is_closed ? null : data.close_time,
                    is_closed: data.is_closed,
                },
            })
        )
    );
}

/**
 * Replace all hours for a company (delete existing, insert new)
 */
export async function replaceAllHours(
    companyId: number,
    hoursData: Array<{
        day_of_week: number;
        open_time?: string;
        close_time?: string;
        is_closed: boolean;
    }>
) {
    return prisma.$transaction(async (tx) => {
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
export async function createMissingDays(companyId: number) {
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
        await prisma.hours.createMany({
            data: missingDays,
        });
    }
    
    return missingDays.length;
}
