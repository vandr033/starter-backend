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

        // Validate required fields
        if (!company_id || typeof company_id !== 'number') {
            mensaje = {
                code: 400,
                message: 'company_id is required and must be a number',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (!staff_id || typeof staff_id !== 'number') {
            mensaje = {
                code: 400,
                message: 'staff_id is required and must be a number',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (!service_ids || !Array.isArray(service_ids) || service_ids.length === 0) {
            mensaje = {
                code: 400,
                message: 'service_ids is required and must be a non-empty array',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (!start_at || typeof start_at !== 'string') {
            mensaje = {
                code: 400,
                message: 'start_at is required (ISO datetime string)',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Validate customer information (optional)
        if (client_name && (typeof client_name !== 'string' || client_name.trim().length === 0)) {
            mensaje = {
                code: 400,
                message: 'client_name must be a non-empty string if provided',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (client_email && typeof client_email !== 'string') {
            mensaje = {
                code: 400,
                message: 'client_email must be a string if provided',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Basic email validation if provided
        if (client_email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(client_email)) {
                mensaje = {
                    code: 400,
                    message: 'client_email must be a valid email address',
                    error: true,
                };
                return res.status(400).json(mensaje);
            }
        }

        // Validate phone number if provided
        if (client_phone_number && typeof client_phone_number !== 'string') {
            mensaje = {
                code: 400,
                message: 'client_phone_number must be a string if provided',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Validate payment_method
        const validPaymentMethods = ['NONE', 'CASH', 'QR'];
        if (!payment_method || !validPaymentMethods.includes(payment_method)) {
            mensaje = {
                code: 400,
                message: 'payment_method is required and must be NONE, CASH, or QR',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (booking_source !== undefined) {
            if (typeof booking_source !== 'string' || !Object.values(BookingSource).includes(booking_source as BookingSource)) {
                mensaje = {
                    code: 400,
                    message: 'booking_source must be one of MARKETPLACE, SALON_SITE, ADMIN, MANUAL',
                    error: true,
                };
                return res.status(400).json(mensaje);
            }
        }

        // Create the booking
        const result = await BookingService.createPublicBooking({
            company_id,
            staff_id,
            secondary_staff_id: typeof secondary_staff_id === 'number' ? secondary_staff_id : null,
            service_ids,
            start_at,
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
            message: 'Internal server error',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}
