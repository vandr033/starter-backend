import { MensajeApi } from '../types/MensajeApi';
import * as Repo from '../repositories/super-admin-staff.repo';

interface GetAllStaffOptions {
    shopId?: number;
    status?: string;
    role?: string;
    page: number;
    limit: number;
}

export async function getAllStaff(options: GetAllStaffOptions): Promise<MensajeApi> {
    try {
        const result = await Repo.getAllStaff(options);
        return {
            code: 200,
            error: false,
            message: 'Staff retrieved successfully',
            data: result,
        };
    } catch (error: any) {
        console.error('Error getting all staff:', error);
        return { code: 500, error: true, message: 'Failed to retrieve staff' };
    }
}
