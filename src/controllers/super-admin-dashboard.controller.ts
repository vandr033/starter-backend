import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as SuperAdminDashboardService from '../services/super-admin-dashboard.service';

/**
 * GET /api/super-admin/dashboard/metrics
 * Platform-wide analytics for super admin
 */
export async function getDashboardMetrics(req: AuthenticatedRequest, res: Response) {
    try {
        const result = await SuperAdminDashboardService.getDashboardMetrics();
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
