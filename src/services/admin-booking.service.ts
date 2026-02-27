import { MensajeApi } from '../types/MensajeApi';
import * as AdminBookingRepo from '../repositories/admin-booking.repo';
import * as BookingRepo from '../repositories/booking.repo';
import { BookingStatus, PaymentStatus, PaymentMethod, CompanyUserRole } from '@prisma/client';
import { prisma } from '../prisma/client';
import { notifyBookingCreated, notifyBookingUpdated, notifyBookingCancelled } from '../utils/bookingNotifications';

interface AdminBookingResult extends MensajeApi {
    data?: any;
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
                [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
                [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
                [BookingStatus.COMPLETED]: [], // No transitions from completed
                [BookingStatus.CANCELLED]: [], // No transitions from cancelled
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
                ? new Date(updates.start_at)
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
                const startAt = new Date(updates.start_at);
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
            const startAt = new Date(updates.start_at);

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
        if (updates.notes !== undefined) {
            await AdminBookingRepo.updateBookingNotes(
                bookingId,
                companyId,
                updates.notes,
                updatedByUserId
            );
        }

        // Get updated booking
        const updatedBooking = await AdminBookingRepo.getBookingById(bookingId, companyId);

        // Send notification based on what changed (fire-and-forget)
        if (updatedBooking) {
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

            if (updates.status === BookingStatus.CANCELLED) {
                void notifyBookingCancelled(notificationData);
            } else if (updates.start_at || updates.staff_id || updates.service_ids) {
                void notifyBookingUpdated(notificationData);
            }
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
        client_name?: string;
        client_phone?: string;
        client_email?: string;
        notes?: string;
    },
    createdByUserId: string
): Promise<AdminBookingResult> {
    try {
        // Validate required fields
        if (!data.staff_id || !data.service_ids || data.service_ids.length === 0 || !data.start_at) {
            return {
                code: 400,
                message: 'staff_id, service_ids, and start_at are required',
                error: true,
            };
        }

        // Parse start time
        const startAt = new Date(data.start_at);
        if (isNaN(startAt.getTime())) {
            return {
                code: 400,
                message: 'Invalid start_at format',
                error: true,
            };
        }

        // Get services
        const services = await BookingRepo.getServicesByIds(data.service_ids, data.companyId);
        if (services.length === 0) {
            return {
                code: 400,
                message: 'No valid services found',
                error: true,
            };
        }

        // Calculate total duration and price
        const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0);
        const totalPrice = services.reduce((sum, s) => sum + s.price_cents, 0);
        const endAt = new Date(startAt.getTime() + totalDuration * 60 * 1000);

        // Check staff availability
        const conflict = await BookingRepo.checkSlotConflict(
            data.companyId,
            data.staff_id,
            startAt,
            endAt,
            0
        );

        if (conflict) {
            return {
                code: 409,
                message: 'Time slot conflicts with another booking',
                error: true,
            };
        }

        // Prepare service snapshots
        const serviceSnapshots = services.map((service, index) => ({
            service_id: service.id,
            service_name_snapshot: service.name,
            price_cents_snapshot: service.price_cents,
            duration_minutes_snapshot: service.duration_minutes,
            position: index,
        }));

        // Create walk-in booking
        if (!data.client_name) {
            return {
                code: 400,
                message: 'client_name is required for walk-in bookings',
                error: true,
            };
        }

        // Parse phone number
        let phonePrefix: string | undefined;
        let phoneNumber: string | undefined;
        if (data.client_phone) {
            const parts = data.client_phone.split(' ');
            if (parts.length > 1) {
                phonePrefix = parts[0];
                phoneNumber = parts.slice(1).join(' ');
            } else {
                phoneNumber = data.client_phone;
            }
        }

        const booking = await AdminBookingRepo.createWalkInBooking(
            {
                company_id: data.companyId,
                staff_id: data.staff_id,
                client_name: data.client_name,
                client_phone_prefix: phonePrefix,
                client_phone_number: phoneNumber,
                client_email: data.client_email,
                start_at: startAt,
                end_at: endAt,
                notes: data.notes,
                created_by_user_id: createdByUserId,
                total_price_cents: totalPrice,
                payment_method: PaymentMethod.NONE,
            },
            serviceSnapshots
        );

        // Send notification if contact info available (fire-and-forget)
        if (booking && (data.client_email || phoneNumber)) {
            const company = await prisma.company.findUnique({ where: { id: data.companyId }, select: { name: true } });
            const staffProfile = await prisma.staffProfile.findFirst({
                where: { id: data.staff_id, company_id: data.companyId },
                select: { display_name: true },
            });
            void notifyBookingCreated({
                companyId: data.companyId,
                bookingId: booking.id,
                staffId: data.staff_id,
                customerEmail: data.client_email,
                customerPhone: phoneNumber,
                customerPhonePrefix: phonePrefix,
                customerName: data.client_name,
                companyName: company?.name || '',
                staffName: staffProfile?.display_name || '',
                serviceNames: services.map(s => s.name),
                startAt,
                endAt,
                totalPriceCents: totalPrice,
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
