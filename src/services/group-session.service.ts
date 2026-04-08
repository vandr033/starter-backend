import { prisma } from '../prisma/client';
import { MensajeApi } from '../types/MensajeApi';
import { generateSessionDates, combineDateAndTimeInTimezone, RecurrenceConfig } from '../utils/recurrence';

type ServiceResult = MensajeApi & { data?: any };

/**
 * Delete future sessions without attendance, then regenerate from current class config.
 * Used by the admin "Actualizar sesiones" button and Save when schedule changes.
 * Returns the number of newly created sessions.
 */
export async function regenerateSessions(companyId: number, classId: number): Promise<number> {
    // Delete from start of today so that sessions created earlier today at the
    // old time are also removed (not just future ones from this moment).
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    await prisma.groupClassSession.deleteMany({
        where: {
            group_class_id: classId,
            start_at: { gte: startOfToday },
            attendances: { none: {} },
        },
    });
    return generateSessions(companyId, classId);
}

/**
 * Generate sessions for a class based on its recurrence config.
 * Only creates sessions that don't already exist (idempotent).
 * Returns the number of newly created sessions.
 */
export async function generateSessions(companyId: number, classId: number): Promise<number> {
    const [gc, company] = await Promise.all([
        prisma.groupClass.findFirst({
            where: { id: classId, company_id: companyId, deleted_at: null },
        }),
        prisma.company.findUnique({
            where: { id: companyId },
            select: { timezone: true },
        }),
    ]);
    if (!gc) return 0;

    const timezone = company?.timezone || 'UTC';

    const dates = generateSessionDates(
        gc.recurrence_type,
        gc.recurrence_config as unknown as RecurrenceConfig,
        gc.recurrence_start_date,
        gc.recurrence_end_date,
    );

    if (dates.length === 0) return 0;

    // Get existing session start dates to avoid duplicates
    const existingSessions = await prisma.groupClassSession.findMany({
        where: { group_class_id: classId },
        select: { start_at: true },
    });
    const existingSet = new Set(
        existingSessions.map((s) => s.start_at.toISOString()),
    );

    const newSessions: Array<{
        company_id: number;
        group_class_id: number;
        start_at: Date;
        end_at: Date;
    }> = [];

    for (const date of dates) {
        const startAt = combineDateAndTimeInTimezone(date, gc.start_time, timezone);
        if (existingSet.has(startAt.toISOString())) continue;

        const endAt = new Date(startAt.getTime() + gc.session_duration_minutes * 60 * 1000);
        newSessions.push({
            company_id: companyId,
            group_class_id: classId,
            start_at: startAt,
            end_at: endAt,
        });
    }

    if (newSessions.length === 0) return 0;

    await prisma.groupClassSession.createMany({
        data: newSessions,
        skipDuplicates: true,
    });

    return newSessions.length;
}

/**
 * List sessions for a class.
 */
export async function listClassSessions(companyId: number, classId: number, filters?: {
    upcoming?: boolean;
    includeCancelled?: boolean;
}): Promise<ServiceResult> {
    const gc = await prisma.groupClass.findFirst({
        where: { id: classId, company_id: companyId, deleted_at: null },
    });
    if (!gc) {
        return { code: 404, error: true, message: 'Class not found' };
    }

    const where: any = {
        company_id: companyId,
        group_class_id: classId,
    };
    if (filters?.upcoming) {
        where.start_at = { gte: new Date() };
    }
    if (!filters?.includeCancelled) {
        where.cancelled_at = null;
    }

    const sessions = await prisma.groupClassSession.findMany({
        where,
        include: {
            _count: {
                select: {
                    attendances: true,
                },
            },
        },
        orderBy: { start_at: 'asc' },
    });

    const sessionStarts = sessions.map((session) => session.start_at.getTime());
    const minStart = sessionStarts.length > 0 ? new Date(Math.min(...sessionStarts)) : null;
    const maxStart = sessionStarts.length > 0 ? new Date(Math.max(...sessionStarts)) : null;

    const enrollments = (minStart && maxStart)
        ? await prisma.groupClassEnrollment.findMany({
            where: {
                company_id: companyId,
                group_class_id: classId,
                status: 'CONFIRMED',
                valid_from: { lte: maxStart },
                valid_until: { gte: minStart },
            },
            select: {
                valid_from: true,
                valid_until: true,
            },
        })
        : [];

    // Attach capacity info
    const enriched = sessions.map((s) => ({
        ...s,
        max_capacity: s.max_capacity_override ?? gc.max_capacity_per_session,
        booked_count: enrollments.filter(
            (enrollment) => enrollment.valid_from <= s.start_at && enrollment.valid_until >= s.start_at,
        ).length,
        attendance_count: s._count.attendances,
    }));

    return { code: 200, error: false, message: 'Sessions retrieved', data: enriched };
}

/**
 * Cancel a specific session.
 */
export async function cancelSession(companyId: number, sessionId: number, reason?: string): Promise<ServiceResult> {
    const session = await prisma.groupClassSession.findFirst({
        where: { id: sessionId, company_id: companyId },
    });
    if (!session) {
        return { code: 404, error: true, message: 'Session not found' };
    }
    if (session.cancelled_at) {
        return { code: 400, error: true, message: 'Session is already cancelled' };
    }

    await prisma.groupClassSession.update({
        where: { id: sessionId },
        data: {
            cancelled_at: new Date(),
            cancel_reason: reason ?? null,
            status: 'ARCHIVED',
        },
    });

    return { code: 200, error: false, message: 'Session cancelled' };
}

/**
 * Get a session with its attendance details.
 */
export async function getSessionDetail(companyId: number, sessionId: number): Promise<ServiceResult> {
    const session = await prisma.groupClassSession.findFirst({
        where: { id: sessionId, company_id: companyId },
        include: {
            group_class: {
                select: {
                    id: true,
                    title: true,
                    max_capacity_per_session: true,
                    pricing_mode: true,
                    price_cents: true,
                },
            },
            attendances: {
                include: {
                    customer_profile: { select: { id: true } },
                    user: { select: { id: true, name: true, email: true, phoneNumber: true } },
                },
            },
        },
    });
    if (!session) {
        return { code: 404, error: true, message: 'Session not found' };
    }

    return { code: 200, error: false, message: 'Session retrieved', data: session };
}
