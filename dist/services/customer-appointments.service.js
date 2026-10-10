"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerBookings = getCustomerBookings;
exports.cancelBooking = cancelBooking;
exports.modifyBooking = modifyBooking;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const bookingNotifications_1 = require("../utils/bookingNotifications");
const booking_status_1 = require("../utils/booking-status");
const REVIEW_DELAY_MS = 12 * 60 * 60 * 1000;
const bookingInclude = {
    company: {
        select: {
            id: true,
            name: true,
            slug: true,
            logo_url: true,
            timezone: true,
            currency: true,
        },
    },
    staff: {
        select: {
            id: true,
            display_name: true,
            image_url: true,
        },
    },
    booking_services: {
        include: {
            service: {
                select: {
                    id: true,
                    name: true,
                    price_cents: true,
                    duration_minutes: true,
                },
            },
        },
    },
    booking_review: {
        select: {
            id: true,
        },
    },
};
async function getCustomerBookings(userId) {
    try {
        const bookings = await client_1.prisma.booking.findMany({
            where: {
                deleted_at: null,
                OR: [
                    { created_by_user_id: userId },
                    { customer: { is: { user_id: userId } } },
                ],
            },
            include: {
                ...bookingInclude,
                company: {
                    select: {
                        ...bookingInclude.company.select,
                        company_settings: {
                            select: {
                                cancel_limit_minutes: true,
                                reschedule_limit_minutes: true,
                            },
                        },
                    },
                },
            },
            orderBy: { start_at: "desc" },
        });
        const now = new Date();
        const enriched = bookings.map((b) => {
            const startAt = new Date(b.start_at);
            const minutesUntilStart = (startAt.getTime() - now.getTime()) / 60000;
            const settings = b.company.company_settings;
            const cancelLimit = settings?.cancel_limit_minutes ?? 120;
            const rescheduleLimit = settings?.reschedule_limit_minutes ?? 120;
            const lifecycleStatus = (0, booking_status_1.getBookingLifecycleStatus)(b.status, b.notes);
            const hasReview = Boolean(b.booking_review?.id);
            const isPast = lifecycleStatus === client_2.BookingStatus.COMPLETED ||
                lifecycleStatus === client_2.BookingStatus.NO_SHOW ||
                startAt < now;
            const eligibleReviewAt = lifecycleStatus === client_2.BookingStatus.COMPLETED
                ? new Date(b.updated_at).getTime() + REVIEW_DELAY_MS
                : new Date(b.end_at).getTime() + REVIEW_DELAY_MS;
            const canReview = !hasReview &&
                lifecycleStatus !== client_2.BookingStatus.CANCELLED &&
                lifecycleStatus !== client_2.BookingStatus.NO_SHOW &&
                Date.now() >= eligibleReviewAt;
            const canCancel = !isPast &&
                !(0, booking_status_1.isTerminalBookingStatus)(b.status, b.notes) &&
                minutesUntilStart > cancelLimit;
            const canModify = !isPast &&
                !(0, booking_status_1.isTerminalBookingStatus)(b.status, b.notes) &&
                minutesUntilStart > rescheduleLimit;
            return {
                id: b.id,
                company: {
                    id: b.company.id,
                    name: b.company.name,
                    slug: b.company.slug,
                    logo_url: b.company.logo_url,
                    currency: b.company.currency,
                },
                staff: b.staff,
                services: b.booking_services.map((bs) => ({
                    id: bs.service_id,
                    name: bs.service_name_snapshot,
                    price_cents: bs.price_cents_snapshot,
                    duration_minutes: bs.duration_minutes_snapshot,
                })),
                start_at: b.start_at,
                end_at: b.end_at,
                status: lifecycleStatus,
                payment_method: b.payment_method,
                payment_status: b.payment_status,
                total_price_cents: b.total_price_cents,
                notes: b.notes,
                isPast,
                canCancel,
                canModify,
                cancelLimitMinutes: cancelLimit,
                rescheduleLimitMinutes: rescheduleLimit,
                hasReview,
                canReview,
            };
        });
        const upcoming = enriched.filter((b) => !b.isPast);
        const past = enriched.filter((b) => b.isPast);
        return {
            code: 200,
            message: "Bookings loaded",
            error: false,
            data: { upcoming, past },
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error loading bookings",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
async function cancelBooking(bookingId, userId) {
    try {
        const booking = await client_1.prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                company: {
                    include: { company_settings: true },
                },
                customer: {
                    select: { user_id: true },
                },
            },
        });
        if (!booking || (booking.created_by_user_id !== userId && booking.customer?.user_id !== userId)) {
            return { code: 404, message: "Booking not found", error: true };
        }
        if ((0, booking_status_1.getBookingLifecycleStatus)(booking.status, booking.notes) === client_2.BookingStatus.CANCELLED) {
            return { code: 400, message: "Booking is already cancelled", error: true };
        }
        if (booking.status === client_2.BookingStatus.COMPLETED) {
            return { code: 400, message: "Cannot cancel a completed booking", error: true };
        }
        if ((0, booking_status_1.getBookingLifecycleStatus)(booking.status, booking.notes) === client_2.BookingStatus.NO_SHOW) {
            return { code: 400, message: "Cannot cancel a no-show booking", error: true };
        }
        const now = new Date();
        const startAt = new Date(booking.start_at);
        const minutesUntilStart = (startAt.getTime() - now.getTime()) / 60000;
        const cancelLimit = booking.company.company_settings?.cancel_limit_minutes ?? 120;
        if (minutesUntilStart <= cancelLimit) {
            return {
                code: 400,
                message: `Cannot cancel — within the ${cancelLimit}-minute cancellation window`,
                error: true,
            };
        }
        const cancelledBooking = await client_1.prisma.booking.update({
            where: { id: bookingId },
            data: {
                status: client_2.BookingStatus.CANCELLED,
                updated_by_user_id: userId,
            },
            include: {
                company: { select: { name: true } },
                staff: { select: { display_name: true } },
                booking_services: { select: { service_name_snapshot: true } },
            },
        });
        // Send cancellation notification (fire-and-forget)
        const user = await client_1.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, phoneNumber: true, phone_prefix: true } });
        void (0, bookingNotifications_1.notifyBookingCancelled)({
            companyId: booking.company_id,
            bookingId,
            customerEmail: user?.email || booking.client_email,
            customerPhone: user?.phoneNumber || booking.client_phone_number,
            customerPhonePrefix: user?.phone_prefix || booking.client_phone_prefix,
            customerName: user?.name || booking.client_name,
            companyName: cancelledBooking.company.name,
            staffName: cancelledBooking.staff?.display_name || '',
            serviceNames: cancelledBooking.booking_services.map(bs => bs.service_name_snapshot),
            startAt: booking.start_at,
            endAt: booking.end_at,
            totalPriceCents: booking.total_price_cents || 0,
        });
        return {
            code: 200,
            message: "Booking cancelled successfully",
            error: false,
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error cancelling booking",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
async function modifyBooking(bookingId, userId, data) {
    try {
        const booking = await client_1.prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                company: {
                    include: { company_settings: true },
                },
                customer: {
                    select: { user_id: true },
                },
                booking_services: true,
            },
        });
        if (!booking || (booking.created_by_user_id !== userId && booking.customer?.user_id !== userId)) {
            return { code: 404, message: "Booking not found", error: true };
        }
        if ((0, booking_status_1.isTerminalBookingStatus)(booking.status, booking.notes)) {
            return { code: 400, message: "Cannot modify this booking", error: true };
        }
        const now = new Date();
        const startAt = new Date(booking.start_at);
        const minutesUntilStart = (startAt.getTime() - now.getTime()) / 60000;
        const rescheduleLimit = booking.company.company_settings?.reschedule_limit_minutes ?? 120;
        if (minutesUntilStart <= rescheduleLimit) {
            return {
                code: 400,
                message: `Cannot modify — within the ${rescheduleLimit}-minute modification window`,
                error: true,
            };
        }
        // Calculate new end_at if start_at is changing
        const updateData = {
            updated_by_user_id: userId,
        };
        if (data.staff_id) {
            updateData.staff_id = data.staff_id;
        }
        if (data.start_at) {
            const newStart = new Date(data.start_at);
            // Calculate total duration from booking services
            const totalDuration = booking.booking_services.reduce((sum, bs) => sum + bs.duration_minutes_snapshot, 0);
            const newEnd = new Date(newStart.getTime() + totalDuration * 60000);
            updateData.start_at = newStart;
            updateData.end_at = newEnd;
        }
        const updated = await client_1.prisma.booking.update({
            where: { id: bookingId },
            data: updateData,
            include: bookingInclude,
        });
        // Send update notification (fire-and-forget)
        const user = await client_1.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, phoneNumber: true, phone_prefix: true } });
        void (0, bookingNotifications_1.notifyBookingUpdated)({
            companyId: booking.company_id,
            bookingId,
            customerEmail: user?.email || booking.client_email,
            customerPhone: user?.phoneNumber || booking.client_phone_number,
            customerPhonePrefix: user?.phone_prefix || booking.client_phone_prefix,
            customerName: user?.name || booking.client_name,
            companyName: updated.company.name,
            staffName: updated.staff?.display_name || '',
            serviceNames: updated.booking_services.map((bs) => bs.service_name_snapshot || bs.service?.name || ''),
            startAt: updated.start_at,
            endAt: updated.end_at,
            totalPriceCents: updated.total_price_cents || 0,
        });
        return {
            code: 200,
            message: "Booking modified successfully",
            error: false,
            // Keep admin-only notes out of the customer response.
            data: { booking: { ...updated, internal_notes: undefined } },
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error modifying booking",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
