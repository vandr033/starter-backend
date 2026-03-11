import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as SuperAdminDashboardService from '../services/super-admin-dashboard.service';

/**
 * GET /api/super-admin/dashboard/metrics
 * Platform-wide analytics for super admin
 */
export async function getDashboardMetrics(req: AuthenticatedRequest, res: Response) {
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
    } catch (error) {
        console.error('Error in super admin getDashboardMetrics:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
