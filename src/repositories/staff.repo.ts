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
 * Find user by phone number
 */
export async function findUserByPhone(phoneNumber: string) {
    return prisma.user.findUnique({
        where: {
            phoneNumber,
            deleted_at: null,
        },
    });
}

/**
 * Create a new user (simplified version for invitation)
 */
export async function createInvitedUser(
    email: string,
    name?: string,
    phone?: string,
    phonePrefix?: string,
) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const cleanPhonePrefix = (phonePrefix || '591').replace(/\D/g, '') || '591';

    return prisma.user.create({
        data: {
            email,
            name: name || email.split('@')[0],
            emailVerified: false,
            is_active: true,
            phoneNumber: cleanPhone || undefined,
            phone_prefix: cleanPhone ? cleanPhonePrefix : undefined,
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
    role?: CompanyUserRole;
    status?: 'PENDING' | 'ACTIVE' | 'INACTIVE';
    inviteToken?: string;
    startDate?: Date;
    endDate?: Date;
}) {
    const companyRole = data.role ?? CompanyUserRole.STAFF;

    // Check for soft-deleted CompanyUser and restore, or create new
    const deletedCompanyUser = await prisma.companyUser.findFirst({
        where: {
            user_id: data.userId,
            company_id: data.companyId,
            role: companyRole,
            deleted_at: { not: null },
        },
    });

    if (deletedCompanyUser) {
        await prisma.companyUser.update({
            where: { id: deletedCompanyUser.id },
            data: { deleted_at: null },
        });
    } else {
        await prisma.companyUser.create({
            data: {
                company_id: data.companyId,
                user_id: data.userId,
                role: companyRole,
                is_primary_contact: false,
            },
        });
    }

    // Check for soft-deleted StaffProfile and restore, or create new
    const deletedStaff = await prisma.staffProfile.findFirst({
        where: {
            company_id: data.companyId,
            user_id: data.userId,
            deleted_at: { not: null },
        },
    });

    if (deletedStaff) {
        await prisma.staffProfile.update({
            where: { id: deletedStaff.id },
            data: {
                display_name: data.displayName,
                bio: data.bio ?? '',
                is_bookable: data.isBookable ?? true,
                status: data.status || 'ACTIVE',
                invite_token: data.inviteToken,
                start_date: data.startDate,
                end_date: data.endDate,
                deleted_at: null,
            },
        });

        return prisma.staffProfile.findUnique({
            where: { id: deletedStaff.id },
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
        }) as any;
    }

    // Create new StaffProfile
    return prisma.staffProfile.create({
        data: {
            company_id: data.companyId,
            user_id: data.userId,
            display_name: data.displayName,
            bio: data.bio ?? '',
            is_bookable: data.isBookable ?? true,
            status: data.status || 'ACTIVE',
            invite_token: data.inviteToken,
            start_date: data.startDate,
            end_date: data.endDate,
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
    resource_type?: 'PERSON' | 'ROOM' | 'EQUIPMENT';
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
