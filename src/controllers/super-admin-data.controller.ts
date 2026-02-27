import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as BookingsService from '../services/super-admin-bookings.service';
import * as CustomersService from '../services/super-admin-customers.service';
import * as StaffService from '../services/super-admin-staff.service';

function parseQueryString(val: unknown): string | undefined {
    if (typeof val === 'string') return val;
    if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
    return undefined;
}

function parseQueryInt(val: unknown, fallback: number): number {
    const str = parseQueryString(val);
    if (!str) return fallback;
    const num = parseInt(str, 10);
    return isNaN(num) ? fallback : num;
}

/**
 * GET /api/super-admin/bookings
 */
export async function getAllBookings(req: AuthenticatedRequest, res: Response) {
    try {
        const result = await BookingsService.getAllBookings({
            shopId: parseQueryInt(req.query.shopId, 0) || undefined,
            startDate: parseQueryString(req.query.startDate),
            endDate: parseQueryString(req.query.endDate),
            status: parseQueryString(req.query.status),
            paymentStatus: parseQueryString(req.query.paymentStatus),
            page: parseQueryInt(req.query.page, 1),
            limit: parseQueryInt(req.query.limit, 20),
        });
        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error in getAllBookings:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}

/**
 * GET /api/super-admin/bookings/today-count
 */
export async function getTodayBookingsCount(req: AuthenticatedRequest, res: Response) {
    try {
        const result = await BookingsService.getTodayBookingsCount();
        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error in getTodayBookingsCount:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}

/**
 * GET /api/super-admin/customers
 */
export async function getAllCustomers(req: AuthenticatedRequest, res: Response) {
    try {
        const result = await CustomersService.getAllCustomers({
            search: parseQueryString(req.query.search),
            shopId: parseQueryInt(req.query.shopId, 0) || undefined,
            page: parseQueryInt(req.query.page, 1),
            limit: parseQueryInt(req.query.limit, 20),
        });
        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error in getAllCustomers:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}

/**
 * GET /api/super-admin/staff
 */
export async function getAllStaff(req: AuthenticatedRequest, res: Response) {
    try {
        const result = await StaffService.getAllStaff({
            shopId: parseQueryInt(req.query.shopId, 0) || undefined,
            status: parseQueryString(req.query.status),
            role: parseQueryString(req.query.role),
            page: parseQueryInt(req.query.page, 1),
            limit: parseQueryInt(req.query.limit, 20),
        });
        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error in getAllStaff:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}
