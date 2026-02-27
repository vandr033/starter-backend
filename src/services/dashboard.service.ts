import { MensajeApi } from '../types/MensajeApi';
import * as DashboardRepo from '../repositories/dashboard.repo';

interface DashboardResult extends MensajeApi {
    data?: any;
}

export async function getDashboardMetrics(companyId: number, staffId?: number): Promise<DashboardResult> {
    try {
        const [bookings, revenue, topServices, topStaff] = await Promise.all([
            DashboardRepo.getBookingCounts(companyId, staffId),
            DashboardRepo.getRevenueTotals(companyId, staffId),
            DashboardRepo.getTopServices(companyId, 5, staffId),
            DashboardRepo.getTopStaff(companyId, 5, staffId),
        ]);

        return {
            code: 200,
            message: 'Dashboard metrics retrieved successfully',
            error: false,
            data: { bookings, revenue, topServices, topStaff },
        };
    } catch (error: any) {
        console.error('Error getting dashboard metrics:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
