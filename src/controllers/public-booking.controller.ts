import { Request, Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as BookingService from '../services/booking.service';
import { logger } from '../config/logger';
import { BookingSource } from '@prisma/client';

let mensaje: MensajeApi;

/**
 * POST /api/booking/public
 * Create a new booking as a guest/customer (no auth required)
 */
export async function createPublicBooking(req: Request, res: Response) {
    try {
        const {
            company_id,
            staff_id,
            secondary_staff_id,
            service_ids,
            start_at,
            booking_groups,
            payment_method,
            notes,
            // Customer information
            client_name,
            client_email,
            client_phone_prefix,
            client_phone_number,
            // QR proof for QR payments
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

        if (client_name && (typeof client_name !== 'string' || client_name.trim().length === 0)) {
            mensaje = {
                code: 400,
                message: 'client_name debe ser un texto válido si se envía.',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (client_email && typeof client_email !== 'string') {
            mensaje = {
                code: 400,
                message: 'client_email debe ser un texto válido si se envía.',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (client_email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(client_email)) {
                mensaje = {
                    code: 400,
                    message: 'client_email debe tener un formato válido.',
                    error: true,
                };
                return res.status(400).json(mensaje);
            }
        }

        if (client_phone_number && typeof client_phone_number !== 'string') {
            mensaje = {
                code: 400,
                message: 'client_phone_number debe ser un texto válido si se envía.',
                error: true,
            };
            return res.status(400).json(mensaje);
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

        const result = await BookingService.createPublicBooking({
            company_id,
            staff_id,
            secondary_staff_id: typeof secondary_staff_id === 'number' ? secondary_staff_id : null,
            service_ids,
            start_at,
            booking_groups: hasGroupedPayload ? booking_groups : undefined,
            payment_method,
            notes: notes || null,
            client_name: client_name ? client_name.trim() : null,
            client_email: client_email ? client_email.trim().toLowerCase() : null,
            client_phone_prefix: client_phone_prefix || '591', // Default to Bolivia
            client_phone_number: client_phone_number ? client_phone_number.trim() : null,
            qr_proof_image_url: qr_proof_image_url || null,
            booking_source: booking_source as BookingSource | undefined,
        });

        return res.status(result.code).json(result);
    } catch (error) {
        logger.error('Error creating public booking:', error as any);
        mensaje = {
            code: 500,
            message: 'No pudimos crear la reserva.',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}
