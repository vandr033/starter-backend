import { MensajeApi } from '../types/MensajeApi';
import * as AdminBookingRepo from '../repositories/admin-booking.repo';
import * as BookingRepo from '../repositories/booking.repo';
import { BookingSource, BookingStatus, PaymentStatus, PaymentMethod, CompanyUserRole, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../config/logger';
import {
    notifyBookingCreated,
    notifyBookingConfirmedForStaff,
    notifyBookingUpdated,
    notifyBookingCancelled,
    notifyBookingTodayReminder,
    notifyBookingNoShow,
} from '../utils/bookingNotifications';
import * as MarketplaceAnalyticsService from './marketplace-analytics.service';
import type { DirectNotificationChannel, ReminderChannel } from '../utils/bookingNotifications';
import { companyHasCapability } from './company-entitlements.service';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';
import { resolveEffectiveServicePrice } from './service-pricing.service';
import { sendReviewRequestReminder } from '../utils/reviewNotifications';
import { ensureCustomerProfileWithAccount, sendCustomerPortalInvite, type CustomerAccountInviteContext } from './customer-account.service';
import { parseDateTimeInTimeZone } from '../utils/timezone';
import { sendGenericEmail } from '../utils/sendEmail';
import { sendWhatsappText } from '../utils/whatsappSender';
import {
    hasLegacyNoShowMarker,
    isNoShowBooking,
    stripLegacyNoShowMarker,
} from '../utils/booking-status';

interface AdminBookingResult extends MensajeApi {
    data?: any;
}

const REMINDER_COOLDOWN_MS = 8 * 60 * 60 * 1000;
const DEFAULT_LANGUAGE_KEY = 'default_language';
const SHORT_NOTICE_RESCHEDULE_MS = 24 * 60 * 60 * 1000;
const RESCHEDULE_NOTIFICATION_MAX_ATTEMPTS = 3;
const RESCHEDULE_NOTIFICATION_RETRY_DELAY_MS = 5 * 60 * 1000;

const reminderSentAtCache = new Map<string, number>();
const reschedulableStatuses = new Set<BookingStatus>([
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
]);

type CustomerReminderChannel = ReminderChannel | 'NONE';
export type NoShowNotificationChannel = DirectNotificationChannel;

interface AdminCustomerInput {
    customer_id?: number;
    client_name?: string;
    client_phone_prefix?: string;
    client_phone_number?: string;
    client_email?: string;
}

interface AdminPaymentInput {
    is_paid?: boolean;
    payment_method?: PaymentMethod;
    qr_proof_image_url?: string | null;
}

interface AdminSessionSlotInput {
    start_at: string;
}

interface ResolvedAdminCustomer {
    customerId: number | null;
    clientName: string;
    clientEmail: string | null;
    clientPhonePrefix: string | null;
    clientPhoneNumber: string | null;
    inviteContext?: CustomerAccountInviteContext | null;
}

interface ResolvedAdminPayment {
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    qrProofImageUrl: string | null;
}

interface PreparedAdminBookingSession {
    startAt: Date;
    endAt: Date;
    totalPrice: number;
    services: Awaited<ReturnType<typeof BookingRepo.getServicesByIds>>;
    serviceSnapshots: Array<{
        service_id: number;
        service_name_snapshot: string;
        price_cents_snapshot: number;
        regular_price_cents_snapshot?: number | null;
        promo_applied_snapshot?: boolean;
        promo_label_snapshot?: string | null;
        duration_minutes_snapshot: number;
        position: number;
    }>;
    payment: ResolvedAdminPayment;
}

interface RescheduleSuggestion {
    date: string;
    time: string;
    start_at: string;
    end_at: string;
}

interface RescheduleNotificationDraft {
    recipient_type: 'STUDENT' | 'TEACHER';
    recipient_user_id?: string | null;
    channel: 'EMAIL' | 'WHATSAPP';
    target?: string | null;
    status: 'PENDING' | 'SKIPPED';
    reason?: string | null;
    payload: Prisma.InputJsonValue;
}

type RescheduleValidationResult =
    | { available: true }
    | {
        available: false;
        code: number;
        message: string;
        reason?: string;
        data?: Record<string, unknown>;
    };

function buildAdminServiceSnapshots(
    services: Array<{
        id: number;
        name: string;
        price_cents: number;
        promo_price_cents?: number | null;
        promo_starts_at?: Date | null;
        promo_ends_at?: Date | null;
        promo_label?: string | null;
        duration_minutes: number;
    }>,
    promotionsEnabled: boolean,
) {
    return services.map((service, index) => {
        const pricing = resolveEffectiveServicePrice({
            priceCents: service.price_cents,
            promoPriceCents: service.promo_price_cents ?? null,
            promoStartsAt: service.promo_starts_at ?? null,
            promoEndsAt: service.promo_ends_at ?? null,
            promoLabel: service.promo_label ?? null,
            promotionsEnabled,
        });

        return {
            service_id: service.id,
            service_name_snapshot: service.name,
            price_cents_snapshot: pricing.finalPriceCents,
            regular_price_cents_snapshot: pricing.regularPriceCents,
            promo_applied_snapshot: pricing.promoApplied,
            promo_label_snapshot: pricing.promoLabel,
            duration_minutes_snapshot: service.duration_minutes,
            position: index,
        };
    });
}

function splitAmountAcrossSessions(totalCents: number, parts: number): number[] {
    if (parts <= 1) return [totalCents];
    const base = Math.floor(totalCents / parts);
    const remainder = totalCents - base * parts;
    return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function cleanupReminderSentCache(now: number): void {
    for (const [key, sentAt] of reminderSentAtCache.entries()) {
        if (now - sentAt > REMINDER_COOLDOWN_MS * 2) {
            reminderSentAtCache.delete(key);
        }
    }
}

function getTimeZoneParts(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const value = (type: string): number =>
        Number(parts.find((p) => p.type === type)?.value || '0');

    return {
        year: value('year'),
        month: value('month'),
        day: value('day'),
        hour: value('hour'),
        minute: value('minute'),
        second: value('second'),
    };
}

async function getCompanyTimeZone(companyId: number): Promise<string> {
    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { timezone: true },
    });

    return company?.timezone || 'UTC';
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const parts = getTimeZoneParts(date, timeZone);
    const asUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    );
    return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    timeZone: string,
): Date {
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
    return new Date(utcGuess.getTime() - offset);
}

function getTodayRangeInTimeZone(timeZone: string): { startUtc: Date; endUtc: Date; dateKey: string } {
    const now = new Date();
    const today = getTimeZoneParts(now, timeZone);
    const startUtc = zonedDateTimeToUtc(today.year, today.month, today.day, 0, 0, 0, timeZone);
    const nextDayUtcDate = new Date(Date.UTC(today.year, today.month - 1, today.day) + 24 * 60 * 60 * 1000);
    const endUtc = zonedDateTimeToUtc(
        nextDayUtcDate.getUTCFullYear(),
        nextDayUtcDate.getUTCMonth() + 1,
        nextDayUtcDate.getUTCDate(),
        0,
        0,
        0,
        timeZone,
    );

    return {
        startUtc,
        endUtc,
        dateKey: `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`,
    };
}

function normalizeEmail(email?: string | null): string | null {
    const clean = (email || '').trim().toLowerCase();
    return clean || null;
}

function normalizePhone(phone?: string | null): string | null {
    const clean = (phone || '').replace(/\D/g, '');
    return clean || null;
}

function resolveChannel(contact: {
    customerPhone: string | null;
    customerEmail: string | null;
}): CustomerReminderChannel {
    if (contact.customerPhone) return 'WHATSAPP';
    if (contact.customerEmail) return 'EMAIL';
    return 'NONE';
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart < bEnd && aEnd > bStart;
}

function buildCustomerName(user?: {
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
} | null, fallback?: string | null): string {
    const first = user?.first_name?.trim();
    const last = user?.last_name?.trim();
    const full = [first, last].filter(Boolean).join(' ').trim();
    return full || user?.name?.trim() || fallback?.trim() || 'Customer';
}

function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function parseDateOnlyParts(date: string): { year: number; month: number; day: number } | null {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
    };
}

function addDaysToDateString(date: string, days: number): string {
    const parts = parseDateOnlyParts(date);
    if (!parts) return date;
    const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function getDateKeyAndMinutesInTimeZone(date: Date, timeZone: string): { dateKey: string; minutes: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const value = (type: string): string => parts.find((part) => part.type === type)?.value || '00';

    return {
        dateKey: `${value('year')}-${value('month')}-${value('day')}`,
        minutes: Number(value('hour')) * 60 + Number(value('minute')),
    };
}

function getDayOfWeekFromDateKey(dateKey: string): number | null {
    const parts = parseDateOnlyParts(dateKey);
    if (!parts) return null;
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)).getUTCDay();
}

function isIntervalWithinWindows(
    startMinutes: number,
    endMinutes: number,
    windows: Array<{ start_time: string; end_time: string }>
): boolean {
    return windows.some((window) => {
        const windowStart = timeToMinutes(window.start_time);
        const windowEnd = timeToMinutes(window.end_time);
        return startMinutes >= windowStart && endMinutes <= windowEnd;
    });
}

function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return null;
    const cleanPrefix = normalizePhone(prefix) || '591';
    return `${cleanPrefix}${cleanPhone}`;
}

function getFrontendBaseUrl(): string {
    return (
        process.env.FRONTEND_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        'http://localhost:3000'
    ).replace(/\/$/, '');
}

function getAdminBookingUrl(bookingId: number): string {
    return `${getFrontendBaseUrl()}/admin/dashboard/bookings?bookingId=${bookingId}`;
}

function getPublicCompanyUrl(slug?: string | null): string | null {
    const normalizedSlug = (slug || '').trim();
    return normalizedSlug ? `${getFrontendBaseUrl()}/shop/${encodeURIComponent(normalizedSlug)}` : null;
}

function formatRescheduleDateTimeRange(startAt: Date, endAt: Date, timeZone: string): string {
    const date = startAt.toLocaleDateString('es-BO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone,
    });
    const start = startAt.toLocaleTimeString('es-BO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone,
    });
    const end = endAt.toLocaleTimeString('es-BO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone,
    });
    return `${date}, ${start} - ${end}`;
}

function getBookingDurationMinutes(booking: any): number {
    const diffMinutes = Math.round((booking.end_at.getTime() - booking.start_at.getTime()) / 60_000);
    if (diffMinutes > 0) return diffMinutes;

    const serviceDuration = (booking.booking_services || []).reduce((sum: number, bs: any) => {
        const snapshotDuration = Number(bs.duration_minutes_snapshot);
        const serviceDuration = Number(bs.service?.duration_minutes);
        return sum + (Number.isFinite(snapshotDuration) && snapshotDuration > 0
            ? snapshotDuration
            : Number.isFinite(serviceDuration) && serviceDuration > 0
                ? serviceDuration
                : 0);
    }, 0);

    return serviceDuration > 0 ? serviceDuration : 30;
}

function getBookingServiceIds(booking: any): number[] {
    return Array.from(new Set(
        (booking.booking_services || [])
            .map((bs: any) => Number(bs.service_id ?? bs.service?.id))
            .filter((id: number) => Number.isInteger(id) && id > 0),
    ));
}

async function getRequiredSecondaryResourceIds(companyId: number, booking: any): Promise<number[]> {
    const serviceIds = getBookingServiceIds(booking);
    const resourceIds = new Set<number>();

    if (booking.secondary_staff_id) {
        resourceIds.add(booking.secondary_staff_id);
    }

    if (serviceIds.length === 0) {
        return Array.from(resourceIds);
    }

    const requiredResources = await prisma.serviceRequiredResource.findMany({
        where: {
            company_id: companyId,
            service_id: { in: serviceIds },
            staff_profile: {
                deleted_at: null,
                resource_type: { in: ['ROOM', 'EQUIPMENT'] },
            },
        },
        select: {
            staff_profile_id: true,
        },
    });

    for (const resource of requiredResources) {
        resourceIds.add(resource.staff_profile_id);
    }

    return Array.from(resourceIds);
}

