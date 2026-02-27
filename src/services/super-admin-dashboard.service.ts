import { MensajeApi } from '../types/MensajeApi';
import * as Repo from '../repositories/super-admin-dashboard.repo';

export async function getDashboardMetrics(): Promise<MensajeApi> {
    try {
        const [bookings, revenue, topShopsByRevenue, topShopsByBookings, topServices, entityCounts] =
            await Promise.all([
                Repo.getBookingCounts(),
                Repo.getRevenueTotals(),
                Repo.getTopShopsByRevenue(5),
                Repo.getTopShopsByBookings(5),
                Repo.getTopServices(5),
                Repo.getEntityCounts(),
            ]);

        return {
            code: 200,
            message: 'Super admin dashboard metrics retrieved successfully',
            error: false,
            data: { bookings, revenue, topShopsByRevenue, topShopsByBookings, topServices, entityCounts },
        };
    } catch (error: any) {
        console.error('Error getting super admin dashboard metrics:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
