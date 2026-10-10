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
const Repo = __importStar(require("../repositories/super-admin-bookings.repo"));
async function getAllBookings(options) {
    try {
        const result = await Repo.getAllBookings(options);
        return {
            code: 200,
            error: false,
            message: 'Bookings retrieved successfully',
            data: result,
        };
    }
    catch (error) {
        console.error('Error getting all bookings:', error);
        return { code: 500, error: true, message: 'Failed to retrieve bookings' };
    }
}
async function getTodayBookingsCount() {
    try {
        const count = await Repo.getTodayBookingsCount();
        return {
            code: 200,
            error: false,
            message: 'Today bookings count retrieved',
            data: { count },
        };
    }
    catch (error) {
        console.error('Error getting today bookings count:', error);
        return { code: 500, error: true, message: 'Failed to get count' };
    }
}