async function isResourceAvailableForInterval(params: {
    companyId: number;
    resourceId: number;
    startAt: Date;
    endAt: Date;
    timezone: string;
    label: 'staff' | 'resource';
}): Promise<{ available: boolean; message?: string; reason?: string }> {
    const { companyId, resourceId, startAt, endAt, timezone, label } = params;
    const resourceList = await BookingRepo.getBookableStaff(companyId, resourceId);
    if (resourceList.length === 0) {
        return {
            available: false,
            reason: 'RESOURCE_NOT_BOOKABLE',
            message: label === 'staff'
                ? 'No encontramos el profesor o ya no acepta reservas.'
                : 'La sala o recurso requerido ya no acepta reservas.',
        };
    }

    const resource = resourceList[0];
    const startInfo = getDateKeyAndMinutesInTimeZone(startAt, timezone);
    const endInfo = getDateKeyAndMinutesInTimeZone(endAt, timezone);

    if (
        resource.start_date &&
        startInfo.dateKey < getDateKeyAndMinutesInTimeZone(new Date(resource.start_date), timezone).dateKey
    ) {
        return {
            available: false,
            reason: 'RESOURCE_NOT_ACTIVE_YET',
            message: label === 'staff'
                ? 'El profesor todavía no está activo para esa fecha.'
                : 'La sala o recurso todavía no está activo para esa fecha.',
        };
    }

    if (
        resource.end_date &&
        startInfo.dateKey > getDateKeyAndMinutesInTimeZone(new Date(resource.end_date), timezone).dateKey
    ) {
        return {
            available: false,
            reason: 'RESOURCE_ENDED',
            message: label === 'staff'
                ? 'El profesor no está disponible para esa fecha.'
                : 'La sala o recurso no está disponible para esa fecha.',
        };
    }

    const dayOfWeek = getDayOfWeekFromDateKey(startInfo.dateKey) ?? startAt.getUTCDay();
    const companyHours = await BookingRepo.getCompanyHourWindowsForDay(companyId, dayOfWeek);
    const companyWindows = companyHours
        .filter((window) => !window.is_closed && window.open_time && window.close_time)
        .map((window) => ({ start_time: window.open_time as string, end_time: window.close_time as string }));

    if (companyWindows.length === 0) {
        return {
            available: false,
            reason: 'COMPANY_CLOSED',
            message: 'El negocio está cerrado ese día.',
        };
    }

    const startMinutes = startInfo.minutes;
    const endMinutes = endInfo.dateKey === startInfo.dateKey ? endInfo.minutes : 24 * 60;
    if (!isIntervalWithinWindows(startMinutes, endMinutes, companyWindows)) {
        return {
            available: false,
            reason: 'OUTSIDE_COMPANY_HOURS',
            message: 'El horario elegido está fuera del horario de atención del negocio.',
        };
    }

    const [availabilityCounts, dayAvailability, timeOff, groupCommitments] = await Promise.all([
        BookingRepo.getStaffAvailabilityCounts(companyId, [resourceId]),
        BookingRepo.getStaffAvailabilityForDay(companyId, [resourceId], dayOfWeek),
        BookingRepo.getApprovedStaffTimeOffOverlaps(companyId, [resourceId], startAt, endAt),
        BookingRepo.getGroupStaffCommitmentsForDateRange(companyId, [resourceId], startAt, endAt),
    ]);

    const hasCustomSchedule = (availabilityCounts[0]?._count?.id || 0) > 0;
    if (hasCustomSchedule) {
        const resourceWindows = dayAvailability.map((slot) => ({
            start_time: slot.start_time,
            end_time: slot.end_time,
        }));
        if (!isIntervalWithinWindows(startMinutes, endMinutes, resourceWindows)) {
            return {
                available: false,
                reason: 'OUTSIDE_RESOURCE_HOURS',
                message: label === 'staff'
                    ? 'El profesor no trabaja en ese día u horario.'
                    : 'La sala o recurso no está disponible en ese día u horario.',
            };
        }
    }

    if (timeOff.length > 0) {
        return {
            available: false,
            reason: 'RESOURCE_TIME_OFF',
            message: label === 'staff'
                ? 'El profesor tiene una ausencia en ese horario.'
                : 'La sala o recurso está bloqueado en ese horario.',
        };
    }

    if (groupCommitments.length > 0) {
        return {
            available: false,
            reason: 'GROUP_COMMITMENT',
            message: label === 'staff'
                ? 'El profesor ya está asignado a un evento o clase grupal en ese horario.'
                : 'La sala o recurso ya está asignado a un evento o clase grupal en ese horario.',
        };
    }

    return { available: true };
}

async function validateRescheduleSlot(params: {
    companyId: number;
    bookingId: number;
    staffId: number;
    secondaryResourceIds: number[];
    startAt: Date;
    endAt: Date;
    timezone: string;
}): Promise<RescheduleValidationResult> {
    const primaryAvailability = await isResourceAvailableForInterval({
        companyId: params.companyId,
        resourceId: params.staffId,
        startAt: params.startAt,
        endAt: params.endAt,
        timezone: params.timezone,
        label: 'staff',
    });

    if (!primaryAvailability.available) {
        return {
            available: false,
            code: 400,
            message: primaryAvailability.message || 'El profesor no está disponible en ese horario.',
            reason: primaryAvailability.reason,
        };
    }

    for (const resourceId of params.secondaryResourceIds) {
        const resourceAvailability = await isResourceAvailableForInterval({
            companyId: params.companyId,
            resourceId,
            startAt: params.startAt,
            endAt: params.endAt,
            timezone: params.timezone,
            label: 'resource',
        });

        if (!resourceAvailability.available) {
            return {
                available: false,
                code: 400,
                message: resourceAvailability.message || 'La sala o recurso no está disponible en ese horario.',
                reason: resourceAvailability.reason,
            };
        }
    }

    const settings = await BookingRepo.getCompanySettings(params.companyId);
    const bufferMinutes = settings?.booking_buffer_minutes ?? 10;
    const blockingResourceIds = Array.from(new Set([params.staffId, ...params.secondaryResourceIds]));

    for (const resourceId of blockingResourceIds) {
        const conflict = await BookingRepo.checkSlotConflictExcludingBooking(
            params.companyId,
            resourceId,
            params.startAt,
            params.endAt,
            params.bookingId,
            bufferMinutes,
        );

        if (conflict) {
            return {
                available: false,
                code: 409,
                message: resourceId === params.staffId
                    ? 'El profesor ya tiene otra reserva en ese horario.'
                    : 'La sala o recurso requerido ya está reservado en ese horario.',
                reason: 'BOOKING_CONFLICT',
                data: {
                    conflicting_booking_id: conflict.id,
                    conflicting_start: conflict.start_at,
                    conflicting_end: conflict.end_at,
                },
            };
        }
    }

    const groupConflict = await BookingRepo.checkGroupSlotConflict(
        params.companyId,
        params.staffId,
        params.startAt,
        params.endAt,
        bufferMinutes,
    );

    if (groupConflict) {
        return {
            available: false,
            code: 409,
            message: 'El profesor está bloqueado por una clase o evento grupal en ese horario.',
            reason: 'GROUP_CONFLICT',
            data: {
                conflict_type: groupConflict.type,
                conflict_id: groupConflict.id,
                conflict_title: groupConflict.title,
                conflicting_start: groupConflict.start_at,
                conflicting_end: groupConflict.end_at,
            },
        };
    }

    return { available: true };
}

