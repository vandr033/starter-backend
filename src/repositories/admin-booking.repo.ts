import { prisma } from '../prisma/client';
import { BookingSource, BookingStatus, PaymentStatus, PaymentMethod, BookingType } from '@prisma/client';

/**
 * Get bookings with filters
 */
export async function getBookingsWithFilters(params: {
    companyId: number;
    startDate?: Date;
    endDate?: Date;
    status?: BookingStatus;
    staffId?: number;
}) {
    const { companyId, startDate, endDate, status, staffId } = params;

    const where: any = {
        company_id: companyId,
        deleted_at: null,
    };

    if (startDate) {
        where.start_at = { ...where.start_at, gte: startDate };
    }
    if (endDate) {
        where.end_at = { ...where.end_at, lte: endDate };
    }
    if (status) {
        where.status = status;
    }
    if (staffId) {
        where.staff_id = staffId;
    }

    const bookings = await prisma.booking.findMany({
        where,
        orderBy: { start_at: 'desc' },
        select: {
            id: true,
            company_id: true,
            staff_id: true,
            customer_id: true,
            client_name: true,
            client_email: true,
            client_phone_prefix: true,
            client_phone_number: true,
            booking_type: true,
            start_at: true,
            end_at: true,
            status: true,
            payment_method: true,
            payment_status: true,
            qr_proof_image_url: true,
            total_price_cents: true,
            notes: true,
            created_at: true,
            updated_at: true,
            staff: {
                select: {
                    id: true,
                    display_name: true,
                },
            },
            customer: {
                select: {
                    id: true,
                    user: {
                        select: {
                            email: true,
                            name: true,
                            first_name: true,
                            last_name: true,
                            phoneNumber: true,
                        },
                    },
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
                orderBy: {
                    position: 'asc',
                },
            },
        },
    });

    return bookings;
}

/**
 * Get booking by ID with full details
 */
export async function getBookingById(bookingId: number, companyId: number) {
    return prisma.booking.findFirst({
        where: {
            id: bookingId,
            company_id: companyId,
            deleted_at: null,
        },
        select: {
            id: true,
            company_id: true,
            staff_id: true,
            customer_id: true,
            client_name: true,
            client_email: true,
            client_phone_prefix: true,
            client_phone_number: true,
            booking_type: true,
            start_at: true,
            end_at: true,
            status: true,
            payment_method: true,
            payment_status: true,
            qr_proof_image_url: true,
            total_price_cents: true,
            notes: true,
            created_at: true,
            updated_at: true,
            staff: {
                select: {
                    id: true,
                    display_name: true,
                },
            },
            customer: {
                select: {
                    id: true,
                    user: {
                        select: {
                            email: true,
                            name: true,
                            first_name: true,
                            last_name: true,
                            phoneNumber: true,
                        },
                    },
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
                orderBy: {
                    position: 'asc',
                },
            },
        },
    });
}

/**
 * Update booking status
 */
export async function updateBookingStatus(
    bookingId: number,
    companyId: number,
    status: BookingStatus,
    updatedByUserId: string
) {
    return prisma.booking.updateMany({
        where: {
            id: bookingId,
            company_id: companyId,
            deleted_at: null,
        },
        data: {
            status,
            updated_by_user_id: updatedByUserId,
        },
    });
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(
    bookingId: number,
    companyId: number,
    paymentStatus: PaymentStatus,
    updatedByUserId: string,
    paymentMethod?: PaymentMethod,
    rejectionReason?: string | null
) {
    return prisma.booking.updateMany({
        where: {
            id: bookingId,
            company_id: companyId,
            deleted_at: null,
        },
        data: {
            payment_status: paymentStatus,
            ...(paymentMethod && { payment_method: paymentMethod }),
            ...(rejectionReason !== undefined && { rejection_reason: rejectionReason }),
            updated_by_user_id: updatedByUserId,
        },
    });
}

/**
 * Get count of bookings with PENDING_CONFIRMATION payment status
 */
export async function getPendingPaymentsCount(companyId: number) {
    return prisma.booking.count({
        where: {
            company_id: companyId,
            deleted_at: null,
            payment_status: PaymentStatus.PENDING_CONFIRMATION,
        },
    });
}

/**
 * Get bookings with payment info for the payments page
 */
export async function getBookingsWithPaymentInfo(
    companyId: number,
    options: {
        paymentStatus?: PaymentStatus;
        page: number;
        limit: number;
    }
) {
    const { paymentStatus, page, limit } = options;
    const skip = (page - 1) * limit;

    const where: any = {
        company_id: companyId,
        deleted_at: null,
        payment_method: { not: 'NONE' as any },
    };

    if (paymentStatus) {
        where.payment_status = paymentStatus;
    }

    const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
            where,
            skip,
            take: limit,
            orderBy: { created_at: 'desc' },
            include: {
                staff: { select: { id: true, display_name: true } },
                booking_services: {
                    include: {
                        service: { select: { id: true, name: true, duration_minutes: true } },
                    },
                },
                customer: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                phoneNumber: true,
                                phone_prefix: true,
                            },
                        },
                    },
                },
            },
        }),
        prisma.booking.count({ where }),
    ]);

    return { bookings, total, totalPages: Math.ceil(total / limit) };
}

