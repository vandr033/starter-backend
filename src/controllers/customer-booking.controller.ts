import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as BookingService from '../services/booking.service';
import { logger } from '../config/logger';
import { prisma } from '../prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { BookingSource } from '@prisma/client';

let mensaje: MensajeApi;

/**
 * POST /api/booking/customer
 * Create a new booking for an existing customer (requires auth)
 */
export async function createCustomerBooking(req: AuthenticatedRequest, res: Response) {
    try {
        const authenticatedUser = req.authUser;

        if (!authenticatedUser?.id) {
            mensaje = {
                code: 401,
                message: 'Not authenticated',
                error: true,
            };
            return res.status(401).json(mensaje);
        }

        const {
            company_id,
            staff_id,
            secondary_staff_id,
            service_ids,
            start_at,
            booking_groups,
            payment_method,
            notes,
            qr_proof_image_url,
            booking_source,
        } = req.body;

        if (!company_id || typeof company_id !== 'number') {
            mensaje = {
                code: 400,
                message: 'company_id es obligatorio y debe ser numérico.',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        const hasGroupedPayload = Array.isArray(booking_groups) && booking_groups.length > 0;
        if (!hasGroupedPayload) {
            if (!staff_id || typeof staff_id !== 'number') {
                mensaje = {
                    code: 400,
                    message: 'staff_id es obligatorio y debe ser numérico.',
                    error: true,
                };
                return res.status(400).json(mensaje);
            }

            if (!service_ids || !Array.isArray(service_ids) || service_ids.length === 0) {
                mensaje = {
                    code: 400,
                    message: 'service_ids es obligatorio y debe tener al menos un servicio.',
                    error: true,
                };
                return res.status(400).json(mensaje);
            }

            if (!start_at || typeof start_at !== 'string') {
                mensaje = {
                    code: 400,
                    message: 'start_at es obligatorio en formato ISO.',
                    error: true,
                };
                return res.status(400).json(mensaje);
            }
        }

        const validPaymentMethods = ['NONE', 'CASH', 'QR'];
        if (!payment_method || !validPaymentMethods.includes(payment_method)) {
            mensaje = {
                code: 400,
                message: 'payment_method es obligatorio y debe ser NONE, CASH o QR.',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (booking_source !== undefined) {
            if (typeof booking_source !== 'string' || !Object.values(BookingSource).includes(booking_source as BookingSource)) {
                mensaje = {
                    code: 400,
                    message: 'booking_source debe ser MARKETPLACE, SALON_SITE, ADMIN o MANUAL.',
                    error: true,
                };
                return res.status(400).json(mensaje);
            }
        }
        // Ensure customer profile exists for this authenticated user at this company.
        const customer = await prisma.customerProfile.upsert({
            where: {
                company_id_user_id: {
                    company_id,
                    user_id: authenticatedUser.id,
                },
            },
            update: {},
            create: {
                company_id,
                user_id: authenticatedUser.id,
            },
            include: {
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
        });

        // Prepare customer data from profile
        const clientData = {
            client_name: customer.user?.name || 
                        `${customer.user?.first_name || ''} ${customer.user?.last_name || ''}`.trim() || 
                        'Unknown',
            client_email: customer.user?.email || null,
            client_phone_prefix: authenticatedUser.phone_prefix || '591',
            client_phone_number: customer.user?.phoneNumber || null,
        };

        // Create the booking with customer data
        const result = await BookingService.createCustomerBooking({
            company_id,
            staff_id,
            secondary_staff_id: typeof secondary_staff_id === 'number' ? secondary_staff_id : null,
            customer_id: customer.id,
            created_by_user_id: authenticatedUser.id,
            service_ids,
            start_at,
            booking_groups: hasGroupedPayload ? booking_groups : undefined,
            payment_method,
            notes: notes || null,
            qr_proof_image_url: qr_proof_image_url || null,
            booking_source: booking_source as BookingSource | undefined,
            ...clientData,
        });

        return res.status(result.code).json(result);
    } catch (error) {
        logger.error('Error creating customer booking:', error as any);
        mensaje = {
            code: 500,
            message: 'No pudimos crear la reserva.',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}
