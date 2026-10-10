"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCustomerBooking = createCustomerBooking;
const BookingService = __importStar(require("../services/booking.service"));
const logger_1 = require("../config/logger");
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
let mensaje;
/**
 * POST /api/booking/customer
 * Create a new booking for an existing customer (requires auth)
 */
async function createCustomerBooking(req, res) {
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
        const { company_id, staff_id, secondary_staff_id, service_ids, start_at, booking_groups, payment_method, notes, qr_proof_image_url, upload_intent, upload_context_id, booking_source, } = req.body;
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
            if (typeof booking_source !== 'string' || !Object.values(client_2.BookingSource).includes(booking_source)) {
                mensaje = {
                    code: 400,
                    message: 'booking_source debe ser MARKETPLACE, SALON_SITE, ADMIN o MANUAL.',
                    error: true,
                };
                return res.status(400).json(mensaje);
            }
        }
        // Ensure customer profile exists for this authenticated user at this company.
        const customer = await client_1.prisma.customerProfile.upsert({
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
            upload_intent: typeof upload_intent === 'string' ? upload_intent : null,
            upload_context_id: upload_context_id === null
                ? null
                : typeof upload_context_id === 'string'
                    ? upload_context_id
                    : undefined,
            booking_source: booking_source,
            ...clientData,
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        logger_1.logger.error('Error creating customer booking:', error);
        mensaje = {
            code: 500,
            message: 'No pudimos crear la reserva.',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}
