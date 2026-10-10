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
exports.getAllBookings = getAllBookings;
exports.getTodayBookingsCount = getTodayBookingsCount;
exports.getAllCustomers = getAllCustomers;
exports.getAllStaff = getAllStaff;
exports.getAllUsers = getAllUsers;
exports.deleteUser = deleteUser;
const BookingsService = __importStar(require("../services/super-admin-bookings.service"));
const CustomersService = __importStar(require("../services/super-admin-customers.service"));
const StaffService = __importStar(require("../services/super-admin-staff.service"));
const UsersService = __importStar(require("../services/super-admin-users.service"));
function parseQueryString(val) {
    if (typeof val === 'string')
        return val;
    if (Array.isArray(val) && typeof val[0] === 'string')
        return val[0];
    return undefined;
}
function parseQueryInt(val, fallback) {
    const str = parseQueryString(val);
    if (!str)
        return fallback;
    const num = parseInt(str, 10);
    return isNaN(num) ? fallback : num;
}
/**
 * GET /api/super-admin/bookings
 */
async function getAllBookings(req, res) {
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
    }
    catch (error) {
        console.error('Error in getAllBookings:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}
/**
 * GET /api/super-admin/bookings/today-count
 */
async function getTodayBookingsCount(req, res) {
    try {
        const result = await BookingsService.getTodayBookingsCount();
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getTodayBookingsCount:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}
/**
 * GET /api/super-admin/customers
 */
async function getAllCustomers(req, res) {
    try {
        const result = await CustomersService.getAllCustomers({
            search: parseQueryString(req.query.search),
            shopId: parseQueryInt(req.query.shopId, 0) || undefined,
            page: parseQueryInt(req.query.page, 1),
            limit: parseQueryInt(req.query.limit, 20),
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getAllCustomers:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}
/**
 * GET /api/super-admin/staff
 */
async function getAllStaff(req, res) {
    try {
        const result = await StaffService.getAllStaff({
            shopId: parseQueryInt(req.query.shopId, 0) || undefined,
            status: parseQueryString(req.query.status),
            role: parseQueryString(req.query.role),
            page: parseQueryInt(req.query.page, 1),
            limit: parseQueryInt(req.query.limit, 20),
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getAllStaff:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}
/**
 * GET /api/super-admin/users
 */
async function getAllUsers(req, res) {
    try {
        const result = await UsersService.getAllUsers({
            search: parseQueryString(req.query.search),
            source: parseQueryString(req.query.source),
            page: parseQueryInt(req.query.page, 1),
            limit: parseQueryInt(req.query.limit, 20),
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getAllUsers:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}
/**
 * DELETE /api/super-admin/users/:userId
 */
async function deleteUser(req, res) {
    try {
        const userId = parseQueryString(req.params.userId);
        if (!userId) {
            return res.status(400).json({
                code: 400,
                error: true,
                message: 'User id is required',
            });
        }
        const result = await UsersService.deleteUserAccount(userId, req.authUser?.id);
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in deleteUser:', error);
        return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
    }
}
