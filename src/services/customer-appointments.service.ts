import { prisma } from "../prisma/client";
import { MensajeApi } from "../types/MensajeApi";
import { BookingStatus } from "@prisma/client";
import { notifyBookingCancelled, notifyBookingUpdated } from "../utils/bookingNotifications";

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
};

export async function getCustomerBookings(userId: string): Promise<MensajeApi> {
    try {
        const bookings = await prisma.booking.findMany({
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
            const isPast = startAt < now;
            const minutesUntilStart = (startAt.getTime() - now.getTime()) / 60_000;
            const settings = (b.company as any).company_settings;
            const cancelLimit = settings?.cancel_limit_minutes ?? 120;
            const rescheduleLimit = settings?.reschedule_limit_minutes ?? 120;

            const canCancel =
                !isPast &&
                b.status !== BookingStatus.CANCELLED &&
                b.status !== BookingStatus.COMPLETED &&
                minutesUntilStart > cancelLimit;

            const canModify =
                !isPast &&
                b.status !== BookingStatus.CANCELLED &&
                b.status !== BookingStatus.COMPLETED &&
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
                status: b.status,
                payment_method: b.payment_method,
                payment_status: b.payment_status,
                total_price_cents: b.total_price_cents,
                notes: b.notes,
                isPast,
                canCancel,
                canModify,
                cancelLimitMinutes: cancelLimit,
                rescheduleLimitMinutes: rescheduleLimit,
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
    } catch (error: any) {
        return {
            code: 500,
            message: "Error loading bookings",
            error: true,
            technicalMessage: error?.message,
        };
    }
}

export async function cancelBooking(
    bookingId: number,
    userId: string
): Promise<MensajeApi> {
    try {
        const booking = await prisma.booking.findUnique({
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

        if (booking.status === BookingStatus.CANCELLED) {
            return { code: 400, message: "Booking is already cancelled", error: true };
        }

        if (booking.status === BookingStatus.COMPLETED) {
            return { code: 400, message: "Cannot cancel a completed booking", error: true };
        }

        const now = new Date();
        const startAt = new Date(booking.start_at);
        const minutesUntilStart = (startAt.getTime() - now.getTime()) / 60_000;
        const cancelLimit = booking.company.company_settings?.cancel_limit_minutes ?? 120;

        if (minutesUntilStart <= cancelLimit) {
            return {
                code: 400,
                message: `Cannot cancel — within the ${cancelLimit}-minute cancellation window`,
                error: true,
            };
        }

        const cancelledBooking = await prisma.booking.update({
            where: { id: bookingId },
            data: {
                status: BookingStatus.CANCELLED,
                updated_by_user_id: userId,
            },
            include: {
                company: { select: { name: true } },
                staff: { select: { display_name: true } },
                booking_services: { select: { service_name_snapshot: true } },
            },
        });

        // Send cancellation notification (fire-and-forget)
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, phoneNumber: true, phone_prefix: true } });
        void notifyBookingCancelled({
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
    } catch (error: any) {
        return {
            code: 500,
            message: "Error cancelling booking",
            error: true,
            technicalMessage: error?.message,
        };
    }
}

export async function modifyBooking(
    bookingId: number,
    userId: string,
    data: { staff_id?: number; start_at?: string }
): Promise<MensajeApi> {
    try {
        const booking = await prisma.booking.findUnique({
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

        if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.COMPLETED) {
            return { code: 400, message: "Cannot modify this booking", error: true };
        }

        const now = new Date();
        const startAt = new Date(booking.start_at);
        const minutesUntilStart = (startAt.getTime() - now.getTime()) / 60_000;
        const rescheduleLimit = booking.company.company_settings?.reschedule_limit_minutes ?? 120;

        if (minutesUntilStart <= rescheduleLimit) {
            return {
                code: 400,
                message: `Cannot modify — within the ${rescheduleLimit}-minute modification window`,
                error: true,
            };
        }

        // Calculate new end_at if start_at is changing
        const updateData: any = {
            updated_by_user_id: userId,
        };

        if (data.staff_id) {
            updateData.staff_id = data.staff_id;
        }

        if (data.start_at) {
            const newStart = new Date(data.start_at);
            // Calculate total duration from booking services
            const totalDuration = booking.booking_services.reduce(
                (sum, bs) => sum + bs.duration_minutes_snapshot,
                0
            );
            const newEnd = new Date(newStart.getTime() + totalDuration * 60_000);

            updateData.start_at = newStart;
            updateData.end_at = newEnd;
        }

        const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: updateData,
            include: bookingInclude,
        });

        // Send update notification (fire-and-forget)
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, phoneNumber: true, phone_prefix: true } });
        void notifyBookingUpdated({
            companyId: booking.company_id,
            bookingId,
            customerEmail: user?.email || booking.client_email,
            customerPhone: user?.phoneNumber || booking.client_phone_number,
            customerPhonePrefix: user?.phone_prefix || booking.client_phone_prefix,
            customerName: user?.name || booking.client_name,
            companyName: updated.company.name,
            staffName: updated.staff?.display_name || '',
            serviceNames: updated.booking_services.map((bs: any) => bs.service_name_snapshot || bs.service?.name || ''),
            startAt: updated.start_at,
            endAt: updated.end_at,
            totalPriceCents: updated.total_price_cents || 0,
        });

        return {
            code: 200,
            message: "Booking modified successfully",
            error: false,
            data: { booking: updated },
        };
    } catch (error: any) {
        return {
            code: 500,
            message: "Error modifying booking",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
