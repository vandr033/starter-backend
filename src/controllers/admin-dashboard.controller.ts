import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as DashboardService from '../services/dashboard.service';
import { CompanyUserRole } from '@prisma/client';
import { prisma } from '../prisma/client';

export const getMetrics = async (req: AuthenticatedRequest, res: Response) => {
    const companyId = (req as any).companyID;
    const companyUser = (req as any).companyUser as { role?: CompanyUserRole } | undefined;
    const userId = req.authUser?.id;
    let staffId: number | undefined;

    if (companyUser?.role === CompanyUserRole.STAFF) {
        if (!userId) {
            return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
        }

        const staffProfile = await prisma.staffProfile.findFirst({
            where: {
                company_id: companyId,
                user_id: userId,
                deleted_at: null,
            },
            select: { id: true },
        });

        if (!staffProfile) {
            return res.status(403).json({ code: 403, error: true, message: 'Staff profile not found in this company' });
        }

        staffId = staffProfile.id;
    }

    const result = await DashboardService.getDashboardMetrics(companyId, staffId);
    res.status(result.code).json(result);
};
