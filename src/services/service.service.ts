import { MensajeApi } from '../types/MensajeApi';
import * as ServiceRepo from '../repositories/service.repo';

interface ServiceResult extends MensajeApi {
    data?: any;
}

/**
 * List all services for a company
 */
export async function listServices(companyId: number): Promise<ServiceResult> {
    try {
        const services = await ServiceRepo.getServicesByCompany(companyId);

        return {
            code: 200,
            message: 'Services retrieved successfully',
            error: false,
            data: services,
        };
    } catch (error: any) {
        console.error('Error listing services:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Create a new service
 */
export interface CreateServiceInput {
    category_id: number;
    name: string;
    description?: string;
    price_cents: number;
    duration_minutes: number;
    position?: number;
    global_type_id?: number;
}

export async function createService(
    companyId: number,
    input: CreateServiceInput
): Promise<ServiceResult> {
    try {
        // Validate category belongs to same company
        const category = await ServiceRepo.getCategoryById(input.category_id, companyId);
        if (!category) {
            return {
                code: 400,
                message: 'Category not found or does not belong to your company',
                error: true,
            };
        }

        // Auto-set position if not provided
        let position = input.position;
        if (position === undefined) {
            position = await ServiceRepo.getNextPosition(input.category_id);
        }

        const service = await ServiceRepo.createService({
            company_id: companyId,
            category_id: input.category_id,
            name: input.name,
            description: input.description,
            price_cents: input.price_cents,
            duration_minutes: input.duration_minutes,
            position,
            global_type_id: input.global_type_id,
        });

        return {
            code: 201,
            message: 'Service created successfully',
            error: false,
            data: service,
        };
    } catch (error: any) {
        console.error('Error creating service:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Update a service
 */
export interface UpdateServiceInput {
    name?: string;
    description?: string;
    price_cents?: number;
    duration_minutes?: number;
    position?: number;
    is_active?: boolean;
    category_id?: number;
    global_type_id?: number;
}

export async function updateService(
    companyId: number,
    serviceId: number,
    input: UpdateServiceInput
): Promise<ServiceResult> {
    try {
        // Check if service exists and belongs to company
        const existing = await ServiceRepo.getServiceById(serviceId, companyId);
        if (!existing) {
            return {
                code: 404,
                message: 'Service not found',
                error: true,
            };
        }

        // If changing category, validate new category belongs to company
        if (input.category_id && input.category_id !== existing.category.id) {
            const category = await ServiceRepo.getCategoryById(input.category_id, companyId);
            if (!category) {
                return {
                    code: 400,
                    message: 'Category not found or does not belong to your company',
                    error: true,
                };
            }
        }

        await ServiceRepo.updateService(serviceId, companyId, input);
        const updated = await ServiceRepo.getUpdatedService(serviceId, companyId);

        return {
            code: 200,
            message: 'Service updated successfully',
            error: false,
            data: updated,
        };
    } catch (error: any) {
        console.error('Error updating service:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Soft delete a service
 */
export async function deleteService(
    companyId: number,
    serviceId: number
): Promise<ServiceResult> {
    try {
        // Check if service exists
        const existing = await ServiceRepo.getServiceById(serviceId, companyId);
        if (!existing) {
            return {
                code: 404,
                message: 'Service not found',
                error: true,
            };
        }

        const result = await ServiceRepo.softDeleteService(serviceId, companyId);

        if (result.count === 0) {
            return {
                code: 404,
                message: 'Service not found or already deleted',
                error: true,
            };
        }

        return {
            code: 200,
            message: 'Service deleted successfully',
            error: false,
        };
    } catch (error: any) {
        console.error('Error deleting service:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
