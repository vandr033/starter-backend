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
exports.getDashboardMetrics = getDashboardMetrics;
const DashboardRepo = __importStar(require("../repositories/dashboard.repo"));
async function getDashboardMetrics(companyId, staffId) {
    try {
        const [bookings, revenue, topServices, topStaff, bookingsByStatus, bookingsByCategory, customerInsights, busiestMoments, customerGrowthTrend,] = await Promise.all([
            DashboardRepo.getBookingCounts(companyId, staffId),
            DashboardRepo.getRevenueTotals(companyId, staffId),
            DashboardRepo.getTopServices(companyId, 5, staffId),
            DashboardRepo.getTopStaff(companyId, 5, staffId),
            DashboardRepo.getBookingsByStatus(companyId, staffId),
            DashboardRepo.getBookingsByCategory(companyId, 6, staffId),
            DashboardRepo.getCustomerInsights(companyId, staffId),
            DashboardRepo.getBusiestMoments(companyId, staffId),
            DashboardRepo.getCustomerGrowthTrend(companyId, staffId, 6),
        ]);
        return {
            code: 200,
            message: 'Dashboard metrics retrieved successfully',
            error: false,
            data: {
                bookings,
                revenue,
                topServices,
                topStaff,
                bookingsByStatus,
                bookingsByCategory,
                customerInsights,
                busiestMoments,
                customerGrowthTrend,
            },
        };
    }
    catch (error) {
        console.error('Error getting dashboard metrics:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
