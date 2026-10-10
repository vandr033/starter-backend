"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaffByCompany = getStaffByCompany;
exports.getStaffById = getStaffById;
exports.findUserByEmail = findUserByEmail;
exports.findUserByPhone = findUserByPhone;
exports.createInvitedUser = createInvitedUser;
exports.getCompanyUser = getCompanyUser;
exports.createStaffProfile = createStaffProfile;
exports.updateStaffProfile = updateStaffProfile;
exports.getUpdatedStaffProfile = getUpdatedStaffProfile;
exports.softDeleteStaffProfile = softDeleteStaffProfile;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const demo_operator_membership_service_1 = require("../services/demo-operator-membership.service");
/**
 * Get all staff profiles for a company
 */
async function getStaffByCompany(companyId) {
    return client_1.prisma.staffProfile.findMany({
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
async function getStaffById(id, companyId) {
    return client_1.prisma.staffProfile.findFirst({
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
            staff_services: {
                where: {
                    is_active: true,
                },
                select: {
                    service_id: true,
                },
            },
        },
    });
}
/**
 * Find user by email
 */
async function findUserByEmail(email) {
    return client_1.prisma.user.findUnique({
        where: {
            email,
            deleted_at: null,
        },
    });
}
/**
 * Find user by phone number
 */
async function findUserByPhone(phoneNumber) {
    return client_1.prisma.user.findUnique({
        where: {
            phoneNumber,
            deleted_at: null,
        },
    });
}
/**
 * Create a new user (simplified version for invitation)
 */
async function createInvitedUser(email, name, phone, phonePrefix) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const cleanPhonePrefix = (phonePrefix || '591').replace(/\D/g, '') || '591';
    return client_1.prisma.user.create({
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
async function getCompanyUser(userId, companyId) {
    return client_1.prisma.companyUser.findFirst({
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
async function createStaffProfile(data) {
    const companyRole = data.role ?? client_2.CompanyUserRole.STAFF;
    await (0, demo_operator_membership_service_1.assertDemoOperatorMayJoinCompany)(client_1.prisma, data.userId, data.companyId);
    // Check for soft-deleted CompanyUser and restore, or create new
    const deletedCompanyUser = await client_1.prisma.companyUser.findFirst({
        where: {
            user_id: data.userId,
            company_id: data.companyId,
            role: companyRole,
            deleted_at: { not: null },
        },
    });
    if (deletedCompanyUser) {
        await client_1.prisma.companyUser.update({
            where: { id: deletedCompanyUser.id },
            data: { deleted_at: null },
        });
    }
    else {
        await client_1.prisma.companyUser.create({
            data: {
                company_id: data.companyId,
                user_id: data.userId,
                role: companyRole,
                is_primary_contact: false,
            },
        });
    }
    // Check for soft-deleted StaffProfile and restore, or create new
    const deletedStaff = await client_1.prisma.staffProfile.findFirst({
        where: {
            company_id: data.companyId,
            user_id: data.userId,
            deleted_at: { not: null },
        },
    });
    if (deletedStaff) {
        await client_1.prisma.staffProfile.update({
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
        return client_1.prisma.staffProfile.findUnique({
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
        });
    }
    // Create new StaffProfile
    return client_1.prisma.staffProfile.create({
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
async function updateStaffProfile(id, companyId, data) {
    return client_1.prisma.staffProfile.updateMany({
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
async function getUpdatedStaffProfile(id, companyId) {
    return client_1.prisma.staffProfile.findFirst({
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
async function softDeleteStaffProfile(id, companyId) {
    // Soft delete the staff profile
    const staffResult = await client_1.prisma.staffProfile.updateMany({
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
        const staff = await client_1.prisma.staffProfile.findUnique({
            where: { id },
            select: { user_id: true },
        });
        if (staff) {
            await client_1.prisma.companyUser.updateMany({
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