/**
 * Reschedule booking (update dates)
 */
export async function rescheduleBooking(
    bookingId: number,
    companyId: number,
    startAt: Date,
    endAt: Date,
    updatedByUserId: string
) {
    return prisma.booking.updateMany({
        where: {
            id: bookingId,
            company_id: companyId,
            deleted_at: null,
        },
        data: {
            start_at: startAt,
            end_at: endAt,
            updated_by_user_id: updatedByUserId,
        },
    });
}

/**
 * Update booking notes
 */
export async function updateBookingNotes(
    bookingId: number,
    companyId: number,
    notes: string | null,
    updatedByUserId: string
) {
    return prisma.booking.updateMany({
        where: {
            id: bookingId,
            company_id: companyId,
            deleted_at: null,
        },
        data: {
            notes,
            updated_by_user_id: updatedByUserId,
        },
    });
}

/**
 * Create a walk-in booking (no customer)
 */
export interface CreateWalkInData {
    company_id: number;
    staff_id: number;
    client_name: string;
    client_phone_prefix?: string;
    client_phone_number?: string;
    client_email?: string;
    start_at: Date;
    end_at: Date;
    notes?: string;
    created_by_user_id: string;
    total_price_cents: number;
    payment_method?: PaymentMethod;
    booking_source?: BookingSource;
}

export async function createWalkInBooking(
    bookingData: CreateWalkInData,
    services: Array<{
        service_id: number;
        service_name_snapshot: string;
        price_cents_snapshot: number;
        duration_minutes_snapshot: number;
        position: number;
    }>
) {
    return prisma.$transaction(async (tx) => {
        // Create the booking
        const booking = await tx.booking.create({
            data: {
                company_id: bookingData.company_id,
                staff_id: bookingData.staff_id,
                customer_id: null, // Walk-in has no customer
                client_name: bookingData.client_name,
                client_phone_prefix: bookingData.client_phone_prefix,
                client_phone_number: bookingData.client_phone_number,
                client_email: bookingData.client_email,
                start_at: bookingData.start_at,
                end_at: bookingData.end_at,
                status: BookingStatus.CONFIRMED,
                payment_method: bookingData.payment_method || PaymentMethod.NONE,
                payment_status: bookingData.payment_method === PaymentMethod.NONE ? PaymentStatus.UNPAID : PaymentStatus.PENDING_CONFIRMATION,
                notes: bookingData.notes,
                created_by_user_id: bookingData.created_by_user_id,
                total_price_cents: bookingData.total_price_cents,
                booking_type: BookingType.CUSTOMER,
                booking_source: bookingData.booking_source ?? BookingSource.ADMIN,
            },
        });

        // Create booking services
        if (services.length > 0) {
            await tx.bookingService.createMany({
                data: services.map((s) => ({
                    booking_id: booking.id,
                    company_id: bookingData.company_id,
                    service_id: s.service_id,
                    service_name_snapshot: s.service_name_snapshot,
                    price_cents_snapshot: s.price_cents_snapshot,
                    duration_minutes_snapshot: s.duration_minutes_snapshot,
                    position: s.position,
                })),
            });
        }

        // Return booking with services
        return tx.booking.findUnique({
            where: { id: booking.id },
            include: {
                booking_services: {
                    include: {
                        service: true,
                    },
                },
                staff: {
                    select: { id: true, display_name: true },
                },
            },
        });
    });
}

