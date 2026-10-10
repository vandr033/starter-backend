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
exports.getAvailableSlots = getAvailableSlots;
exports.getAvailableDates = getAvailableDates;
exports.createBooking = createBooking;
const BookingService = __importStar(require("../services/booking.service"));
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
let mensaje;
/**
 * GET /api/booking/slots
 * Get available booking time slots
 *
 * Query params:
 * - company_id: number (required)
 * - service_ids: string (required, comma-separated, e.g. "1,2,3")
 * - date: string (required, "YYYY-MM-DD")
 * - staff_id: number (optional)
 */
async function getAvailableSlots(req, res) {
    const { company_id, staff_id, secondary_staff_id, service_ids, date } = req.query;
    // Validate required params
    if (!company_id) {
        mensaje = {
            code: 400,
            message: 'company_id is required',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    if (!service_ids) {
        mensaje = {
            code: 400,
            message: 'service_ids is required',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    if (!date) {
        mensaje = {
            code: 400,
            message: 'date is required (YYYY-MM-DD)',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        mensaje = {
            code: 400,
            message: 'date must be in YYYY-MM-DD format',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    // Parse service_ids
    const serviceIdsArray = service_ids.split(',').map(id => parseInt(id.trim(), 10));
    if (serviceIdsArray.some(isNaN)) {
        mensaje = {
            code: 400,
            message: 'service_ids must be comma-separated numbers',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    // Build params
    const params = {
        company_id: parseInt(company_id, 10),
        service_ids: serviceIdsArray,
        date: date,
        staff_id: staff_id ? parseInt(staff_id, 10) : undefined,
        secondary_staff_id: secondary_staff_id ? parseInt(secondary_staff_id, 10) : undefined,
    };
    // Validate parsed numbers
    if (isNaN(params.company_id)) {
        mensaje = {
            code: 400,
            message: 'company_id must be a number',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    if (params.staff_id !== undefined && isNaN(params.staff_id)) {
        mensaje = {
            code: 400,
            message: 'staff_id must be a number',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    const result = await BookingService.getAvailableSlots(params);
    return res.status(result.code).json(result);
}
/**
 * GET /api/booking/available-dates
 * Get available booking dates with hours information
 *
 * Query params:
 * - company_id: number (required)
 * - start_date: string YYYY-MM-DD (optional, defaults to today)
 * - days: number (optional, defaults to 14)
 */
async function getAvailableDates(req, res) {
    const { company_id, start_date, days, ignore_max_advance } = req.query;
    // Validate required params
    if (!company_id) {
        mensaje = {
            code: 400,
            message: 'company_id is required',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    // Parse company_id
    const companyId = parseInt(company_id, 10);
    if (isNaN(companyId)) {
        mensaje = {
            code: 400,
            message: 'company_id must be a number',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    // Parse start_date with default to today
    let startDate;
    if (start_date) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(start_date)) {
            mensaje = {
                code: 400,
                message: 'start_date must be in YYYY-MM-DD format',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        startDate = new Date(start_date);
    }
    else {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
    }
    // Parse days with default to 14
    let numberOfDays = days ? parseInt(days, 10) : 14;
    if (isNaN(numberOfDays) || numberOfDays < 1 || numberOfDays > 365) {
        mensaje = {
            code: 400,
            message: 'days must be a number between 1 and 365',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    const ignoreMaxAdvance = ignore_max_advance === '1' ||
        ignore_max_advance === 'true';
    // Cap by max_advance_booking_days if configured
    if (!ignoreMaxAdvance) {
        const companySettings = await client_2.prisma.companySettings.findUnique({
            where: { company_id: companyId },
            select: { max_advance_booking_days: true },
        });
        if (companySettings?.max_advance_booking_days != null) {
            numberOfDays = Math.min(numberOfDays, companySettings.max_advance_booking_days);
        }
    }
    const result = await BookingService.getAvailableDates({
        companyId,
        startDate,
        numberOfDays,
    });
    return res.status(result.code).json(result);
}
/**
 * POST /api/booking
 * Create a new customer booking
 */
async function createBooking(req, res) {
    const user = req.authUser;
    if (!user) {
        mensaje = {
            code: 401,
            message: 'Not authenticated',
            error: true,
        };
        return res.status(401).json(mensaje);
    }
    const { company_id, staff_id, secondary_staff_id, service_ids, start_at, payment_method, notes, booking_source, qr_proof_image_url, upload_intent } = req.body;
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
        if (typeof booking_source !== 'string' || !Object.values(client_1.BookingSource).includes(booking_source)) {
            mensaje = {
                code: 400,
                message: 'booking_source must be one of MARKETPLACE, SALON_SITE, ADMIN, MANUAL',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }
    const result = await BookingService.createBooking({
        company_id,
        staff_id,
        secondary_staff_id: typeof secondary_staff_id === 'number' ? secondary_staff_id : undefined,
        service_ids,
        start_at,
        payment_method,
        notes,
        user_id: user.id,
        booking_source: booking_source,
        qr_proof_image_url: typeof qr_proof_image_url === 'string' ? qr_proof_image_url : undefined,
        upload_intent: typeof upload_intent === 'string' ? upload_intent : undefined,
    });
    return res.status(result.code).json(result);
}
