import { MensajeApi } from '../types/MensajeApi';
import * as Repo from '../repositories/super-admin-customers.repo';

interface GetAllCustomersOptions {
    search?: string;
    shopId?: number;
    page: number;
    limit: number;
}

export async function getAllCustomers(options: GetAllCustomersOptions): Promise<MensajeApi> {
    try {
        const result = await Repo.getAllCustomers(options);
        return {
            code: 200,
            error: false,
            message: 'Customers retrieved successfully',
            data: result,
        };
    } catch (error: any) {
        console.error('Error getting all customers:', error);
        return { code: 500, error: true, message: 'Failed to retrieve customers' };
    }
}
