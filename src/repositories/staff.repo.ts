import { prisma } from '../prisma/client';
import { CompanyUserRole } from '@prisma/client';

/**
 * Get all staff profiles for a company
 */
export async function getStaffByCompany(companyId: number) {
    return prisma.staffProfile.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
        },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                    first_name: true,
                    last_name: true,
                    phoneNumber: true,
                    phone_prefix: true,
                },
            },
            staff_services: {
                where: {
                    is_active: true,
                },
                select: {
                    service_id: true,
                },
            },
        },
        orderBy: {
            display_name: 'asc',
        },
    });
}

/**
 * Get a single staff profile by ID with ownership check
 */
export async function getStaffById(id: number, companyId: number) {
    return prisma.staffProfile.findFirst({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                    first_name: true,
                    last_name: true,
                    phoneNumber: true,
                    phone_prefix: true,
                },
            },
        },
    });
}

/**
 * Find user by email
 */
export async function findUserByEmail(email: string) {
    return prisma.user.findUnique({
        where: {
            email,
            deleted_at: null,
        },
    });
}

/**
 * Create a new user (simplified version for invitation)
 */
export async function createInvitedUser(email: string, name?: string) {
    return prisma.user.create({
        data: {
            email,
            name: name || email.split('@')[0],
            emailVerified: false,
            is_active: true,
        },
    });
}

/**
 * Check if user is already a staff member for the company
 */
export async function getCompanyUser(userId: string, companyId: number) {
    return prisma.companyUser.findFirst({
        where: {
            user_id: userId,
            company_id: companyId,
            deleted_at: null,
        },
    });
}

/**
 * Create staff profile and company user relation
 */
export async function createStaffProfile(data: {
    companyId: number;
    userId: string;
    displayName: string;
    bio?: string;
    isBookable?: boolean;
}) {
    // Create CompanyUser with STAFF role
    await prisma.companyUser.create({
        data: {
            company_id: data.companyId,
            user_id: data.userId,
            role: CompanyUserRole.STAFF,
            is_primary_contact: false,
        },
    });

    // Create StaffProfile
    return prisma.staffProfile.create({
        data: {
            company_id: data.companyId,
            user_id: data.userId,
            display_name: data.displayName,
            bio: data.bio,
            is_bookable: data.isBookable ?? true,
        },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                    first_name: true,
                    last_name: true,
                    phoneNumber: true,
                    phone_prefix: true,
                },
            },
        },
    });
}

/**
 * Update a staff profile
 */
export interface UpdateStaffData {
    display_name?: string;
    bio?: string;
    image_url?: string;
    is_bookable?: boolean;
}

export async function updateStaffProfile(id: number, companyId: number, data: UpdateStaffData) {
    return prisma.staffProfile.updateMany({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        data,
    });
}

/**
 * Get updated staff profile after update
 */
export async function getUpdatedStaffProfile(id: number, companyId: number) {
    return prisma.staffProfile.findFirst({
        where: {
            id,
            company_id: companyId,
        },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                    first_name: true,
                    last_name: true,
                    phoneNumber: true,
                    phone_prefix: true,
                },
            },
        },
    });
}

/**
 * Soft delete a staff profile
 */
export async function softDeleteStaffProfile(id: number, companyId: number) {
    // Soft delete the staff profile
    const staffResult = await prisma.staffProfile.updateMany({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        data: {
            deleted_at: new Date(),
        },
    });

    // Also soft delete the company user relation
    if (staffResult.count > 0) {
        const staff = await prisma.staffProfile.findUnique({
            where: { id },
            select: { user_id: true },
        });

        if (staff) {
            await prisma.companyUser.updateMany({
                where: {
                    user_id: staff.user_id,
                    company_id: companyId,
                    deleted_at: null,
                },
                data: {
                    deleted_at: new Date(),
                },
            });
        }
    }

    return staffResult;
}
