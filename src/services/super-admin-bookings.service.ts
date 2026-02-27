import { MensajeApi } from '../types/MensajeApi';
import * as Repo from '../repositories/super-admin-bookings.repo';

interface GetAllBookingsOptions {
    shopId?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    paymentStatus?: string;
    page: number;
    limit: number;
}

export async function getAllBookings(options: GetAllBookingsOptions): Promise<MensajeApi> {
    try {
        const result = await Repo.getAllBookings(options);
        return {
            code: 200,
            error: false,
            message: 'Bookings retrieved successfully',
            data: result,
        };
    } catch (error: any) {
        console.error('Error getting all bookings:', error);
        return { code: 500, error: true, message: 'Failed to retrieve bookings' };
    }
}

export async function getTodayBookingsCount(): Promise<MensajeApi> {
    try {
        const count = await Repo.getTodayBookingsCount();
        return {
            code: 200,
            error: false,
            message: 'Today bookings count retrieved',
            data: { count },
        };
    } catch (error: any) {
        console.error('Error getting today bookings count:', error);
        return { code: 500, error: true, message: 'Failed to get count' };
    }
}
