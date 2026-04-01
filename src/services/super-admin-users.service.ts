import { MensajeApi } from '../types/MensajeApi';
import * as Repo from '../repositories/super-admin-users.repo';

interface GetAllUsersOptions {
    search?: string;
    source?: string;
    page: number;
    limit: number;
}

export async function getAllUsers(options: GetAllUsersOptions): Promise<MensajeApi> {
    try {
        const result = await Repo.getAllUsers(options);
        return {
            code: 200,
            error: false,
            message: 'Users retrieved successfully',
            data: result,
        };
    } catch (error) {
        console.error('Error getting all users:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve users',
        };
    }
}
