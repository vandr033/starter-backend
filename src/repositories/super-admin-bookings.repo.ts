import { prisma } from '../prisma/client';
import { BookingStatus, PaymentStatus } from '@prisma/client';

interface GetAllBookingsOptions {
    shopId?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    paymentStatus?: string;
    page: number;
    limit: number;
}

export async function getAllBookings(options: GetAllBookingsOptions) {
    const { shopId, startDate, endDate, status, paymentStatus, page, limit } = options;
    const skip = (page - 1) * limit;

    const where: any = { deleted_at: null };

    if (shopId) where.company_id = shopId;
    if (status && Object.values(BookingStatus).includes(status as BookingStatus)) {
        where.status = status;
    }
    if (paymentStatus && Object.values(PaymentStatus).includes(paymentStatus as PaymentStatus)) {
        where.payment_status = paymentStatus;
    }
    if (startDate || endDate) {
        where.start_at = {};
        if (startDate) where.start_at.gte = new Date(startDate);
        if (endDate) where.start_at.lte = new Date(endDate);
    }

    const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
            where,
            skip,
            take: limit,
            orderBy: { start_at: 'desc' },
            include: {
                company: { select: { id: true, name: true, slug: true } },
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
        prisma.booking.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
        bookings: bookings.map((b) => ({
            id: b.id,
            shopName: b.company.name,
            shopId: b.company.id,
            clientName: b.customer?.user?.name || b.client_name || 'Guest',
            clientEmail: b.customer?.user?.email || b.client_email || null,
            clientPhone: b.customer?.user?.phoneNumber || b.client_phone_number || null,
            clientPhonePrefix: b.customer?.user?.phone_prefix || b.client_phone_prefix || null,
            startAt: b.start_at.toISOString(),
            endAt: b.end_at.toISOString(),
            status: b.status,
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

export async function getTodayBookingsCount() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    return prisma.booking.count({
        where: {
            deleted_at: null,
            start_at: { gte: todayStart, lte: todayEnd },
            status: { not: BookingStatus.CANCELLED },
        },
    });
}