async function buildRescheduleSuggestions(params: {
    companyId: number;
    bookingId: number;
    staffId: number;
    secondaryResourceIds: number[];
    durationMinutes: number;
    preferredStartAt: Date;
    timezone: string;
    limit?: number;
}): Promise<RescheduleSuggestion[]> {
    const limit = params.limit ?? 6;
    const settings = await BookingRepo.getCompanySettings(params.companyId);
    const granularityMinutes = settings?.booking_time_granularity_minutes ?? 15;
    const preferredInfo = getDateKeyAndMinutesInTimeZone(params.preferredStartAt, params.timezone);
    const now = new Date();
    const nowInfo = getDateKeyAndMinutesInTimeZone(now, params.timezone);
    const suggestions: RescheduleSuggestion[] = [];
    let checkedCandidates = 0;
    const maxCandidates = 250;

    for (let offset = 0; offset < 14 && suggestions.length < limit && checkedCandidates < maxCandidates; offset += 1) {
        const dateKey = addDaysToDateString(preferredInfo.dateKey, offset);
        const dayOfWeek = getDayOfWeekFromDateKey(dateKey);
        if (dayOfWeek === null) continue;

        const companyHours = await BookingRepo.getCompanyHourWindowsForDay(params.companyId, dayOfWeek);
        const windows = companyHours
            .filter((window) => !window.is_closed && window.open_time && window.close_time)
            .map((window) => ({ start_time: window.open_time as string, end_time: window.close_time as string }));

        const candidateMinutes: number[] = [];
        for (const window of windows) {
            const openMinutes = timeToMinutes(window.start_time);
            const closeMinutes = timeToMinutes(window.end_time);
            for (
                let slotMinutes = openMinutes;
                slotMinutes + params.durationMinutes <= closeMinutes;
                slotMinutes += granularityMinutes
            ) {
                if (dateKey === nowInfo.dateKey && slotMinutes <= nowInfo.minutes) continue;
                candidateMinutes.push(slotMinutes);
            }
        }

        candidateMinutes.sort((a, b) => Math.abs(a - preferredInfo.minutes) - Math.abs(b - preferredInfo.minutes));

        for (const slotMinutes of candidateMinutes) {
            if (suggestions.length >= limit || checkedCandidates >= maxCandidates) break;
            checkedCandidates += 1;
            const time = minutesToTime(slotMinutes);
            const startAt = parseDateTimeInTimeZone(`${dateKey}T${time}:00`, params.timezone);
            const endAt = new Date(startAt.getTime() + params.durationMinutes * 60_000);

            const validation = await validateRescheduleSlot({
                companyId: params.companyId,
                bookingId: params.bookingId,
                staffId: params.staffId,
                secondaryResourceIds: params.secondaryResourceIds,
                startAt,
                endAt,
                timezone: params.timezone,
            });

            if (!validation.available) continue;

            suggestions.push({
                date: dateKey,
                time,
                start_at: startAt.toISOString(),
                end_at: endAt.toISOString(),
            });
        }
    }

    return suggestions;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildRescheduleEmailHtml(params: {
    recipientName: string;
    recipientRole: 'STUDENT' | 'TEACHER';
    companyName: string;
    teacherName: string;
    studentName: string;
    serviceNames: string[];
    oldTimeLabel: string;
    newTimeLabel: string;
    supportUrl: string | null;
    companyEmail: string | null;
    companyPhone: string | null;
    manageUrl: string;
}) {
    const services = params.serviceNames.map((service) => `<li>${escapeHtml(service)}</li>`).join('');
    const roleMessage = params.recipientRole === 'TEACHER'
        ? 'Una reserva asignada a tu agenda fue reagendada.'
        : 'Tu reserva fue reagendada por el negocio.';
    const supportLines = [
        params.companyPhone ? `<p><strong>Teléfono:</strong> ${escapeHtml(params.companyPhone)}</p>` : '',
        params.companyEmail ? `<p><strong>Email:</strong> ${escapeHtml(params.companyEmail)}</p>` : '',
        params.supportUrl ? `<p><a href="${escapeHtml(params.supportUrl)}">Ver página del negocio</a></p>` : '',
    ].filter(Boolean).join('');

    return `
        <h2 style="margin-top:0;">Reserva reagendada</h2>
        <p>Hola ${escapeHtml(params.recipientName)}, ${roleMessage}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:16px 0;">
            <p><strong>Negocio:</strong> ${escapeHtml(params.companyName)}</p>
            <p><strong>Cliente:</strong> ${escapeHtml(params.studentName)}</p>
            <p><strong>Profesor:</strong> ${escapeHtml(params.teacherName)}</p>
            <p><strong>Antes:</strong> ${escapeHtml(params.oldTimeLabel)}</p>
            <p><strong>Ahora:</strong> ${escapeHtml(params.newTimeLabel)}</p>
            <p><strong>Servicios:</strong></p>
            <ul>${services}</ul>
        </div>
        ${supportLines ? `<div>${supportLines}</div>` : ''}
        <p><a href="${escapeHtml(params.manageUrl)}">Ver reserva</a></p>
    `;
}

function buildRescheduleWhatsappText(params: {
    recipientName: string;
    recipientRole: 'STUDENT' | 'TEACHER';
    companyName: string;
    teacherName: string;
    studentName: string;
    serviceNames: string[];
    oldTimeLabel: string;
    newTimeLabel: string;
    supportUrl: string | null;
    companyEmail: string | null;
    companyPhone: string | null;
    manageUrl: string;
}) {
    const roleMessage = params.recipientRole === 'TEACHER'
        ? 'Una reserva asignada a tu agenda fue reagendada.'
        : 'Tu reserva fue reagendada por el negocio.';
    const supportLines = [
        params.companyPhone ? `Teléfono: ${params.companyPhone}` : null,
        params.companyEmail ? `Email: ${params.companyEmail}` : null,
        params.supportUrl ? `Página: ${params.supportUrl}` : null,
    ].filter((line): line is string => Boolean(line));

    return [
        `Hola ${params.recipientName}, ${roleMessage}`,
        ``,
        `Negocio: ${params.companyName}`,
        `Cliente: ${params.studentName}`,
        `Profesor: ${params.teacherName}`,
        `Antes: ${params.oldTimeLabel}`,
        `Ahora: ${params.newTimeLabel}`,
        `Servicios: ${params.serviceNames.join(', ')}`,
        ...supportLines,
        `Ver reserva: ${params.manageUrl}`,
    ].join('\n');
}

function makeRescheduleAttemptDraft(params: {
    recipientType: 'STUDENT' | 'TEACHER';
    recipientUserId?: string | null;
    channel: 'EMAIL' | 'WHATSAPP';
    target?: string | null;
    enabled: boolean;
    verified: boolean;
    skipReasonWhenMissing: string;
    payload: Prisma.InputJsonValue;
}): RescheduleNotificationDraft {
    if (!params.enabled) {
        return {
            recipient_type: params.recipientType,
            recipient_user_id: params.recipientUserId,
            channel: params.channel,
            target: params.target,
            status: 'SKIPPED',
            reason: 'CHANNEL_DISABLED',
            payload: params.payload,
        };
    }

    if (!params.target || !params.verified) {
        return {
            recipient_type: params.recipientType,
            recipient_user_id: params.recipientUserId,
            channel: params.channel,
            target: params.target,
            status: 'SKIPPED',
            reason: params.skipReasonWhenMissing,
            payload: params.payload,
        };
    }

    return {
        recipient_type: params.recipientType,
        recipient_user_id: params.recipientUserId,
        channel: params.channel,
        target: params.target,
        status: 'PENDING',
        reason: null,
        payload: params.payload,
    };
}

async function buildRescheduleNotificationDrafts(params: {
    companyId: number;
    booking: any;
    oldStartAt: Date;
    oldEndAt: Date;
    newStartAt: Date;
    newEndAt: Date;
    timeZone: string;
}): Promise<{
    attempts: RescheduleNotificationDraft[];
    metadata: Prisma.InputJsonValue;
}> {
    const [company, settings, canSendTransactionalNotifications, staffProfile] = await Promise.all([
        prisma.company.findUnique({
            where: { id: params.companyId },
            select: {
                name: true,
                slug: true,
                email: true,
                phone_prefix: true,
                phone: true,
            },
        }),
        prisma.companySettings.findUnique({
            where: { company_id: params.companyId },
            select: {
                send_email_notifications: true,
                send_whatsapp_notifications: true,
            },
        }),
        isFeatureEnabledForCompany(params.companyId, 'TRANSACTIONAL_BOOKING_NOTIFICATIONS'),
        prisma.staffProfile.findFirst({
            where: {
                id: params.booking.staff_id,
                company_id: params.companyId,
                deleted_at: null,
            },
            select: {
                display_name: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        emailVerified: true,
                        phoneNumber: true,
                        phone_prefix: true,
                        phoneNumberVerified: true,
                        first_name: true,
                        name: true,
                    },
                },
            },
        }),
    ]);

    const channelEmailEnabled =
        canSendTransactionalNotifications && (settings?.send_email_notifications ?? true);
    const channelWhatsappEnabled =
        canSendTransactionalNotifications && (settings?.send_whatsapp_notifications ?? false);
    const companyName = company?.name || '';
    const supportUrl = getPublicCompanyUrl(company?.slug);
    const companyPhone = buildFullPhone(company?.phone_prefix, company?.phone);
    const oldTimeLabel = formatRescheduleDateTimeRange(params.oldStartAt, params.oldEndAt, params.timeZone);
    const newTimeLabel = formatRescheduleDateTimeRange(params.newStartAt, params.newEndAt, params.timeZone);
    const serviceNames = (params.booking.booking_services || [])
        .map((bs: any) => bs.service_name_snapshot || bs.service?.name || '')
        .filter((name: string) => name.trim().length > 0);
    const studentUser = params.booking.customer?.user;
    const studentName =
        studentUser?.first_name && studentUser?.last_name
            ? `${studentUser.first_name} ${studentUser.last_name}`
            : studentUser?.name || params.booking.client_name || 'Cliente';
    const teacherName = staffProfile?.display_name || staffProfile?.user?.name || 'Profesor';
    const manageUrl = getAdminBookingUrl(params.booking.id);

    const baseTemplate = {
        companyName,
        teacherName,
        studentName,
        serviceNames,
        oldTimeLabel,
        newTimeLabel,
        supportUrl,
        companyEmail: normalizeEmail(company?.email),
        companyPhone,
        manageUrl,
    };

    const studentEmail = normalizeEmail(studentUser?.email);
    const studentPhone = buildFullPhone(studentUser?.phone_prefix, studentUser?.phoneNumber);
    const teacherEmail = normalizeEmail(staffProfile?.user?.email);
    const teacherPhone = buildFullPhone(staffProfile?.user?.phone_prefix, staffProfile?.user?.phoneNumber);

    const studentEmailPayload = {
        subject: `Reserva reagendada - ${companyName}`,
        html: buildRescheduleEmailHtml({
            ...baseTemplate,
            recipientName: studentName,
            recipientRole: 'STUDENT',
        }),
    } as Prisma.InputJsonValue;
    const studentWhatsappPayload = {
        text: buildRescheduleWhatsappText({
            ...baseTemplate,
            recipientName: studentName,
            recipientRole: 'STUDENT',
        }),
    } as Prisma.InputJsonValue;
    const teacherEmailPayload = {
        subject: `Reserva reagendada - ${companyName}`,
        html: buildRescheduleEmailHtml({
            ...baseTemplate,
            recipientName: staffProfile?.user?.first_name || teacherName,
            recipientRole: 'TEACHER',
        }),
    } as Prisma.InputJsonValue;
    const teacherWhatsappPayload = {
        text: buildRescheduleWhatsappText({
            ...baseTemplate,
            recipientName: staffProfile?.user?.first_name || teacherName,
            recipientRole: 'TEACHER',
        }),
    } as Prisma.InputJsonValue;

    const attempts = canSendTransactionalNotifications
        ? [
            makeRescheduleAttemptDraft({
                recipientType: 'STUDENT',
                recipientUserId: studentUser?.id,
                channel: 'EMAIL',
                target: studentEmail,
                enabled: channelEmailEnabled,
                verified: Boolean(studentEmail && studentUser?.emailVerified),
                skipReasonWhenMissing: studentUser ? 'NO_VERIFIED_EMAIL' : 'NO_LINKED_STUDENT',
                payload: studentEmailPayload,
            }),
            makeRescheduleAttemptDraft({
                recipientType: 'STUDENT',
                recipientUserId: studentUser?.id,
                channel: 'WHATSAPP',
                target: studentPhone,
                enabled: channelWhatsappEnabled,
                verified: Boolean(studentPhone && studentUser?.phoneNumberVerified),
                skipReasonWhenMissing: studentUser ? 'NO_VERIFIED_PHONE' : 'NO_LINKED_STUDENT',
                payload: studentWhatsappPayload,
            }),
            makeRescheduleAttemptDraft({
                recipientType: 'TEACHER',
                recipientUserId: staffProfile?.user?.id,
                channel: 'EMAIL',
                target: teacherEmail,
                enabled: channelEmailEnabled,
                verified: Boolean(teacherEmail && staffProfile?.user?.emailVerified),
                skipReasonWhenMissing: staffProfile?.user ? 'NO_VERIFIED_EMAIL' : 'NO_TEACHER_USER',
                payload: teacherEmailPayload,
            }),
            makeRescheduleAttemptDraft({
                recipientType: 'TEACHER',
                recipientUserId: staffProfile?.user?.id,
                channel: 'WHATSAPP',
                target: teacherPhone,
                enabled: channelWhatsappEnabled,
                verified: Boolean(teacherPhone && staffProfile?.user?.phoneNumberVerified),
                skipReasonWhenMissing: staffProfile?.user ? 'NO_VERIFIED_PHONE' : 'NO_TEACHER_USER',
                payload: teacherWhatsappPayload,
            }),
        ]
        : [
            {
                recipient_type: 'STUDENT',
                recipient_user_id: studentUser?.id,
                channel: 'EMAIL',
                target: studentEmail,
                status: 'SKIPPED',
                reason: 'FEATURE_DISABLED',
                payload: studentEmailPayload,
            },
            {
                recipient_type: 'STUDENT',
                recipient_user_id: studentUser?.id,
                channel: 'WHATSAPP',
                target: studentPhone,
                status: 'SKIPPED',
                reason: 'FEATURE_DISABLED',
                payload: studentWhatsappPayload,
            },
            {
                recipient_type: 'TEACHER',
                recipient_user_id: staffProfile?.user?.id,
                channel: 'EMAIL',
                target: teacherEmail,
                status: 'SKIPPED',
                reason: 'FEATURE_DISABLED',
                payload: teacherEmailPayload,
            },
            {
                recipient_type: 'TEACHER',
                recipient_user_id: staffProfile?.user?.id,
                channel: 'WHATSAPP',
                target: teacherPhone,
                status: 'SKIPPED',
                reason: 'FEATURE_DISABLED',
                payload: teacherWhatsappPayload,
            },
        ] as RescheduleNotificationDraft[];

    return {
        attempts,
        metadata: {
            notification_plan_enabled: canSendTransactionalNotifications,
            send_email_notifications: settings?.send_email_notifications ?? true,
            send_whatsapp_notifications: settings?.send_whatsapp_notifications ?? false,
            company_timezone: params.timeZone,
        } as Prisma.InputJsonValue,
    };
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function scheduleRescheduleNotificationRetry(attemptId: number, delayMs: number) {
    const timer = setTimeout(() => {
        void dispatchRescheduleNotificationAttempt(attemptId);
    }, delayMs);
    if (typeof (timer as any).unref === 'function') {
        (timer as any).unref();
    }
}

