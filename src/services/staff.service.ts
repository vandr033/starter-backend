import { MensajeApi } from '../types/MensajeApi';
import * as StaffRepo from '../repositories/staff.repo';
import { prisma } from '../prisma/client';

interface StaffResult extends MensajeApi {
    data?: any;
}

/**
 * List all staff for a company
 */
export async function listStaff(companyId: number): Promise<StaffResult> {
    try {
        const staff = await StaffRepo.getStaffByCompany(companyId);
        
        // Transform staff data to include services array
        const transformedStaff = staff.map(s => ({
            id: s.id,
            display_name: s.display_name,
            bio: s.bio,
            image_url: s.image_url,
            is_bookable: s.is_bookable,
            created_at: s.created_at,
            updated_at: s.updated_at,
            user: s.user,
            services: s.staff_services.map(ss => ss.service_id),
        }));

        return {
            code: 200,
            message: 'Staff retrieved successfully',
            error: false,
            data: transformedStaff,
        };
    } catch (error: any) {
        console.error('Error listing staff:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Create a new staff profile
 */
export interface CreateStaffInput {
    email: string;
    display_name: string;
    bio?: string;
    is_bookable?: boolean;
    service_ids?: number[];
}

export async function createStaff(
    companyId: number,
    input: CreateStaffInput
): Promise<StaffResult> {
    try {
        // Find or create user
        let user = await StaffRepo.findUserByEmail(input.email);
        
        if (!user) {
            // Create new user for invitation
            user = await StaffRepo.createInvitedUser(
                input.email,
                input.display_name
            );
        }

        // Check if user is already staff for this company
        const existingCompanyUser = await StaffRepo.getCompanyUser(
            user.id,
            companyId
        );

        if (existingCompanyUser) {
            return {
                code: 400,
                message: 'User is already a member of this company',
                error: true,
            };
        }

        // Create staff profile
        const staff = await StaffRepo.createStaffProfile({
            companyId,
            userId: user.id,
            displayName: input.display_name,
            bio: input.bio,
            isBookable: input.is_bookable,
        });

        // Assign services if provided
        if (input.service_ids && input.service_ids.length > 0) {
            await assignServicesToStaff(companyId, staff.id, input.service_ids);
        }

        // Get the complete staff profile with services
        const completeStaff = await StaffRepo.getStaffById(staff.id, companyId);

        return {
            code: 201,
            message: 'Staff created successfully',
            error: false,
            data: completeStaff,
        };
    } catch (error: any) {
        console.error('Error creating staff:', error);
        
        // Handle unique constraint violation
        if (error.code === 'P2002') {
            return {
                code: 400,
                message: 'Staff profile already exists for this user in your company',
                error: true,
            };
        }

        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Update a staff profile
 */
export interface UpdateStaffInput {
    display_name?: string;
    bio?: string;
    image_url?: string;
    is_bookable?: boolean;
    service_ids?: number[];
}

export async function updateStaff(
    companyId: number,
    staffId: number,
    input: UpdateStaffInput
): Promise<StaffResult> {
    try {
        // Check if staff exists and belongs to company
        const existing = await StaffRepo.getStaffById(staffId, companyId);
        if (!existing) {
            return {
                code: 404,
                message: 'Staff not found',
                error: true,
            };
        }

        // Update staff profile
        await StaffRepo.updateStaffProfile(staffId, companyId, input);

        // Update services if provided
        if (input.service_ids !== undefined) {
            // Delete existing service assignments
            await prisma.staffService.deleteMany({
                where: {
                    company_id: companyId,
                    staff_id: staffId,
                },
            });

            // Assign new services if any
            if (input.service_ids.length > 0) {
                await assignServicesToStaff(companyId, staffId, input.service_ids);
            }
        }

        // Get updated staff with services
        const updated = await StaffRepo.getStaffById(staffId, companyId);

        return {
            code: 200,
            message: 'Staff updated successfully',
            error: false,
            data: updated,
        };
    } catch (error: any) {
        console.error('Error updating staff:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Helper function to assign services to staff
 */
async function assignServicesToStaff(companyId: number, staffId: number, serviceIds: number[]) {
    // Validate all services belong to the company
    const services = await prisma.service.findMany({
        where: {
            id: { in: serviceIds },
            company_id: companyId,
        },
        select: { id: true },
    });

    if (services.length !== serviceIds.length) {
        throw new Error('One or more services do not belong to this company');
    }

    // Create staff-service relationships
    const staffServices = serviceIds.map(serviceId => ({
        company_id: companyId,
        staff_id: staffId,
        service_id: serviceId,
    }));

    await prisma.staffService.createMany({
        data: staffServices,
    });
}

/**
 * Soft delete a staff profile
 */
export async function deleteStaff(
    companyId: number,
    staffId: number
): Promise<StaffResult> {
    try {
        // Check if staff exists
        const existing = await StaffRepo.getStaffById(staffId, companyId);
        if (!existing) {
            return {
                code: 404,
                message: 'Staff not found',
                error: true,
            };
        }

        const result = await StaffRepo.softDeleteStaffProfile(staffId, companyId);

        if (result.count === 0) {
            return {
                code: 404,
                message: 'Staff not found or already deleted',
                error: true,
            };
        }

        return {
            code: 200,
            message: 'Staff deleted successfully',
            error: false,
        };
    } catch (error: any) {
        console.error('Error deleting staff:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Get services assigned to a staff member
 */
export async function getStaffServices(companyId: number, staffId: number): Promise<StaffResult> {
    try {
        // Check if staff exists and belongs to company
        const staff = await StaffRepo.getStaffById(staffId, companyId);
        if (!staff) {
            return {
                code: 404,
                message: 'Staff not found',
                error: true,
            };
        }

        // Get staff services with service details
        const staffServices = await prisma.staffService.findMany({
            where: {
                company_id: companyId,
                staff_id: staffId,
                is_active: true,
            },
            include: {
                service: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        price_cents: true,
                        duration_minutes: true,
                        category: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        return {
            code: 200,
            message: 'Staff services retrieved successfully',
            error: false,
            data: staffServices.map(ss => ss.service),
        };
    } catch (error: any) {
        console.error('Error getting staff services:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Update services assigned to a staff member
 */
export async function updateStaffServices(
    companyId: number,
    staffId: number,
    serviceIds: number[]
): Promise<StaffResult> {
    try {
        // Check if staff exists and belongs to company
        const staff = await StaffRepo.getStaffById(staffId, companyId);
        if (!staff) {
            return {
                code: 404,
                message: 'Staff not found',
                error: true,
            };
        }

        // Delete existing service assignments
        await prisma.staffService.deleteMany({
            where: {
                company_id: companyId,
                staff_id: staffId,
            },
        });

        // Assign new services if any
        if (serviceIds.length > 0) {
            await assignServicesToStaff(companyId, staffId, serviceIds);
        }

        return {
            code: 200,
            message: 'Staff services updated successfully',
            error: false,
        };
    } catch (error: any) {
        console.error('Error updating staff services:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
