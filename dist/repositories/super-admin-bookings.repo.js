"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllBookings = getAllBookings;
exports.getTodayBookingsCount = getTodayBookingsCount;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const booking_status_1 = require("../utils/booking-status");
async function getAllBookings(options) {
    const { shopId, startDate, endDate, status, paymentStatus, page, limit } = options;
    const skip = (page - 1) * limit;
    const where = { deleted_at: null };
    if (shopId)
        where.company_id = shopId;
    if (status && Object.values(client_2.BookingStatus).includes(status)) {
        if (status === client_2.BookingStatus.NO_SHOW) {
            where.OR = [
                { status: client_2.BookingStatus.NO_SHOW },
                { status: client_2.BookingStatus.CANCELLED, notes: { contains: booking_status_1.LEGACY_NO_SHOW_NOTE_MARKER } },
            ];
        }
        else if (status === client_2.BookingStatus.CANCELLED) {
            where.status = client_2.BookingStatus.CANCELLED;
            where.NOT = { notes: { contains: booking_status_1.LEGACY_NO_SHOW_NOTE_MARKER } };
        }
        else {
            where.status = status;
        }
    }
    if (paymentStatus && Object.values(client_2.PaymentStatus).includes(paymentStatus)) {
        where.payment_status = paymentStatus;
    }
    if (startDate || endDate) {
        where.start_at = {};
        if (startDate)
            where.start_at.gte = new Date(startDate);
        if (endDate)
            where.start_at.lte = new Date(endDate);
    }
    const [bookings, total] = await Promise.all([
        client_1.prisma.booking.findMany({
            where,
            skip,
            take: limit,
            orderBy: { start_at: 'desc' },
            include: {
                company: { select: { id: true, name: true, slug: true, currency: true } },
                staff: { select: { id: true, display_name: true } },
                booking_services: {
                    include: {
                        service: { select: { id: true, name: true, duration_minutes: true } },
                    },
                },
                customer: {
                    include: {
                        user: { select: { id: true, name: true, email: true, phoneNumber: true, phone_prefix: true } },
                    },
                },
            },
        }),
        client_1.prisma.booking.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
        bookings: bookings.map((b) => ({
            id: b.id,
            shopName: b.company.name,
            shopId: b.company.id,
            currency: b.company.currency,
            clientName: b.customer?.user?.name || b.client_name || 'Guest',
            clientEmail: b.customer?.user?.email || b.client_email || null,
            clientPhone: b.customer?.user?.phoneNumber || b.client_phone_number || null,
            clientPhonePrefix: b.customer?.user?.phone_prefix || b.client_phone_prefix || null,
            startAt: b.start_at.toISOString(),
            endAt: b.end_at.toISOString(),
            status: (0, booking_status_1.getBookingLifecycleStatus)(b.status, b.notes),
            paymentStatus: b.payment_status,
            paymentMethod: b.payment_method,
            totalPriceCents: b.total_price_cents,
            staffName: b.staff?.display_name || 'Unknown',
            staffId: b.staff_id,
            services: b.booking_services.map((bs) => ({
                id: bs.service.id,
                name: bs.service.name,
                duration: bs.service.duration_minutes,
            })),
            notes: b.notes,
            qrProofImageUrl: b.qr_proof_image_url,
            bookingType: b.booking_type,
            createdAt: b.created_at.toISOString(),
        })),
        pagination: { total, page, limit, totalPages },
    };
}
async function getTodayBookingsCount() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    return client_1.prisma.booking.count({
        where: {
            deleted_at: null,
            start_at: { gte: todayStart, lte: todayEnd },
            status: { notIn: [...booking_status_1.INACTIVE_BOOKING_STATUSES] },
        },
    });
}