async function dispatchRescheduleNotificationAttempt(attemptId: number): Promise<void> {
    const attempt = await prisma.bookingNotificationAttempt.findUnique({
        where: { id: attemptId },
        select: {
            id: true,
            company_id: true,
            channel: true,
            target: true,
            status: true,
            attempt_count: true,
            payload: true,
        },
    });

    if (!attempt || attempt.status !== 'PENDING' || !attempt.target) {
        return;
    }

    const payload = toRecord(attempt.payload);
    const now = new Date();
    let ok = false;
    let failureReason = 'SEND_FAILED';

    try {
        if (attempt.channel === 'EMAIL') {
            const subject = typeof payload?.subject === 'string' ? payload.subject : 'Reserva reagendada';
            const html = typeof payload?.html === 'string' ? payload.html : '';
            await sendGenericEmail(attempt.target, subject, html, { companyId: attempt.company_id });
            ok = true;
        } else if (attempt.channel === 'WHATSAPP') {
            const text = typeof payload?.text === 'string' ? payload.text : '';
            const result = await sendWhatsappText(attempt.target, text, { companyId: attempt.company_id });
            ok = result !== -1 && typeof result === 'object' && result.status >= 200 && result.status < 300;
            if (!ok) failureReason = 'WHATSAPP_SEND_FAILED';
        } else {
            failureReason = 'UNSUPPORTED_CHANNEL';
        }
    } catch (error) {
        failureReason = attempt.channel === 'EMAIL' ? 'EMAIL_SEND_FAILED' : 'WHATSAPP_SEND_FAILED';
        logger.warn({ attemptId, channel: attempt.channel, error }, 'Booking reschedule notification attempt failed');
    }

    const nextAttemptCount = attempt.attempt_count + 1;
    if (ok) {
        await prisma.bookingNotificationAttempt.update({
            where: { id: attempt.id },
            data: {
                status: 'SENT',
                reason: null,
                attempt_count: nextAttemptCount,
                last_attempted_at: now,
                sent_at: now,
                next_retry_at: null,
            },
        });
        return;
    }

    const shouldRetry = nextAttemptCount < RESCHEDULE_NOTIFICATION_MAX_ATTEMPTS && failureReason !== 'UNSUPPORTED_CHANNEL';
    const nextRetryAt = shouldRetry
        ? new Date(now.getTime() + RESCHEDULE_NOTIFICATION_RETRY_DELAY_MS)
        : null;

    await prisma.bookingNotificationAttempt.update({
        where: { id: attempt.id },
        data: {
            status: shouldRetry ? 'PENDING' : 'FAILED',
            reason: failureReason,
            attempt_count: nextAttemptCount,
            last_attempted_at: now,
            next_retry_at: nextRetryAt,
        },
    });

    if (shouldRetry) {
        scheduleRescheduleNotificationRetry(attempt.id, RESCHEDULE_NOTIFICATION_RETRY_DELAY_MS);
    }
}

function dispatchRescheduleNotificationAttempts(attemptIds: number[]): void {
    for (const attemptId of attemptIds) {
        void dispatchRescheduleNotificationAttempt(attemptId);
    }
}

