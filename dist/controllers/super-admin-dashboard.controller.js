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
const SuperAdminDashboardService = __importStar(require("../services/super-admin-dashboard.service"));
/**
 * GET /api/super-admin/dashboard/metrics
 * Platform-wide analytics for super admin
 */
async function getDashboardMetrics(req, res) {
    try {
        const rangeRaw = typeof req.query.range === 'string' ? req.query.range : '7d';
        const range = rangeRaw === 'today' || rangeRaw === '7d' || rangeRaw === '30d' ? rangeRaw : null;
        if (!range) {
            return res.status(400).json({
                code: 400,
                error: true,
                message: 'range must be one of: today, 7d, 30d',
            });
        }
        const result = await SuperAdminDashboardService.getDashboardMetrics(range);
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in super admin getDashboardMetrics:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
