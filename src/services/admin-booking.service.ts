import { MensajeApi } from '../types/MensajeApi';
import * as AdminBookingRepo from '../repositories/admin-booking.repo';
import * as BookingRepo from '../repositories/booking.repo';
import { BookingSource, BookingStatus, PaymentStatus, PaymentMethod, CompanyUserRole } from '@prisma/client';
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
import { isFeatureEnabledForCompany } from './plan-enforcement.service';
import { sendReviewRequestReminder } from '../utils/reviewNotifications';
import { ensureCustomerProfileWithAccount, sendCustomerPortalInvite, type CustomerAccountInviteContext } from './customer-account.service';
import { parseDateTimeInTimeZone } from '../utils/timezone';
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

const reminderSentAtCache = new Map<string, number>();

type CustomerReminderChannel = ReminderChannel | 'NONE';
export type NoShowNotificationChannel = DirectNotificationChannel;

interface AdminCustomerInput {
    customer_id?: number;
    client_name?: string;
    client_phone?: string;
    client_email?: string;
}

interface AdminPaymentInput {
    is_paid?: boolean;
    payment_method?: PaymentMethod;
    qr_proof_image_url?: string | null;
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
        duration_minutes_snapshot: number;
        position: number;
    }>;
    payment: ResolvedAdminPayment;
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

function parseClientPhone(clientPhone?: string | null): {
    phonePrefix: string | null;
    phoneNumber: string | null;
} {
    const raw = (clientPhone || '').trim();
    if (!raw) {
        return { phonePrefix: null, phoneNumber: null };
    }

    const parts = raw.split(/\s+/);
    if (parts.length > 1 && /^\+\d+$/.test(parts[0])) {
        return {
            phonePrefix: parts[0],
            phoneNumber: parts.slice(1).join(' ') || null,
        };
    }

    return {
        phonePrefix: null,
        phoneNumber: raw,
    };
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

    const { phonePrefix, phoneNumber } = parseClientPhone(input.client_phone);

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

    const totalDuration = services.reduce((sum, service) => sum + service.duration_minutes, 0);
    const totalPrice = services.reduce((sum, service) => sum + service.price_cents, 0);
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
            serviceSnapshots: services.map((service, index) => ({
                service_id: service.id,
                service_name_snapshot: service.name,
                price_cents_snapshot: service.price_cents,
                duration_minutes_snapshot: service.duration_minutes,
                position: index,
            })),
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

            const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0);
            const totalPrice = services.reduce((sum, s) => sum + s.price_cents, 0);

            // Use new start_at if provided, otherwise use existing
            const baseStartAt = updates.start_at
                ? parseDateTimeInTimeZone(updates.start_at, timeZone)
                : existingBooking.start_at;
            const endAt = new Date(baseStartAt.getTime() + totalDuration * 60 * 1000);

            const serviceSnapshots = services.map((service, index) => ({
                service_id: service.id,
                service_name_snapshot: service.name,
                price_cents_snapshot: service.price_cents,
                duration_minutes_snapshot: service.duration_minutes,
                position: index,
            }));

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
        customer_id?: number;
        client_name?: string;
        client_phone?: string;
        client_email?: string;
        notes?: string;
        is_paid?: boolean;
        payment_method?: PaymentMethod;
        qr_proof_image_url?: string | null;
    },
    createdByUserId: string
): Promise<AdminBookingResult> {
    try {
        if (!data.staff_id || !data.service_ids || data.service_ids.length === 0 || !data.start_at) {
            return {
                code: 400,
                message: 'staff_id, service_ids, and start_at are required',
                error: true,
            };
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

        const customerResult = await resolveAdminCustomer(data.companyId, {
            customer_id: data.customer_id,
            client_name: data.client_name,
            client_phone: data.client_phone,
            client_email: data.client_email,
        });
        if ('error' in customerResult) {
            return customerResult;
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
        client_phone?: string;
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
            client_phone: data.client_phone,
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