async function resolveAdminCustomer(
    companyId: number,
    input: AdminCustomerInput,
): Promise<{ customer: ResolvedAdminCustomer } | AdminBookingResult> {
    if (input.customer_id) {
        const customerProfile = await prisma.customerProfile.findFirst({
            where: {
                id: input.customer_id,
                company_id: companyId,
                deleted_at: null,
            },
            include: {
                user: {
                    select: {
                        name: true,
                        first_name: true,
                        last_name: true,
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
            },
        });

        if (!customerProfile) {
            return {
                code: 404,
                message: 'Customer not found for this company',
                error: true,
            };
        }

        return {
            customer: {
                customerId: customerProfile.id,
                clientName: buildCustomerName(customerProfile.user),
                clientEmail: customerProfile.user.email || null,
                clientPhonePrefix: customerProfile.user.phone_prefix || null,
                clientPhoneNumber: customerProfile.user.phoneNumber || null,
            },
        };
    }

    if (!input.client_name?.trim()) {
        return {
            code: 400,
            message: 'client_name is required for walk-in bookings',
            error: true,
        };
    }

    const phonePrefix = normalizePhone(input.client_phone_prefix);
    const phoneNumber = normalizePhone(input.client_phone_number);

    const normalizedEmail = normalizeEmail(input.client_email);
    if (normalizedEmail) {
        const provisioned = await ensureCustomerProfileWithAccount({
            companyId,
            fullName: input.client_name.trim(),
            email: normalizedEmail,
            phone: phoneNumber,
            phonePrefix,
        });

        if ('error' in provisioned && provisioned.error) {
            return {
                code: provisioned.code,
                message: provisioned.message,
                error: true,
            };
        }

        return {
            customer: {
                customerId: provisioned.customerProfileId,
                clientName: provisioned.userName || input.client_name.trim(),
                clientEmail: provisioned.userEmail || normalizedEmail,
                clientPhonePrefix: provisioned.userPhonePrefix || phonePrefix,
                clientPhoneNumber: provisioned.userPhoneNumber || phoneNumber,
                inviteContext: provisioned.inviteContext,
            },
        };
    }

    return {
        customer: {
            customerId: null,
            clientName: input.client_name.trim(),
            clientEmail: normalizedEmail,
            clientPhonePrefix: phonePrefix,
            clientPhoneNumber: phoneNumber,
            inviteContext: null,
        },
    };
}

async function resolveAdminPayment(
    companyId: number,
    input: AdminPaymentInput,
): Promise<{ payment: ResolvedAdminPayment } | AdminBookingResult> {
    if (!input.is_paid) {
        return {
            payment: {
                paymentMethod: PaymentMethod.NONE,
                paymentStatus: PaymentStatus.UNPAID,
                qrProofImageUrl: null,
            },
        };
    }

    const paymentMethod = input.payment_method ?? PaymentMethod.NONE;
    if (paymentMethod === PaymentMethod.NONE) {
        return {
            code: 400,
            message: 'payment_method is required when the booking is marked as paid',
            error: true,
        };
    }

    const settings = await prisma.companySettings.findUnique({
        where: { company_id: companyId },
        select: {
            allow_cash_payment: true,
            allow_qr_payment: true,
            require_comprobante_for_qr: true,
        },
    });
    const canCustomizeFlow = await isFeatureEnabledForCompany(companyId, 'BOOKING_FLOW_CUSTOMIZATION');
    const requireComprobante = canCustomizeFlow ? (settings?.require_comprobante_for_qr ?? true) : true;

    if (paymentMethod === PaymentMethod.CASH && settings && !settings.allow_cash_payment) {
        return {
            code: 400,
            message: 'Cash payment is not enabled for this business',
            error: true,
        };
    }

    if (paymentMethod === PaymentMethod.QR && settings && !settings.allow_qr_payment) {
        return {
            code: 400,
            message: 'QR payment is not enabled for this business',
            error: true,
        };
    }

    const qrProofImageUrl = input.qr_proof_image_url?.trim() || null;
    if (paymentMethod === PaymentMethod.QR && requireComprobante && !qrProofImageUrl) {
        return {
            code: 400,
            message: 'QR proof is required when the booking is paid with QR',
            error: true,
        };
    }

    return {
        payment: {
            paymentMethod,
            paymentStatus: PaymentStatus.PAID,
            qrProofImageUrl: paymentMethod === PaymentMethod.QR ? qrProofImageUrl : null,
        },
    };
}

async function prepareAdminBookingSession(params: {
    companyId: number;
    staffId: number;
    serviceIds: number[];
    startAtRaw: string;
    payment: AdminPaymentInput;
}): Promise<{ prepared: PreparedAdminBookingSession } | AdminBookingResult> {
    if (!params.serviceIds || params.serviceIds.length === 0 || !params.startAtRaw) {
        return {
            code: 400,
            message: 'service_ids and start_at are required',
            error: true,
        };
    }

    const timeZone = await getCompanyTimeZone(params.companyId);
    const startAt = parseDateTimeInTimeZone(params.startAtRaw, timeZone);
    if (isNaN(startAt.getTime())) {
        return {
            code: 400,
            message: 'Invalid start_at format',
            error: true,
        };
    }

    const services = await BookingRepo.getServicesByIds(params.serviceIds, params.companyId);
    if (services.length !== params.serviceIds.length) {
        return {
            code: 400,
            message: 'No valid services found',
            error: true,
        };
    }

    const promotionsEnabled = await companyHasCapability(
        params.companyId,
        'RESERVAS_SERVICE_PROMOTIONS',
    );
    const totalDuration = services.reduce((sum, service) => sum + service.duration_minutes, 0);
    const totalPrice = services.reduce((sum, service) => {
        const pricing = resolveEffectiveServicePrice({
            priceCents: service.price_cents,
            promoPriceCents: service.promo_price_cents ?? null,
            promoStartsAt: service.promo_starts_at ?? null,
            promoEndsAt: service.promo_ends_at ?? null,
            promoLabel: service.promo_label ?? null,
            promotionsEnabled,
        });

        return sum + pricing.finalPriceCents;
    }, 0);
    const endAt = new Date(startAt.getTime() + totalDuration * 60 * 1000);

    const conflict = await BookingRepo.checkSlotConflict(
        params.companyId,
        params.staffId,
        startAt,
        endAt,
        0,
    );

    if (conflict) {
        return {
            code: 409,
            message: 'Time slot conflicts with another booking',
            error: true,
        };
    }

    const paymentResult = await resolveAdminPayment(params.companyId, params.payment);
    if ('error' in paymentResult) {
        return paymentResult;
    }

    return {
        prepared: {
            startAt,
            endAt,
            totalPrice,
            services,
            serviceSnapshots: buildAdminServiceSnapshots(services, promotionsEnabled),
            payment: paymentResult.payment,
        },
    };
}

async function sendAdminBookingCreatedSideEffects(params: {
    companyId: number;
    staffId: number;
    serviceIds: number[];
    bookingId: number;
    startAt: Date;
    endAt: Date;
    totalPrice: number;
    customer: ResolvedAdminCustomer;
    services: PreparedAdminBookingSession['services'];
}) {
    const canSendTransactionalNotifications = await isFeatureEnabledForCompany(
        params.companyId,
        'TRANSACTIONAL_BOOKING_NOTIFICATIONS',
    );

    if (canSendTransactionalNotifications && (params.customer.clientEmail || params.customer.clientPhoneNumber)) {
        const company = await prisma.company.findUnique({
            where: { id: params.companyId },
            select: { name: true },
        });
        const staffProfile = await prisma.staffProfile.findFirst({
            where: { id: params.staffId, company_id: params.companyId },
            select: { display_name: true },
        });

        void notifyBookingCreated({
            companyId: params.companyId,
            bookingId: params.bookingId,
            staffId: params.staffId,
            customerEmail: params.customer.clientEmail,
            customerPhone: params.customer.clientPhoneNumber,
            customerPhonePrefix: params.customer.clientPhonePrefix,
            customerName: params.customer.clientName,
            companyName: company?.name || '',
            staffName: staffProfile?.display_name || '',
            serviceNames: params.services.map((service) => service.name),
            startAt: params.startAt,
            endAt: params.endAt,
            totalPriceCents: params.totalPrice,
        });
    }

    void MarketplaceAnalyticsService.trackBookingConfirmed({
        source: 'admin',
        booking_source: BookingSource.ADMIN,
        company_id: params.companyId,
        booking_id: params.bookingId,
        service_ids: params.serviceIds,
        staff_id: params.staffId,
        start_at: params.startAt.toISOString(),
        date: params.startAt.toISOString().slice(0, 10),
        time: params.startAt.toISOString().slice(11, 16),
        total_price_cents: params.totalPrice,
    });
}

async function createAdminMultiSessionBookings(params: {
    companyId: number;
    staffId: number;
    createdByUserId: string;
    customer: ResolvedAdminCustomer;
    payment: ResolvedAdminPayment;
    serviceIds: number[];
    sessionSlots: AdminSessionSlotInput[];
    notes?: string;
}): Promise<AdminBookingResult> {
    if (params.serviceIds.length !== 1) {
        return {
            code: 400,
            message: 'Multi-session admin bookings must contain exactly one service',
            error: true,
        };
    }

    const [service] = await BookingRepo.getServicesByIds(params.serviceIds, params.companyId);
    if (!service) {
        return {
            code: 400,
            message: 'No valid services found',
            error: true,
        };
    }

    if (!service.is_multi_session) {
        return {
            code: 400,
            message: 'session_slots can only be used with multi-session services',
            error: true,
        };
    }

    const sessionCount = service.session_count ?? 0;
    const sessionDurationMinutes = service.session_duration_minutes ?? 0;

    if (sessionCount <= 1 || sessionDurationMinutes <= 0) {
        return {
            code: 400,
            message: 'Invalid multi-session service configuration',
            error: true,
        };
    }

    if (params.sessionSlots.length !== sessionCount) {
        return {
            code: 400,
            message: `Choose a date and time for all ${sessionCount} sessions`,
            error: true,
        };
    }

    const timeZone = await getCompanyTimeZone(params.companyId);
    const parsedSlots = params.sessionSlots.map((slot, index) => {
        const startAt = parseDateTimeInTimeZone(slot.start_at, timeZone);
        return {
            sessionIndex: index + 1,
            startAt,
            endAt: new Date(startAt.getTime() + sessionDurationMinutes * 60 * 1000),
        };
    });

    if (parsedSlots.some((slot) => isNaN(slot.startAt.getTime()))) {
        return {
            code: 400,
            message: 'Invalid session start_at format',
            error: true,
        };
    }

    for (let index = 0; index < parsedSlots.length; index += 1) {
        const slot = parsedSlots[index];
        const overlap = parsedSlots.find((candidate, candidateIndex) =>
            candidateIndex !== index &&
            intervalsOverlap(slot.startAt, slot.endAt, candidate.startAt, candidate.endAt),
        );

        if (overlap) {
            return {
                code: 409,
                message: 'Selected sessions overlap with each other',
                error: true,
            };
        }

        const conflict = await BookingRepo.checkSlotConflict(
            params.companyId,
            params.staffId,
            slot.startAt,
            slot.endAt,
            0,
        );

        if (conflict) {
            return {
                code: 409,
                message: `Session ${slot.sessionIndex} conflicts with another booking`,
                error: true,
            };
        }
    }

    const promotionsEnabled = await companyHasCapability(
        params.companyId,
        'RESERVAS_SERVICE_PROMOTIONS',
    );
    const pricing = resolveEffectiveServicePrice({
        priceCents: service.price_cents,
        promoPriceCents: service.promo_price_cents ?? null,
        promoStartsAt: service.promo_starts_at ?? null,
        promoEndsAt: service.promo_ends_at ?? null,
        promoLabel: service.promo_label ?? null,
        promotionsEnabled,
    });
    const perSessionPrices = splitAmountAcrossSessions(pricing.finalPriceCents, sessionCount);
    const perSessionRegularPrices =
        pricing.promoApplied && pricing.regularPriceCents
            ? splitAmountAcrossSessions(pricing.regularPriceCents, sessionCount)
            : null;

    const created = await prisma.$transaction(async (tx) => {
        const bookingGroup = await tx.bookingGroup.create({
            data: {
                company_id: params.companyId,
                customer_id: params.customer.customerId,
                group_type: 'MULTI_SESSION_SERVICE',
                metadata: {
                    service_id: service.id,
                    session_count: sessionCount,
                },
            },
        });

        const createdBookings: Array<{
            id: number;
            startAt: Date;
            endAt: Date;
            totalPrice: number;
        }> = [];

        for (const slot of parsedSlots) {
            const booking = await tx.booking.create({
                data: {
                    company_id: params.companyId,
                    booking_group_id: bookingGroup.id,
                    staff_id: params.staffId,
                    customer_id: params.customer.customerId,
                    client_name: params.customer.clientName,
                    client_email: params.customer.clientEmail,
                    client_phone_prefix: params.customer.clientPhonePrefix,
                    client_phone_number: params.customer.clientPhoneNumber,
                    booking_type: 'CUSTOMER',
                    booking_source: BookingSource.ADMIN,
                    start_at: slot.startAt,
                    end_at: slot.endAt,
                    status: BookingStatus.CONFIRMED,
                    payment_method: params.payment.paymentMethod,
                    payment_status: params.payment.paymentStatus,
                    qr_proof_image_url: params.payment.qrProofImageUrl,
                    total_price_cents: perSessionPrices[slot.sessionIndex - 1] ?? pricing.finalPriceCents,
                    session_index: slot.sessionIndex,
                    session_count: sessionCount,
                    notes: params.notes,
                    created_by_user_id: params.createdByUserId,
                },
            });

            await tx.bookingService.create({
                data: {
                    booking_id: booking.id,
                    company_id: params.companyId,
                    service_id: service.id,
                    service_name_snapshot: service.name,
                    price_cents_snapshot:
                        perSessionPrices[slot.sessionIndex - 1] ?? pricing.finalPriceCents,
                    regular_price_cents_snapshot:
                        perSessionRegularPrices?.[slot.sessionIndex - 1] ?? null,
                    promo_applied_snapshot: pricing.promoApplied,
                    promo_label_snapshot: pricing.promoLabel,
                    duration_minutes_snapshot: sessionDurationMinutes,
                    position: 0,
                },
            });

            createdBookings.push({
                id: booking.id,
                startAt: slot.startAt,
                endAt: slot.endAt,
                totalPrice: booking.total_price_cents,
            });
        }

        return createdBookings;
    });

    for (const booking of created) {
        await sendAdminBookingCreatedSideEffects({
            companyId: params.companyId,
            staffId: params.staffId,
            serviceIds: params.serviceIds,
            bookingId: booking.id,
            startAt: booking.startAt,
            endAt: booking.endAt,
            totalPrice: booking.totalPrice,
            customer: params.customer,
            services: [service],
        });
    }

    if (params.customer.inviteContext) {
        void sendCustomerPortalInvite(params.customer.inviteContext).catch((error) => {
            logger.error({ companyId: params.companyId, bookingCount: created.length, error }, 'Failed to send customer portal invite after admin multi-session bookings');
        });
    }

    const primaryBooking = await AdminBookingRepo.getBookingById(created[0]?.id, params.companyId);

    return {
        code: 201,
        message: 'Booking created successfully',
        error: false,
        data: primaryBooking,
    };
}

async function createAdminBookingRecord(params: {
    companyId: number;
    staffId: number;
    createdByUserId: string;
    customer: ResolvedAdminCustomer;
    prepared: PreparedAdminBookingSession;
    notes?: string;
}) {
    if (params.customer.customerId) {
        return AdminBookingRepo.createCustomerBooking(
            {
                company_id: params.companyId,
                staff_id: params.staffId,
                customer_id: params.customer.customerId,
                start_at: params.prepared.startAt,
                end_at: params.prepared.endAt,
                notes: params.notes,
                created_by_user_id: params.createdByUserId,
                total_price_cents: params.prepared.totalPrice,
                payment_method: params.prepared.payment.paymentMethod,
                payment_status: params.prepared.payment.paymentStatus,
                qr_proof_image_url: params.prepared.payment.qrProofImageUrl,
                booking_source: BookingSource.ADMIN,
            },
            params.prepared.serviceSnapshots,
        );
    }

    return AdminBookingRepo.createWalkInBooking(
        {
            company_id: params.companyId,
            staff_id: params.staffId,
            client_name: params.customer.clientName,
            client_phone_prefix: params.customer.clientPhonePrefix || undefined,
            client_phone_number: params.customer.clientPhoneNumber || undefined,
            client_email: params.customer.clientEmail || undefined,
            start_at: params.prepared.startAt,
            end_at: params.prepared.endAt,
            notes: params.notes,
            created_by_user_id: params.createdByUserId,
            total_price_cents: params.prepared.totalPrice,
            payment_method: params.prepared.payment.paymentMethod,
            payment_status: params.prepared.payment.paymentStatus,
            qr_proof_image_url: params.prepared.payment.qrProofImageUrl,
            booking_source: BookingSource.ADMIN,
        },
        params.prepared.serviceSnapshots,
    );
}

function reminderCacheKey(companyId: number, bookingId: number, channel: ReminderChannel, dateKey: string): string {
    return `${companyId}:${bookingId}:${channel}:${dateKey}`;
}

async function getReminderBookingContext(companyId: number, bookingId?: number) {
    const company = await prisma.company.findUnique({
        where: { id: companyId, deleted_at: null },
        select: { id: true, name: true, slug: true, timezone: true },
    });

    if (!company) return null;

    const languageConfig = await prisma.configMessage.findUnique({
        where: {
            company_id_key: {
                company_id: companyId,
                key: DEFAULT_LANGUAGE_KEY,
            },
        },
        select: { value: true },
    });
    const locale: 'en' | 'es' = (languageConfig?.value || '').trim().toLowerCase() === 'en' ? 'en' : 'es';

    const timeZone = company.timezone || 'America/La_Paz';
    const { startUtc, endUtc, dateKey } = getTodayRangeInTimeZone(timeZone);

    const bookingWhere: any = {
        company_id: companyId,
        deleted_at: null,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        start_at: { gte: startUtc, lt: endUtc },
    };

    if (bookingId !== undefined) bookingWhere.id = bookingId;

    const bookings = await prisma.booking.findMany({
        where: bookingWhere,
        include: {
            customer: {
                include: {
                    user: {
                        select: {
                            email: true,
                            name: true,
                            first_name: true,
                            last_name: true,
                            phoneNumber: true,
                            phone_prefix: true,
                        },
                    },
                },
            },
            staff: {
                select: {
                    id: true,
                    display_name: true,
                },
            },
            booking_services: {
                select: {
                    service_name_snapshot: true,
                },
                orderBy: { position: 'asc' },
            },
        },
        orderBy: { start_at: 'asc' },
    });

    return { company, bookings, dateKey, locale };
}

/**
 * Get bookings with filters
 */
export async function getBookings(params: {
    companyId: number;
    startDate?: string;
    endDate?: string;
    status?: BookingStatus;
    staffId?: number;
}): Promise<AdminBookingResult> {
    try {
        // Parse dates
        const startDate = params.startDate ? new Date(params.startDate) : undefined;
        const endDate = params.endDate ? new Date(params.endDate) : undefined;

        // Validate dates
        if (startDate && isNaN(startDate.getTime())) {
            return {
                code: 400,
                message: 'Invalid start date format',
                error: true,
            };
        }
        if (endDate && isNaN(endDate.getTime())) {
            return {
                code: 400,
                message: 'Invalid end date format',
                error: true,
            };
        }

        const result = await AdminBookingRepo.getBookingsWithFilters({
            companyId: params.companyId,
            startDate,
            endDate,
            status: params.status,
            staffId: params.staffId,
        });

        return {
            code: 200,
            message: 'Bookings retrieved successfully',
            error: false,
            data: {
                bookings: result,
            },
        };
    } catch (error: any) {
        console.error('Error getting bookings:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

export async function getBookingRescheduleOptions(params: {
    companyId: number;
    bookingId: number;
    date?: string;
}): Promise<AdminBookingResult> {
    try {
        const existingBooking = await AdminBookingRepo.getBookingById(params.bookingId, params.companyId);
        if (!existingBooking) {
            return {
                code: 404,
                message: 'Booking not found',
                error: true,
            };
        }

        if (!reschedulableStatuses.has(existingBooking.status)) {
            return {
                code: 400,
                message: 'Solo se pueden reagendar reservas pendientes o confirmadas.',
                error: true,
            };
        }

        const company = await BookingRepo.getCompanyById(params.companyId);
        const timeZone = company?.timezone || 'America/La_Paz';
        const durationMinutes = getBookingDurationMinutes(existingBooking);
        const currentDateKey = getDateKeyAndMinutesInTimeZone(existingBooking.start_at, timeZone).dateKey;
        const dateKey = params.date && parseDateOnlyParts(params.date) ? params.date : currentDateKey;
        const currentTime = getDateKeyAndMinutesInTimeZone(existingBooking.start_at, timeZone);
        const preferredStartAt = parseDateTimeInTimeZone(
            `${dateKey}T${minutesToTime(currentTime.minutes)}:00`,
            timeZone,
        );
        const secondaryResourceIds = await getRequiredSecondaryResourceIds(params.companyId, existingBooking);
        const suggestions = await buildRescheduleSuggestions({
            companyId: params.companyId,
            bookingId: params.bookingId,
            staffId: existingBooking.staff_id,
            secondaryResourceIds,
            durationMinutes,
            preferredStartAt,
            timezone: timeZone,
            limit: 8,
        });

        return {
            code: 200,
            message: 'Reschedule options generated',
            error: false,
            data: {
                timezone: timeZone,
                duration_minutes: durationMinutes,
                current_start_at: existingBooking.start_at,
                current_end_at: existingBooking.end_at,
                suggestions,
            },
        };
    } catch (error: any) {
        console.error('Error getting reschedule options:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

export async function rescheduleBookingDateTime(
    bookingId: number,
    companyId: number,
    input: {
        start_at: string;
        confirm_short_notice?: boolean;
    },
    updatedByUserId: string,
): Promise<AdminBookingResult> {
    try {
        const existingBooking = await AdminBookingRepo.getBookingById(bookingId, companyId);
        if (!existingBooking) {
            return {
                code: 404,
                message: 'Booking not found',
                error: true,
            };
        }

        if (!reschedulableStatuses.has(existingBooking.status)) {
            return {
                code: 400,
                message: 'Solo se pueden reagendar reservas pendientes o confirmadas.',
                error: true,
            };
        }

        const now = new Date();
        if (existingBooking.start_at.getTime() < now.getTime()) {
            return {
                code: 400,
                message: 'No se puede reagendar una reserva que ya empezó o está en el pasado.',
                error: true,
            };
        }

        const company = await BookingRepo.getCompanyById(companyId);
        const timeZone = company?.timezone || 'America/La_Paz';
        const startAt = parseDateTimeInTimeZone(input.start_at, timeZone);

        if (isNaN(startAt.getTime())) {
            return {
                code: 400,
                message: 'Invalid date format for start_at',
                error: true,
            };
        }

        if (startAt.getTime() <= now.getTime()) {
            const secondaryResourceIds = await getRequiredSecondaryResourceIds(companyId, existingBooking);
            const suggestions = await buildRescheduleSuggestions({
                companyId,
                bookingId,
                staffId: existingBooking.staff_id,
                secondaryResourceIds,
                durationMinutes: getBookingDurationMinutes(existingBooking),
                preferredStartAt: now,
                timezone: timeZone,
                limit: 6,
            });

            return {
                code: 400,
                message: 'La nueva fecha y hora debe estar en el futuro.',
                error: true,
                data: { suggestions },
            };
        }

        if (
            startAt.getTime() - now.getTime() < SHORT_NOTICE_RESCHEDULE_MS &&
            input.confirm_short_notice !== true
        ) {
            const secondaryResourceIds = await getRequiredSecondaryResourceIds(companyId, existingBooking);
            const suggestions = await buildRescheduleSuggestions({
                companyId,
                bookingId,
                staffId: existingBooking.staff_id,
                secondaryResourceIds,
                durationMinutes: getBookingDurationMinutes(existingBooking),
                preferredStartAt: startAt,
                timezone: timeZone,
                limit: 6,
            });

            return {
                code: 409,
                message: 'Esta reserva queda dentro de las próximas 24 horas. Confirma para continuar.',
                error: true,
                reason: 'SHORT_NOTICE_CONFIRMATION_REQUIRED',
                data: {
                    requires_confirmation: true,
                    suggestions,
                },
            } as AdminBookingResult & { reason: string };
        }

        if (startAt.getTime() === existingBooking.start_at.getTime()) {
            return {
                code: 400,
                message: 'La reserva ya está en esa fecha y hora.',
                error: true,
            };
        }

        const durationMinutes = getBookingDurationMinutes(existingBooking);
        const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
        const secondaryResourceIds = await getRequiredSecondaryResourceIds(companyId, existingBooking);
        const validation = await validateRescheduleSlot({
            companyId,
            bookingId,
            staffId: existingBooking.staff_id,
            secondaryResourceIds,
            startAt,
            endAt,
            timezone: timeZone,
        });

        if (!validation.available) {
            const suggestions = await buildRescheduleSuggestions({
                companyId,
                bookingId,
                staffId: existingBooking.staff_id,
                secondaryResourceIds,
                durationMinutes,
                preferredStartAt: startAt,
                timezone: timeZone,
                limit: 6,
            });

            return {
                code: validation.code,
                message: validation.message,
                error: true,
                data: {
                    ...(validation.data || {}),
                    reason: validation.reason,
                    suggestions,
                },
            };
        }

        const notificationDrafts = await buildRescheduleNotificationDrafts({
            companyId,
            booking: existingBooking,
            oldStartAt: existingBooking.start_at,
            oldEndAt: existingBooking.end_at,
            newStartAt: startAt,
            newEndAt: endAt,
            timeZone,
        });

        const transactionResult = await prisma.$transaction(async (tx) => {
            await tx.booking.update({
                where: { id: bookingId },
                data: {
                    start_at: startAt,
                    end_at: endAt,
                    updated_by_user_id: updatedByUserId,
                },
            });

            const auditLog = await tx.bookingAuditLog.create({
                data: {
                    company_id: companyId,
                    booking_id: bookingId,
                    action: 'RESCHEDULE',
                    actor_user_id: updatedByUserId,
                    old_start_at: existingBooking.start_at,
                    old_end_at: existingBooking.end_at,
                    new_start_at: startAt,
                    new_end_at: endAt,
                    metadata: {
                        ...(notificationDrafts.metadata as Record<string, unknown>),
                        short_notice_confirmed: input.confirm_short_notice === true,
                        secondary_resource_ids: secondaryResourceIds,
                    } as Prisma.InputJsonValue,
                    notification_attempts: {
                        create: notificationDrafts.attempts.map((attempt) => ({
                            company_id: companyId,
                            booking_id: bookingId,
                            event: 'RESCHEDULE',
                            recipient_type: attempt.recipient_type,
                            recipient_user_id: attempt.recipient_user_id,
                            channel: attempt.channel,
                            target: attempt.target,
                            status: attempt.status,
                            reason: attempt.reason,
                            payload: attempt.payload,
                        })),
                    },
                },
                include: {
                    notification_attempts: {
                        select: { id: true, status: true },
                    },
                },
            });

            return {
                auditLogId: auditLog.id,
                pendingAttemptIds: auditLog.notification_attempts
                    .filter((attempt) => attempt.status === 'PENDING')
                    .map((attempt) => attempt.id),
                notificationAttemptCount: auditLog.notification_attempts.length,
            };
        });

        dispatchRescheduleNotificationAttempts(transactionResult.pendingAttemptIds);

        const updatedBooking = await AdminBookingRepo.getBookingById(bookingId, companyId);

        return {
            code: 200,
            message: 'Booking rescheduled successfully',
            error: false,
            data: {
                booking: updatedBooking,
                audit_log_id: transactionResult.auditLogId,
                notification_attempts: {
                    total: transactionResult.notificationAttemptCount,
                    queued: transactionResult.pendingAttemptIds.length,
                },
            },
        };
    } catch (error: any) {
        console.error('Error rescheduling booking:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Update booking (status change, reschedule, notes)
 */
export async function updateBooking(
    bookingId: number,
    companyId: number,
    updates: {
        status?: BookingStatus;
        start_at?: string;
        notes?: string | null;
        staff_id?: number;
        service_ids?: number[];
    },
    updatedByUserId: string,
    actorRole?: CompanyUserRole
): Promise<AdminBookingResult> {
    try {
        const timeZone = await getCompanyTimeZone(companyId);

        // Check if booking exists
        const existingBooking = await AdminBookingRepo.getBookingById(bookingId, companyId);
        if (!existingBooking) {
            return {
                code: 404,
                message: 'Booking not found',
                error: true,
            };
        }

        if (actorRole === CompanyUserRole.STAFF) {
            const staffProfile = await prisma.staffProfile.findFirst({
                where: {
                    company_id: companyId,
                    user_id: updatedByUserId,
                    deleted_at: null,
                },
                select: { id: true },
            });

            if (!staffProfile) {
                return {
                    code: 403,
                    message: 'Staff profile not found in this company',
                    error: true,
                };
            }

            if (existingBooking.staff_id !== staffProfile.id) {
                return {
                    code: 403,
                    message: 'Staff can only modify their own bookings',
                    error: true,
                };
            }

            if (updates.staff_id !== undefined || updates.service_ids !== undefined) {
                return {
                    code: 403,
                    message: 'Staff cannot reassign staff or change services',
                    error: true,
                };
            }
        }

        // Validate status transitions
        if (updates.status) {
            const validTransitions: Record<BookingStatus, BookingStatus[]> = {
                [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
                [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
                [BookingStatus.COMPLETED]: [], // No transitions from completed
                [BookingStatus.CANCELLED]: [], // No transitions from cancelled
                [BookingStatus.NO_SHOW]: [], // No transitions from no-show
            };

            if (!validTransitions[existingBooking.status].includes(updates.status)) {
                return {
                    code: 400,
                    message: `Invalid status transition from ${existingBooking.status} to ${updates.status}`,
                    error: true,
                };
            }
        }

        // Update staff if provided
        if (updates.staff_id && updates.staff_id !== existingBooking.staff_id) {
            await AdminBookingRepo.updateBookingStaff(
                bookingId,
                companyId,
                updates.staff_id,
                updatedByUserId
            );
        }

        // Determine the effective staff_id for conflict checks
        const effectiveStaffId = updates.staff_id || existingBooking.staff_id;

        // Update services if provided
        if (updates.service_ids && updates.service_ids.length > 0) {
            const services = await BookingRepo.getServicesByIds(updates.service_ids, companyId);
            if (services.length === 0) {
                return {
                    code: 400,
                    message: 'No valid services found',
                    error: true,
                };
            }

            const promotionsEnabled = await companyHasCapability(
                companyId,
                'RESERVAS_SERVICE_PROMOTIONS',
            );
            const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0);
            const totalPrice = services.reduce((sum, service) => {
                const pricing = resolveEffectiveServicePrice({
                    priceCents: service.price_cents,
                    promoPriceCents: service.promo_price_cents ?? null,
                    promoStartsAt: service.promo_starts_at ?? null,
                    promoEndsAt: service.promo_ends_at ?? null,
                    promoLabel: service.promo_label ?? null,
                    promotionsEnabled,
                });

                return sum + pricing.finalPriceCents;
            }, 0);

            // Use new start_at if provided, otherwise use existing
            const baseStartAt = updates.start_at
                ? parseDateTimeInTimeZone(updates.start_at, timeZone)
                : existingBooking.start_at;
            const endAt = new Date(baseStartAt.getTime() + totalDuration * 60 * 1000);

            const serviceSnapshots = buildAdminServiceSnapshots(services, promotionsEnabled);

            await AdminBookingRepo.replaceBookingServices(
                bookingId,
                companyId,
                serviceSnapshots,
                totalPrice,
                endAt,
                updatedByUserId
            );

            // If start_at was also provided, reschedule (end_at is already handled above)
            if (updates.start_at) {
                const startAt = parseDateTimeInTimeZone(updates.start_at, timeZone);
                if (isNaN(startAt.getTime())) {
                    return {
                        code: 400,
                        message: 'Invalid date format for start_at',
                        error: true,
                    };
                }

                // Check availability for new time slot
                const conflict = await BookingRepo.checkSlotConflict(
                    companyId,
                    effectiveStaffId,
                    startAt,
                    endAt,
                    0
                );

                if (conflict && conflict.id !== bookingId) {
                    return {
                        code: 409,
                        message: 'Time slot conflicts with another booking',
                        error: true,
                    };
                }

                await AdminBookingRepo.rescheduleBooking(
                    bookingId,
                    companyId,
                    startAt,
                    endAt,
                    updatedByUserId
                );
            }
        } else if (updates.start_at) {
            // Reschedule without service change
            const startAt = parseDateTimeInTimeZone(updates.start_at, timeZone);

            if (isNaN(startAt.getTime())) {
                return {
                    code: 400,
                    message: 'Invalid date format for start_at',
                    error: true,
                };
            }

            // Calculate end_at based on existing services duration
            const totalDuration = existingBooking.booking_services.reduce(
                (sum: number, bs: any) => sum + bs.service.duration_minutes,
                0
            );
            const endAt = new Date(startAt.getTime() + totalDuration * 60 * 1000);

            if (startAt >= endAt) {
                return {
                    code: 400,
                    message: 'start_at must be before end_at',
                    error: true,
                };
            }

            // Check availability for new time slot
            const conflict = await BookingRepo.checkSlotConflict(
                companyId,
                effectiveStaffId,
                startAt,
                endAt,
                0
            );

            if (conflict && conflict.id !== bookingId) {
                return {
                    code: 409,
                    message: 'Time slot conflicts with another booking',
                    error: true,
                };
            }

            // Update the times
            await AdminBookingRepo.rescheduleBooking(
                bookingId,
                companyId,
                startAt,
                endAt,
                updatedByUserId
            );
        }

        const sanitizedNotes =
            updates.notes !== undefined
                ? stripLegacyNoShowMarker(updates.notes)
                : hasLegacyNoShowMarker(existingBooking.notes)
                    ? stripLegacyNoShowMarker(existingBooking.notes)
                    : undefined;

        // Update status
        if (updates.status) {
            await AdminBookingRepo.updateBookingStatus(
                bookingId,
                companyId,
                updates.status,
                updatedByUserId
            );
        }

        // Update notes
        if (sanitizedNotes !== undefined) {
            await AdminBookingRepo.updateBookingNotes(
                bookingId,
                companyId,
                sanitizedNotes,
                updatedByUserId
            );
        }

        // Get updated booking
        const updatedBooking = await AdminBookingRepo.getBookingById(bookingId, companyId);

        // Send notification based on what changed (fire-and-forget)
        const canSendTransactionalNotifications = await isFeatureEnabledForCompany(
            companyId,
            'TRANSACTIONAL_BOOKING_NOTIFICATIONS',
        );

        if (updatedBooking && canSendTransactionalNotifications) {
            const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
            const staffProfile = await prisma.staffProfile.findFirst({
                where: { id: updatedBooking.staff_id, company_id: companyId },
                select: { display_name: true },
            });

            // Resolve customer contact info
            let customerEmail = updatedBooking.client_email;
            let customerPhone = updatedBooking.client_phone_number;
            let customerPhonePrefix = updatedBooking.client_phone_prefix;
            let customerName = updatedBooking.client_name;

            if (updatedBooking.customer_id) {
                const customerProfile = await prisma.customerProfile.findUnique({
                    where: { id: updatedBooking.customer_id },
                    include: { user: { select: { email: true, name: true, phoneNumber: true, phone_prefix: true } } },
                });
                if (customerProfile?.user) {
                    customerEmail = customerEmail || customerProfile.user.email;
                    customerPhone = customerPhone || customerProfile.user.phoneNumber;
                    customerPhonePrefix = customerPhonePrefix || customerProfile.user.phone_prefix;
                    customerName = customerName || customerProfile.user.name;
                }
            }

            const serviceNames = updatedBooking.booking_services?.map(
                (bs: any) => bs.service_name_snapshot || bs.service?.name || ''
            ) || [];

            const notificationData = {
                companyId,
                bookingId,
                staffId: updatedBooking.staff_id,
                customerEmail,
                customerPhone,
                customerPhonePrefix,
                customerName,
                companyName: company?.name || '',
                staffName: staffProfile?.display_name || '',
                serviceNames,
                startAt: updatedBooking.start_at,
                endAt: updatedBooking.end_at,
                totalPriceCents: updatedBooking.total_price_cents || 0,
            };

            if (updates.status === BookingStatus.CONFIRMED && existingBooking.status === BookingStatus.PENDING) {
                // Manual confirmation — send the booking confirmed notification
                void notifyBookingCreated({ ...notificationData, internalAudience: 'none' });
                void notifyBookingConfirmedForStaff(notificationData);
            } else if (updates.status === BookingStatus.CANCELLED) {
                void notifyBookingCancelled(notificationData);
            } else if (updates.start_at || updates.staff_id || updates.service_ids) {
                void notifyBookingUpdated(notificationData);
            }
        }

        // Send review request reminder when booking is completed (fire-and-forget)
        if (updates.status === BookingStatus.COMPLETED && updatedBooking) {
            const companyForSlug = await prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true, slug: true },
            });

            let reviewCustomerEmail = updatedBooking.client_email;
            let reviewCustomerPhone = updatedBooking.client_phone_number;
            let reviewCustomerPhonePrefix = updatedBooking.client_phone_prefix;
            let reviewCustomerName = updatedBooking.client_name || 'Customer';

            if (updatedBooking.customer_id) {
                const cp = await prisma.customerProfile.findUnique({
                    where: { id: updatedBooking.customer_id },
                    include: { user: { select: { email: true, name: true, first_name: true, phoneNumber: true, phone_prefix: true } } },
                });
                if (cp?.user) {
                    reviewCustomerEmail = reviewCustomerEmail || cp.user.email;
                    reviewCustomerPhone = reviewCustomerPhone || cp.user.phoneNumber;
                    reviewCustomerPhonePrefix = reviewCustomerPhonePrefix || cp.user.phone_prefix;
                    reviewCustomerName = reviewCustomerName || cp.user.first_name || cp.user.name || 'Customer';
                }
            }

            void sendReviewRequestReminder({
                companyId,
                bookingId,
                customerEmail: reviewCustomerEmail,
                customerPhone: reviewCustomerPhone,
                customerPhonePrefix: reviewCustomerPhonePrefix,
                customerName: reviewCustomerName,
                companyName: companyForSlug?.name || '',
                companySlug: companyForSlug?.slug || null,
            });
        }

        return {
            code: 200,
            message: 'Booking updated successfully',
            error: false,
            data: updatedBooking,
        };
    } catch (error: any) {
        console.error('Error updating booking:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Create booking on behalf of customer (for walk-ins)
 */
export async function createBooking(
    data: {
        companyId: number;
        staff_id: number;
        service_ids: number[];
        start_at: string;
        session_slots?: AdminSessionSlotInput[];
        customer_id?: number;
        client_name?: string;
        client_phone_prefix?: string;
        client_phone_number?: string;
        client_email?: string;
        notes?: string;
        is_paid?: boolean;
        payment_method?: PaymentMethod;
        qr_proof_image_url?: string | null;
    },
    createdByUserId: string
): Promise<AdminBookingResult> {
    try {
        const hasSessionSlots = Array.isArray(data.session_slots) && data.session_slots.length > 0;
        if (!data.staff_id || !data.service_ids || data.service_ids.length === 0 || (!data.start_at && !hasSessionSlots)) {
            return {
                code: 400,
                message: 'staff_id, service_ids, and booking time are required',
                error: true,
            };
        }

        const customerResult = await resolveAdminCustomer(data.companyId, {
            customer_id: data.customer_id,
            client_name: data.client_name,
            client_phone_prefix: data.client_phone_prefix,
            client_phone_number: data.client_phone_number,
            client_email: data.client_email,
        });
        if ('error' in customerResult) {
            return customerResult;
        }

        if (hasSessionSlots) {
            const paymentResult = await resolveAdminPayment(data.companyId, {
                is_paid: data.is_paid,
                payment_method: data.payment_method,
                qr_proof_image_url: data.qr_proof_image_url,
            });
            if ('error' in paymentResult) {
                return paymentResult;
            }

            return createAdminMultiSessionBookings({
                companyId: data.companyId,
                staffId: data.staff_id,
                createdByUserId,
                customer: customerResult.customer,
                payment: paymentResult.payment,
                serviceIds: data.service_ids,
                sessionSlots: data.session_slots ?? [],
                notes: data.notes,
            });
        }

        const sessionResult = await prepareAdminBookingSession({
            companyId: data.companyId,
            staffId: data.staff_id,
            serviceIds: data.service_ids,
            startAtRaw: data.start_at,
            payment: {
                is_paid: data.is_paid,
                payment_method: data.payment_method,
                qr_proof_image_url: data.qr_proof_image_url,
            },
        });
        if ('error' in sessionResult) {
            return sessionResult;
        }

        const booking = await createAdminBookingRecord({
            companyId: data.companyId,
            staffId: data.staff_id,
            createdByUserId,
            customer: customerResult.customer,
            prepared: sessionResult.prepared,
            notes: data.notes,
        });

        if (booking?.id) {
            await sendAdminBookingCreatedSideEffects({
                companyId: data.companyId,
                staffId: data.staff_id,
                serviceIds: data.service_ids,
                bookingId: booking.id,
                startAt: sessionResult.prepared.startAt,
                endAt: sessionResult.prepared.endAt,
                totalPrice: sessionResult.prepared.totalPrice,
                customer: customerResult.customer,
                services: sessionResult.prepared.services,
            });
        }

        if (customerResult.customer.inviteContext) {
            void sendCustomerPortalInvite(customerResult.customer.inviteContext).catch((error) => {
                logger.error({ companyId: data.companyId, bookingId: booking?.id, error }, 'Failed to send customer portal invite after admin booking');
            });
        }

        return {
            code: 201,
            message: 'Booking created successfully',
            error: false,
            data: booking,
        };
    } catch (error: any) {
        console.error('Error creating booking:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

export async function createRecurringBookings(
    data: {
        companyId: number;
        staff_id: number;
        customer_id?: number;
        client_name?: string;
        client_phone_prefix?: string;
        client_phone_number?: string;
        client_email?: string;
        notes?: string;
        sessions: Array<{
            service_ids: number[];
            start_at: string;
            is_paid?: boolean;
            payment_method?: PaymentMethod;
            qr_proof_image_url?: string | null;
        }>;
    },
    createdByUserId: string,
): Promise<AdminBookingResult> {
    try {
        if (!data.staff_id || !Array.isArray(data.sessions) || data.sessions.length === 0) {
            return {
                code: 400,
                message: 'staff_id and sessions are required',
                error: true,
            };
        }

        const preparedSessions: PreparedAdminBookingSession[] = [];
        for (const session of data.sessions) {
            const preparedResult = await prepareAdminBookingSession({
                companyId: data.companyId,
                staffId: data.staff_id,
                serviceIds: session.service_ids,
                startAtRaw: session.start_at,
                payment: {
                    is_paid: session.is_paid,
                    payment_method: session.payment_method,
                    qr_proof_image_url: session.qr_proof_image_url,
                },
            });

            if ('error' in preparedResult) {
                return preparedResult;
            }

            const conflictingNewSession = preparedSessions.find((prepared) =>
                intervalsOverlap(
                    prepared.startAt,
                    prepared.endAt,
                    preparedResult.prepared.startAt,
                    preparedResult.prepared.endAt,
                ),
            );
            if (conflictingNewSession) {
                return {
                    code: 409,
                    message: 'One of the recurring sessions overlaps another session in the same batch',
                    error: true,
                };
            }

            preparedSessions.push(preparedResult.prepared);
        }

        const customerResult = await resolveAdminCustomer(data.companyId, {
            customer_id: data.customer_id,
            client_name: data.client_name,
            client_phone_prefix: data.client_phone_prefix,
            client_phone_number: data.client_phone_number,
            client_email: data.client_email,
        });
        if ('error' in customerResult) {
            return customerResult;
        }

        const createdBookings: any[] = [];
        for (let index = 0; index < preparedSessions.length; index += 1) {
            const prepared = preparedSessions[index];
            const sessionInput = data.sessions[index];

            const booking = await createAdminBookingRecord({
                companyId: data.companyId,
                staffId: data.staff_id,
                createdByUserId,
                customer: customerResult.customer,
                prepared,
                notes: data.notes,
            });

            if (booking?.id) {
                createdBookings.push(booking);
                await sendAdminBookingCreatedSideEffects({
                    companyId: data.companyId,
                    staffId: data.staff_id,
                    serviceIds: sessionInput.service_ids,
                    bookingId: booking.id,
                    startAt: prepared.startAt,
                    endAt: prepared.endAt,
                    totalPrice: prepared.totalPrice,
                    customer: customerResult.customer,
                    services: prepared.services,
                });
            }
        }

        if (customerResult.customer.inviteContext) {
            void sendCustomerPortalInvite(customerResult.customer.inviteContext).catch((error) => {
                logger.error({ companyId: data.companyId, bookingCount: createdBookings.length, error }, 'Failed to send customer portal invite after recurring admin bookings');
            });
        }

        return {
            code: 201,
            message: 'Recurring bookings created successfully',
            error: false,
            data: createdBookings,
        };
    } catch (error: any) {
        console.error('Error creating recurring bookings:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

export async function sendNoShowNotificationForBooking(
    companyId: number,
    bookingId: number,
    options: { channel?: NoShowNotificationChannel; message?: string | null }
): Promise<AdminBookingResult> {
    try {
        const hasTransactionalNotifications = await isFeatureEnabledForCompany(
            companyId,
            'TRANSACTIONAL_BOOKING_NOTIFICATIONS',
        );
        if (!hasTransactionalNotifications) {
            return {
                code: 403,
                message: 'Requiere Mensajería básica',
                error: true,
            };
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId, deleted_at: null },
            select: { id: true, name: true, slug: true },
        });

        if (!company) {
            return {
                code: 404,
                message: 'Company not found',
                error: true,
            };
        }

        const languageConfig = await prisma.configMessage.findUnique({
            where: {
                company_id_key: {
                    company_id: companyId,
                    key: DEFAULT_LANGUAGE_KEY,
                },
            },
            select: { value: true },
        });
        const locale: 'en' | 'es' = (languageConfig?.value || '').trim().toLowerCase() === 'en' ? 'en' : 'es';

        const booking = await prisma.booking.findFirst({
            where: {
                id: bookingId,
                company_id: companyId,
                deleted_at: null,
            },
            include: {
                customer: {
                    include: {
                        user: {
                            select: {
                                email: true,
                                name: true,
                                first_name: true,
                                last_name: true,
                                phoneNumber: true,
                                phone_prefix: true,
                            },
                        },
                    },
                },
                staff: {
                    select: {
                        display_name: true,
                    },
                },
                booking_services: {
                    select: {
                        service_name_snapshot: true,
                    },
                    orderBy: { position: 'asc' },
                },
            },
        });

        if (!booking) {
            return {
                code: 404,
                message: 'Booking not found',
                error: true,
            };
        }

        if (!isNoShowBooking(booking.status, booking.notes)) {
            return {
                code: 400,
                message: 'Booking must be marked as no-show before sending this notification',
                error: true,
            };
        }

        const customerEmail =
            normalizeEmail(booking.customer?.user?.email) ||
            normalizeEmail(booking.client_email);
        const customerPhone =
            normalizePhone(booking.customer?.user?.phoneNumber) ||
            normalizePhone(booking.client_phone_number);
        const customerPhonePrefix =
            (booking.customer?.user?.phone_prefix || booking.client_phone_prefix || '').replace(/\D/g, '') || null;
        const customerName =
            booking.customer?.user?.first_name && booking.customer?.user?.last_name
                ? `${booking.customer.user.first_name} ${booking.customer.user.last_name}`
                : booking.customer?.user?.name || booking.client_name || 'Cliente';

        const preferred = options.channel || 'AUTO';
        const supportedChannels: NoShowNotificationChannel[] = ['AUTO', 'WHATSAPP', 'EMAIL'];
        if (!supportedChannels.includes(preferred)) {
            return {
                code: 400,
                message: 'Invalid notification channel',
                error: true,
            };
        }

        const customMessage = (options.message || '').trim() || undefined;

        const sendResult = await notifyBookingNoShow({
            companyId,
            bookingId: booking.id,
            customerEmail,
            customerPhone,
            customerPhonePrefix,
            customerName,
            companyName: company.name,
            companySlug: company.slug,
            staffName: booking.staff?.display_name || '',
            serviceNames: booking.booking_services
                .map((s) => s.service_name_snapshot)
                .filter((name): name is string => Boolean(name)),
            startAt: booking.start_at,
            endAt: booking.end_at,
            totalPriceCents: booking.total_price_cents,
            locale,
            preferredChannel: preferred,
            customMessage,
        });

        if (!sendResult.sent) {
            const status = sendResult.reason?.startsWith('NO_') ? 'SKIPPED' : 'FAILED';
            return {
                code: 200,
                message: 'No-show notification was not sent',
                error: false,
                data: {
                    booking_id: booking.id,
                    status,
                    reason: sendResult.reason || 'SEND_FAILED',
                },
            };
        }

        return {
            code: 200,
            message: 'No-show notification sent',
            error: false,
            data: {
                booking_id: booking.id,
                status: 'SENT',
                channel: sendResult.channel,
            },
        };
    } catch (error: any) {
        console.error('Error sending no-show notification:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

export async function getTodayReminderPreview(companyId: number): Promise<AdminBookingResult> {
    try {
        const hasBookingReminders = await isFeatureEnabledForCompany(
            companyId,
            'BOOKING_REMINDERS',
        );
        if (!hasBookingReminders) {
            return {
                code: 403,
                message: 'Requiere Mensajería Pro',
                error: true,
            };
        }

        const context = await getReminderBookingContext(companyId);
        if (!context) {
            return {
                code: 404,
                message: 'Company not found',
                error: true,
            };
        }

        const now = Date.now();
        cleanupReminderSentCache(now);

        const items = context.bookings.map((booking) => {
            const customerEmail =
                normalizeEmail(booking.customer?.user?.email) ||
                normalizeEmail(booking.client_email);
            const customerPhone =
                normalizePhone(booking.customer?.user?.phoneNumber) ||
                normalizePhone(booking.client_phone_number);
            const channel = resolveChannel({ customerEmail, customerPhone });

            let alreadySentRecently = false;
            if (channel !== 'NONE') {
                const key = reminderCacheKey(companyId, booking.id, channel, context.dateKey);
                const sentAt = reminderSentAtCache.get(key);
                alreadySentRecently = Boolean(sentAt && now - sentAt < REMINDER_COOLDOWN_MS);
            }

            return {
                booking_id: booking.id,
                customer_name:
                    booking.customer?.user?.first_name && booking.customer?.user?.last_name
                        ? `${booking.customer.user.first_name} ${booking.customer.user.last_name}`
                        : booking.customer?.user?.name || booking.client_name || 'Cliente',
                start_at: booking.start_at,
                channel,
                already_sent_recently: alreadySentRecently,
            };
        });

        const sendableCount = items.filter((item) => item.channel !== 'NONE' && !item.already_sent_recently).length;

        return {
            code: 200,
            message: 'Today reminder preview generated',
            error: false,
            data: {
                date: context.dateKey,
                total: items.length,
                sendable: sendableCount,
                items,
            },
        };
    } catch (error: any) {
        console.error('Error generating today reminder preview:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

export async function sendTodayReminderForBooking(companyId: number, bookingId: number): Promise<AdminBookingResult> {
    try {
        const hasBookingReminders = await isFeatureEnabledForCompany(
            companyId,
            'BOOKING_REMINDERS',
        );
        if (!hasBookingReminders) {
            return {
                code: 403,
                message: 'Requiere Mensajería Pro',
                error: true,
            };
        }

        const context = await getReminderBookingContext(companyId, bookingId);
        if (!context) {
            return {
                code: 404,
                message: 'Company not found',
                error: true,
            };
        }

        const booking = context.bookings[0];
        if (!booking) {
            return {
                code: 404,
                message: 'Booking not found for today',
                error: true,
            };
        }

        const customerEmail =
            normalizeEmail(booking.customer?.user?.email) ||
            normalizeEmail(booking.client_email);
        const customerPhone =
            normalizePhone(booking.customer?.user?.phoneNumber) ||
            normalizePhone(booking.client_phone_number);
        const customerPhonePrefix =
            (booking.customer?.user?.phone_prefix || booking.client_phone_prefix || '').replace(/\D/g, '') || null;
        const customerName =
            booking.customer?.user?.first_name && booking.customer?.user?.last_name
                ? `${booking.customer.user.first_name} ${booking.customer.user.last_name}`
                : booking.customer?.user?.name || booking.client_name || 'Cliente';

        const channel = resolveChannel({ customerEmail, customerPhone });
        if (channel === 'NONE') {
            return {
                code: 200,
                message: 'No contact info available for reminder',
                error: false,
                data: {
                    booking_id: booking.id,
                    status: 'SKIPPED',
                    reason: 'NO_CONTACT',
                },
            };
        }

        const now = Date.now();
        cleanupReminderSentCache(now);
        const cacheKey = reminderCacheKey(companyId, booking.id, channel, context.dateKey);
        const lastSentAt = reminderSentAtCache.get(cacheKey);
        if (lastSentAt && now - lastSentAt < REMINDER_COOLDOWN_MS) {
            return {
                code: 200,
                message: 'Reminder already sent recently',
                error: false,
                data: {
                    booking_id: booking.id,
                    status: 'SKIPPED',
                    reason: 'ALREADY_SENT_RECENTLY',
                    channel,
                },
            };
        }

        const sendResult = await notifyBookingTodayReminder({
            companyId,
            bookingId: booking.id,
            customerEmail,
            customerPhone,
            customerPhonePrefix,
            customerName,
            companyName: context.company.name,
            companySlug: context.company.slug,
            staffName: booking.staff?.display_name || '',
            serviceNames: booking.booking_services
                .map((s) => s.service_name_snapshot)
                .filter((name): name is string => Boolean(name)),
            startAt: booking.start_at,
            endAt: booking.end_at,
            totalPriceCents: booking.total_price_cents,
            locale: context.locale,
        });

        if (!sendResult.sent || !sendResult.channel) {
            return {
                code: 200,
                message: 'Failed to send reminder',
                error: false,
                data: {
                    booking_id: booking.id,
                    status: 'FAILED',
                    reason: sendResult.reason || 'SEND_FAILED',
                    channel,
                },
            };
        }

        reminderSentAtCache.set(cacheKey, Date.now());

        return {
            code: 200,
            message: 'Reminder sent successfully',
            error: false,
            data: {
                booking_id: booking.id,
                status: 'SENT',
                channel: sendResult.channel,
            },
        };
    } catch (error: any) {
        console.error('Error sending today reminder:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