/**
 * Update booking staff
 */
export async function updateBookingStaff(
    bookingId: number,
    companyId: number,
    staffId: number,
    updatedByUserId: string
) {
    return prisma.booking.updateMany({
        where: {
            id: bookingId,
            company_id: companyId,
            deleted_at: null,
        },
        data: {
            staff_id: staffId,
            updated_by_user_id: updatedByUserId,
        },
    });
}

/**
 * Replace booking services (in a transaction)
 */
export async function replaceBookingServices(
    bookingId: number,
    companyId: number,
    services: Array<{
        service_id: number;
        service_name_snapshot: string;
        price_cents_snapshot: number;
        duration_minutes_snapshot: number;
        position: number;
    }>,
    totalPriceCents: number,
    endAt: Date,
    updatedByUserId: string
) {
    return prisma.$transaction(async (tx) => {
        // Delete existing booking services
        await tx.bookingService.deleteMany({
            where: { booking_id: bookingId, company_id: companyId },
        });

        // Create new booking services
        await tx.bookingService.createMany({
            data: services.map((s) => ({
                booking_id: bookingId,
                company_id: companyId,
                service_id: s.service_id,
                service_name_snapshot: s.service_name_snapshot,
                price_cents_snapshot: s.price_cents_snapshot,
                duration_minutes_snapshot: s.duration_minutes_snapshot,
                position: s.position,
            })),
        });

        // Update booking total price and end_at
        await tx.booking.updateMany({
            where: { id: bookingId, company_id: companyId, deleted_at: null },
            data: {
                total_price_cents: totalPriceCents,
                end_at: endAt,
                updated_by_user_id: updatedByUserId,
            },
        });
    });
}

/**
 * Create booking for existing customer
 */
export interface CreateCustomerBookingData {
    company_id: number;
    staff_id: number;
    customer_id: number;
    start_at: Date;
    end_at: Date;
    notes?: string;
    created_by_user_id: string;
    total_price_cents: number;
    payment_method?: PaymentMethod;
    booking_source?: BookingSource;
}

export async function createCustomerBooking(
    bookingData: CreateCustomerBookingData,
    services: Array<{
        service_id: number;
        service_name_snapshot: string;
        price_cents_snapshot: number;
        duration_minutes_snapshot: number;
        position: number;
    }>
) {
    return prisma.$transaction(async (tx) => {
        // Create the booking
        const booking = await tx.booking.create({
            data: {
                company_id: bookingData.company_id,
                staff_id: bookingData.staff_id,
                customer_id: bookingData.customer_id,
                start_at: bookingData.start_at,
                end_at: bookingData.end_at,
                status: BookingStatus.CONFIRMED,
                payment_method: bookingData.payment_method || PaymentMethod.NONE,
                payment_status: bookingData.payment_method === PaymentMethod.NONE ? PaymentStatus.UNPAID : PaymentStatus.PENDING_CONFIRMATION,
                notes: bookingData.notes,
                created_by_user_id: bookingData.created_by_user_id,
                total_price_cents: bookingData.total_price_cents,
                booking_type: BookingType.CUSTOMER,
                booking_source: bookingData.booking_source ?? BookingSource.ADMIN,
            },
        });

        // Create booking services
        if (services.length > 0) {
            await tx.bookingService.createMany({
                data: services.map((s) => ({
                    booking_id: booking.id,
                    company_id: bookingData.company_id,
                    service_id: s.service_id,
                    service_name_snapshot: s.service_name_snapshot,
                    price_cents_snapshot: s.price_cents_snapshot,
                    duration_minutes_snapshot: s.duration_minutes_snapshot,
                    position: s.position,
                })),
            });
        }

        // Return booking with services
        return tx.booking.findUnique({
            where: { id: booking.id },
            include: {
                booking_services: {
                    include: {
                        service: true,
                    },
                },
                staff: {
                    select: { id: true, display_name: true },
                },
                customer: {
                    select: {
                        id: true,
                        user: {
                            select: {
                                email: true,
                            },
                        },
                    },
                },
            },
        });
    });
}
