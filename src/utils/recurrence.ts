import { RecurrenceType } from '@prisma/client';

/**
 * recurrence_config JSON shapes:
 *
 * WEEKLY:  { weekdays: [1, 3, 5] }           // 0=Sun .. 6=Sat
 * MONTHLY: { monthdays: [1, 15] }             // day-of-month numbers
 * CUSTOM:  { weekdays: [1, 3, 5] }            // same as weekly but label differs
 */

export interface WeeklyConfig {
    weekdays: number[]; // 0=Sun .. 6=Sat
}

export interface MonthlyConfig {
    monthdays: number[]; // 1..31
}

export type RecurrenceConfig = WeeklyConfig | MonthlyConfig;

/**
 * Maximum number of sessions to generate in one call.
 * Prevents runaway generation for unbounded recurrences.
 */
const MAX_SESSIONS = 365;

/**
 * Generate a list of session dates from a recurrence definition.
 *
 * @param type        WEEKLY | MONTHLY | CUSTOM
 * @param config      JSON config with weekdays or monthdays
 * @param startDate   First possible date (inclusive)
 * @param endDate     Last possible date (inclusive). If null, generates up to horizonDays from startDate.
 * @param horizonDays Fallback horizon when endDate is null. Default 90.
 * @returns           Array of Date objects (midnight UTC) for each session date.
 */
export function generateSessionDates(
    type: RecurrenceType,
    config: RecurrenceConfig,
    startDate: Date,
    endDate: Date | null,
    horizonDays: number = 90,
): Date[] {
    const dates: Date[] = [];

    const effectiveEnd = endDate ?? addDays(startDate, horizonDays);

    if (type === 'WEEKLY' || type === 'CUSTOM') {
        const weekdays = (config as WeeklyConfig).weekdays ?? [];
        if (weekdays.length === 0) return dates;

        const weekdaySet = new Set(weekdays);
        const cursor = new Date(startDate);
        cursor.setUTCHours(0, 0, 0, 0);

        while (cursor <= effectiveEnd && dates.length < MAX_SESSIONS) {
            if (weekdaySet.has(cursor.getUTCDay())) {
                dates.push(new Date(cursor));
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
    } else if (type === 'MONTHLY') {
        const monthdays = (config as MonthlyConfig).monthdays ?? [];
        if (monthdays.length === 0) return dates;

        const monthdaySet = new Set(monthdays);
        const cursor = new Date(startDate);
        cursor.setUTCHours(0, 0, 0, 0);

        while (cursor <= effectiveEnd && dates.length < MAX_SESSIONS) {
            if (monthdaySet.has(cursor.getUTCDate())) {
                dates.push(new Date(cursor));
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
    }

    return dates;
}

/**
 * Parse a time string "HH:MM" into { hours, minutes }.
 */
export function parseTime(time: string): { hours: number; minutes: number } {
    const [h, m] = time.split(':').map(Number);
    return { hours: h ?? 0, minutes: m ?? 0 };
}

/**
 * Build a UTC datetime from a date and a time string.
 * The date provides year/month/day and the time provides hours:minutes.
 * NOTE: treats the time as UTC. Use combineDateAndTimeInTimezone for local times.
 */
export function combineDateAndTime(date: Date, time: string): Date {
    const { hours, minutes } = parseTime(time);
    const result = new Date(date);
    result.setUTCHours(hours, minutes, 0, 0);
    return result;
}

/**
 * Build a UTC datetime by interpreting the given time string as local time
 * in the specified IANA timezone (e.g. "America/La_Paz").
 *
 * For example, time="14:52" with timezone="America/La_Paz" (UTC-4) returns
 * a Date representing 18:52 UTC so that it displays as 14:52 in Bolivia.
 */
export function combineDateAndTimeInTimezone(date: Date, time: string, timezone: string): Date {
    const { hours, minutes } = parseTime(time);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();

    // Guess: treat the desired local time as UTC
    const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

    // Find what local time this UTC instant corresponds to in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const part of formatter.formatToParts(guess)) {
        parts[part.type] = part.value;
    }
    const localHours = Number.parseInt(parts.hour ?? '0', 10) % 24; // "24:xx" → 0
    const localMinutes = Number.parseInt(parts.minute ?? '0', 10);

    // Adjust: if local time is off from desired, shift UTC accordingly
    const diffMinutes = (hours * 60 + minutes) - (localHours * 60 + localMinutes);
    return new Date(guess.getTime() + diffMinutes * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

/**
 * Validate recurrence config shape.
 * Returns null if valid, error string if invalid.
 */
export function validateRecurrenceConfig(type: RecurrenceType, config: unknown): string | null {
    if (typeof config !== 'object' || config === null) {
        return 'recurrence_config must be an object';
    }

    if (type === 'WEEKLY' || type === 'CUSTOM') {
        const c = config as Record<string, unknown>;
        if (!Array.isArray(c.weekdays)) {
            return 'recurrence_config.weekdays must be an array';
        }
        if (c.weekdays.length === 0) {
            return 'recurrence_config.weekdays must have at least one day';
        }
        for (const d of c.weekdays) {
            if (typeof d !== 'number' || d < 0 || d > 6 || !Number.isInteger(d)) {
                return 'recurrence_config.weekdays values must be integers 0-6';
            }
        }
    } else if (type === 'MONTHLY') {
        const c = config as Record<string, unknown>;
        if (!Array.isArray(c.monthdays)) {
            return 'recurrence_config.monthdays must be an array';
        }
        if (c.monthdays.length === 0) {
            return 'recurrence_config.monthdays must have at least one day';
        }
        for (const d of c.monthdays) {
            if (typeof d !== 'number' || d < 1 || d > 31 || !Number.isInteger(d)) {
                return 'recurrence_config.monthdays values must be integers 1-31';
            }
        }
    }

    return null;
}
