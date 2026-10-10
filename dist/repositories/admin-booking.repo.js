"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookingsWithFilters = getBookingsWithFilters;
exports.getBookingById = getBookingById;
exports.updateBookingStatus = updateBookingStatus;
exports.updatePaymentStatus = updatePaymentStatus;
exports.getPendingPaymentsCount = getPendingPaymentsCount;
exports.getBookingsWithPaymentInfo = getBookingsWithPaymentInfo;
exports.rescheduleBooking = rescheduleBooking;
exports.updateBookingNotes = updateBookingNotes;
exports.updateBookingInternalNotes = updateBookingInternalNotes;
exports.createWalkInBooking = createWalkInBooking;
exports.updateBookingStaff = updateBookingStaff;
exports.replaceBookingServices = replaceBookingServices;
exports.createCustomerBooking = createCustomerBooking;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const booking_status_1 = require("../utils/booking-status");
/**
 * Get bookings with filters
 */
async function getBookingsWithFilters(params) {
    const { companyId, startDate, endDate, status, staffId } = params;
    const where = {
        company_id: companyId,
        deleted_at: null,
    };
    if (startDate && endDate) {
        where.start_at = { lt: endDate };
        where.end_at = { gt: startDate };
    }
    else if (startDate) {
        where.end_at = { gt: startDate };
    }
    else if (endDate) {
        where.start_at = { lt: endDate };
    }
    if (status) {
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
    if (staffId) {
        where.staff_id = staffId;
    }
    const bookings = await client_1.prisma.booking.findMany({
        where,
        orderBy: { start_at: 'desc' },
        select: {
            id: true,
            company_id: true,
            staff_id: true,
            secondary_staff_id: true,
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
            internal_notes: true,
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
                            phone_prefix: true,
                            emailVerified: true,
                            phoneNumberVerified: true,
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
async function getBookingById(bookingId, companyId) {
    return client_1.prisma.booking.findFirst({
        where: {
            id: bookingId,
            company_id: companyId,
            deleted_at: null,
        },
        select: {
            id: true,
            company_id: true,
            staff_id: true,
            secondary_staff_id: true,
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
            internal_notes: true,
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
                            phone_prefix: true,
                            emailVerified: true,
                            phoneNumberVerified: true,
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
async function updateBookingStatus(bookingId, companyId, status, updatedByUserId) {
    return client_1.prisma.booking.updateMany({
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
async function updatePaymentStatus(bookingId, companyId, paymentStatus, updatedByUserId, paymentMethod, rejectionReason) {
    return client_1.prisma.booking.updateMany({
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
async function getPendingPaymentsCount(companyId) {
    return client_1.prisma.booking.count({
        where: {
            company_id: companyId,
            deleted_at: null,
            payment_status: client_2.PaymentStatus.PENDING_CONFIRMATION,
        },
    });
}
/**
 * Get bookings with payment info for the payments page
 */
async function getBookingsWithPaymentInfo(companyId, options) {
    const { paymentStatus, page, limit } = options;
    const skip = (page - 1) * limit;
    const where = {
        company_id: companyId,
        deleted_at: null,
        payment_method: { not: 'NONE' },
    };
    if (paymentStatus) {
        where.payment_status = paymentStatus;
    }
    const [bookings, total] = await Promise.all([
        client_1.prisma.booking.findMany({
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
        client_1.prisma.booking.count({ where }),
    ]);
    return { bookings, total, totalPages: Math.ceil(total / limit) };
}
/**
 * Reschedule booking (update dates)
 */
async function rescheduleBooking(bookingId, companyId, startAt, endAt, updatedByUserId) {
    return client_1.prisma.booking.updateMany({
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
async function updateBookingNotes(bookingId, companyId, notes, updatedByUserId) {
    return client_1.prisma.booking.updateMany({
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
 * Update internal booking notes (visible only in admin responses).
 */
async function updateBookingInternalNotes(bookingId, companyId, internalNotes, updatedByUserId) {
    return client_1.prisma.booking.updateMany({
        where: {
            id: bookingId,
            company_id: companyId,
            deleted_at: null,
        },
        data: {
            internal_notes: internalNotes,
            updated_by_user_id: updatedByUserId,
        },
    });
}
async function createWalkInBooking(bookingData, services) {
    return client_1.prisma.$transaction(async (tx) => {
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
                status: client_2.BookingStatus.CONFIRMED,
                payment_method: bookingData.payment_method || client_2.PaymentMethod.NONE,
                payment_status: bookingData.payment_status
                    || (bookingData.payment_method === client_2.PaymentMethod.NONE
                        ? client_2.PaymentStatus.UNPAID
                        : client_2.PaymentStatus.PENDING_CONFIRMATION),
                qr_proof_image_url: bookingData.qr_proof_image_url ?? null,
                notes: bookingData.notes,
                internal_notes: bookingData.internal_notes,
                created_by_user_id: bookingData.created_by_user_id,
                total_price_cents: bookingData.total_price_cents,
                booking_type: client_2.BookingType.CUSTOMER,
                booking_source: bookingData.booking_source ?? client_2.BookingSource.ADMIN,
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
                    regular_price_cents_snapshot: s.regular_price_cents_snapshot ?? null,
                    promo_applied_snapshot: s.promo_applied_snapshot ?? false,
                    promo_label_snapshot: s.promo_label_snapshot ?? null,
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
async function updateBookingStaff(bookingId, companyId, staffId, updatedByUserId) {
    return client_1.prisma.booking.updateMany({
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
async function replaceBookingServices(bookingId, companyId, services, totalPriceCents, endAt, updatedByUserId) {
    return client_1.prisma.$transaction(async (tx) => {
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
                regular_price_cents_snapshot: s.regular_price_cents_snapshot ?? null,
                promo_applied_snapshot: s.promo_applied_snapshot ?? false,
                promo_label_snapshot: s.promo_label_snapshot ?? null,
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
async function createCustomerBooking(bookingData, services) {
    return client_1.prisma.$transaction(async (tx) => {
        // Create the booking
        const booking = await tx.booking.create({
            data: {
                company_id: bookingData.company_id,
                staff_id: bookingData.staff_id,
                customer_id: bookingData.customer_id,
                start_at: bookingData.start_at,
                end_at: bookingData.end_at,
                status: client_2.BookingStatus.CONFIRMED,
                payment_method: bookingData.payment_method || client_2.PaymentMethod.NONE,
                payment_status: bookingData.payment_status
                    || (bookingData.payment_method === client_2.PaymentMethod.NONE
                        ? client_2.PaymentStatus.UNPAID
                        : client_2.PaymentStatus.PENDING_CONFIRMATION),
                qr_proof_image_url: bookingData.qr_proof_image_url ?? null,
                notes: bookingData.notes,
                internal_notes: bookingData.internal_notes,
                created_by_user_id: bookingData.created_by_user_id,
                total_price_cents: bookingData.total_price_cents,
                booking_type: client_2.BookingType.CUSTOMER,
                booking_source: bookingData.booking_source ?? client_2.BookingSource.ADMIN,
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
                    regular_price_cents_snapshot: s.regular_price_cents_snapshot ?? null,
                    promo_applied_snapshot: s.promo_applied_snapshot ?? false,
                    promo_label_snapshot: s.promo_label_snapshot ?? null,
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
                                name: true,
                                first_name: true,
                                last_name: true,
                                phoneNumber: true,
                            },
                        },
                    },
                },
            },
        });
    });
}
