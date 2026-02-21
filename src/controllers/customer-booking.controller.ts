import { Response } from 'express';
import { Request } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as BookingService from '../services/booking.service';
import { logger } from '../config/logger';
import { prisma } from '../prisma/client';

let mensaje: MensajeApi;

/**
 * POST /api/booking/customer
 * Create a new booking for an existing customer (no auth required)
 */
export async function createCustomerBooking(req: Request, res: Response) {
    try {
        const {
            company_id,
            staff_id,
            service_ids,
            start_at,
            payment_method,
            notes,
            customer_id, // New field to autofill customer data
            qr_proof_image_url,
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

        // Validate customer_id
        if (!customer_id) {
            mensaje = {
                code: 400,
                message: 'customer_id is required',
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

        // If payment method is QR, qr_proof_image_url is required
        if (payment_method === 'QR' && !qr_proof_image_url) {
            mensaje = {
                code: 400,
                message: 'qr_proof_image_url is required when payment_method is QR',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Fetch customer data
        const customer = await prisma.customerProfile.findFirst({
            where: {
                user_id: customer_id,
                company_id: company_id,
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

        if (!customer) {
            mensaje = {
                code: 404,
                message: 'Customer not found',
                error: true,
            };
            return res.status(404).json(mensaje);
        }

        // Prepare customer data from profile
        const clientData = {
            client_name: customer.user?.name || 
                        `${customer.user?.first_name || ''} ${customer.user?.last_name || ''}`.trim() || 
                        'Unknown',
            client_email: customer.user?.email || null,
            client_phone_prefix: '591', // Default
            client_phone_number: customer.user?.phoneNumber || null,
        };

        // Create the booking with customer data
        const result = await BookingService.createCustomerBooking({
            company_id,
            staff_id,
            customer_id: customer.id,
            service_ids,
            start_at,
            payment_method,
            notes: notes || null,
            qr_proof_image_url: qr_proof_image_url || null,
            ...clientData,
        });

        return res.status(result.code).json(result);
    } catch (error) {
        logger.error('Error creating customer booking:', error as any);
        mensaje = {
            code: 500,
            message: 'Internal server error',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}
