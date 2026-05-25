import { MensajeApi } from '../types/MensajeApi';
import * as StaffRepo from '../repositories/staff.repo';
import { prisma } from '../prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { CompanyUserRole } from '@prisma/client';
import { VerificationChannel, VerificationPurpose } from '../types/verification-enums';
import { generateNumericCode } from '../utils/verification';
import { sendStaffInviteEmail } from '../utils/sendEmail';
import { ensureDefaultStaffAvailabilityFromCompanyHours } from './staff-availability-defaults.service';
import { buildPhoneLookupCandidates } from '../repositories/user.repo';
import {
    buildStaffLimitReachedMessage,
    getStaffSeatUsageForCompany,
    isFeatureEnabledForCompany,
} from './plan-enforcement.service';
import { getCompanyEntitlements } from './company-entitlements.service';

interface StaffResult extends MensajeApi {
    data?: any;
}

export interface UpdateMyStaffProfileInput {
    display_name?: string;
    bio?: string;
    first_name?: string;
    last_name?: string;
    phoneNumber?: string;
    phonePrefix?: string;
}

function serializeStaff(staff: any) {
    return {
        id: staff.id,
        display_name: staff.display_name,
        bio: staff.bio ?? '',
        image_url: staff.image_url,
        is_bookable: staff.is_bookable,
        resource_type: staff.resource_type ?? 'PERSON',
        status: staff.status,
        start_date: staff.start_date,
        end_date: staff.end_date,
        created_at: staff.created_at,
        updated_at: staff.updated_at,
        user: staff.user,
        services: Array.isArray(staff.staff_services)
            ? staff.staff_services.map((staffService: { service_id: number }) => staffService.service_id)
            : [],
    };
}

/**
 * List all staff for a company
 */
export async function listStaff(companyId: number): Promise<StaffResult> {
    try {
        const staff = await StaffRepo.getStaffByCompany(companyId);
        const transformedStaff = staff.map(serializeStaff);

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
 * Get a single staff profile for a company
 */
export async function getStaff(companyId: number, staffId: number): Promise<StaffResult> {
    try {
        const staff = await StaffRepo.getStaffById(staffId, companyId);

        if (!staff) {
            return {
                code: 404,
                message: 'Staff not found',
                error: true,
            };
        }

        return {
            code: 200,
            message: 'Staff retrieved successfully',
            error: false,
            data: serializeStaff(staff),
        };
    } catch (error: any) {
        console.error('Error retrieving staff:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Get authenticated staff profile for a company
 */
export async function getMyProfile(companyId: number, userId: string): Promise<StaffResult> {
    try {
        const profile = await prisma.staffProfile.findFirst({
            where: {
                company_id: companyId,
                user_id: userId,
                deleted_at: null,
            },
            include: {
                staff_services: {
                    select: {
                        service_id: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        first_name: true,
                        last_name: true,
                        phoneNumber: true,
                        phone_prefix: true,
                        image: true,
                    },
                },
            },
        });

        if (!profile) {
            return {
                code: 404,
                message: 'Staff profile not found',
                error: true,
            };
        }

        return {
            code: 200,
            message: 'Staff profile retrieved successfully',
            error: false,
            data: serializeStaff(profile),
        };
    } catch (error: any) {
        console.error('Error retrieving staff self profile:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Update authenticated staff profile for a company
 */
export async function updateMyProfile(
    companyId: number,
    userId: string,
    input: UpdateMyStaffProfileInput
): Promise<StaffResult> {
    try {
        const existing = await prisma.staffProfile.findFirst({
            where: {
                company_id: companyId,
                user_id: userId,
                deleted_at: null,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        first_name: true,
                        last_name: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
            },
        });

        if (!existing) {
            return {
                code: 404,
                message: 'Staff profile not found',
                error: true,
            };
        }

        await prisma.$transaction(async (tx) => {
            const staffUpdates: Record<string, any> = {};
            if (input.display_name !== undefined) staffUpdates.display_name = input.display_name;
            if (input.bio !== undefined) staffUpdates.bio = input.bio;

            if (Object.keys(staffUpdates).length > 0) {
                await tx.staffProfile.update({
                    where: { id: existing.id },
                    data: staffUpdates,
                });
            }

            const shouldUpdateUserNames = input.first_name !== undefined || input.last_name !== undefined;
            const shouldUpdatePhone = input.phoneNumber !== undefined || input.phonePrefix !== undefined;
            if (shouldUpdateUserNames || shouldUpdatePhone) {
                const nextFirstName =
                    input.first_name !== undefined ? input.first_name : (existing.user.first_name || '');
                const nextLastName =
                    input.last_name !== undefined ? input.last_name : (existing.user.last_name || '');
                const normalizedFirst = nextFirstName.trim();
                const normalizedLast = nextLastName.trim();
                const nextFullName =
                    `${normalizedFirst} ${normalizedLast}`.trim() ||
                    existing.user.name ||
                    input.display_name ||
                    existing.display_name;

                let nextPhone = existing.user.phoneNumber || null;
                if (input.phoneNumber !== undefined) {
                    const cleanPhone = input.phoneNumber.replace(/\D/g, '');
                    nextPhone = cleanPhone.length > 0 ? cleanPhone : null;
                }

                let nextPhonePrefix = existing.user.phone_prefix || null;
                if (input.phonePrefix !== undefined) {
                    const cleanPrefix = input.phonePrefix.replace(/\D/g, '');
                    nextPhonePrefix = cleanPrefix.length > 0 ? cleanPrefix : null;
                }
                if (nextPhone && !nextPhonePrefix) {
                    nextPhonePrefix = '591';
                }

                if (nextPhone) {
                    const phoneCandidates = buildPhoneLookupCandidates(nextPhone, nextPhonePrefix || undefined);
                    const existingPhoneUser = phoneCandidates.length > 0
                        ? await tx.user.findFirst({
                            where: {
                                deleted_at: null,
                                phoneNumber: { in: phoneCandidates },
                            },
                            select: { id: true },
                        })
                        : null;
                    if (existingPhoneUser && existingPhoneUser.id !== existing.user_id) {
                        throw new Error('Phone number is already in use');
                    }
                }

                const phoneChanged = nextPhone !== (existing.user.phoneNumber || null);

                await tx.user.update({
                    where: { id: existing.user_id },
                    data: {
                        first_name: normalizedFirst || null,
                        last_name: normalizedLast || null,
                        name: nextFullName,
                        ...(shouldUpdatePhone ? { phoneNumber: nextPhone, phone_prefix: nextPhonePrefix } : {}),
                        ...(phoneChanged ? { phoneNumberVerified: false } : {}),
                    },
                });
            }
        });

        return await getMyProfile(companyId, userId);
    } catch (error: any) {
        if (error?.code === 'P2002' || String(error?.message || '').includes('Phone number is already in use')) {
            return {
                code: 400,
                message: 'Phone number is already in use',
                error: true,
            };
        }
        console.error('Error updating staff self profile:', error);
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
    role?: CompanyUserRole;
    phonePrefix?: string;
    phoneNumber?: string;
    bio?: string;
    is_bookable?: boolean;
    service_ids?: number[];
    start_date?: string;
    end_date?: string;
}

export async function createStaff(
    companyId: number,
    input: CreateStaffInput
): Promise<StaffResult> {
    try {
        const normalizedEmail = (input.email || '').trim().toLowerCase();
        const cleanPhone = (input.phoneNumber || '').replace(/\D/g, '');
        const cleanPhonePrefix = (input.phonePrefix || '591').replace(/\D/g, '') || '591';
        const seatUsage = await getStaffSeatUsageForCompany(companyId);
        const entitlements = await getCompanyEntitlements(companyId);
        const hasBookingModule =
            entitlements.productCapabilities.RESERVAS_BASE === true ||
            entitlements.productCapabilities.RESERVAS_PRO === true;
        const requestedRole = input.role ?? CompanyUserRole.STAFF;
        const role = hasBookingModule ? requestedRole : CompanyUserRole.STAFF;
        const canUseRolesPermissions = hasBookingModule
            ? await isFeatureEnabledForCompany(companyId, 'ROLES_PERMISSIONS')
            : false;

        if (!normalizedEmail) {
            return {
                code: 400,
                message: 'Staff must have at least one contact method (email or phone)',
                error: true,
            };
        }

        if (
            requestedRole !== CompanyUserRole.OWNER &&
            requestedRole !== CompanyUserRole.ADMIN &&
            requestedRole !== CompanyUserRole.STAFF
        ) {
            return {
                code: 400,
                message: 'Role must be OWNER, ADMIN or STAFF',
                error: true,
            };
        }

        if (hasBookingModule && !canUseRolesPermissions && role !== CompanyUserRole.STAFF) {
            return {
                code: 403,
                message: 'Available on the Business plan',
                error: true,
            };
        }


        // Find or create user
        let user = await StaffRepo.findUserByEmail(normalizedEmail);
        const userByPhone = cleanPhone ? await StaffRepo.findUserByPhone(cleanPhone) : null;

        if (!user && userByPhone) {
            return {
                code: 400,
                message: 'Phone number is already in use by another user',
                error: true,
            };
        }

        if (!user) {
            // Create new user for invitation
            user = await StaffRepo.createInvitedUser(
                normalizedEmail,
                input.display_name,
                cleanPhone,
                cleanPhonePrefix,
            );
        } else if (cleanPhone && !user.phoneNumber) {
            if (userByPhone && userByPhone.id !== user.id) {
                return {
                    code: 400,
                    message: 'Phone number is already in use by another user',
                    error: true,
                };
            }

            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    phoneNumber: cleanPhone,
                    phone_prefix: cleanPhonePrefix,
                },
            });
        }

        const hasReachableContact = Boolean(user.email?.trim()) || Boolean(user.phoneNumber?.trim());
        if (!hasReachableContact) {
            return {
                code: 400,
                message: 'Staff must have at least one contact method (email or phone)',
                error: true,
            };
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

        if (
            seatUsage.maxStaffMembers !== null &&
            seatUsage.currentStaffMembers >= seatUsage.maxStaffMembers
        ) {
            return {
                code: 403,
                message: buildStaffLimitReachedMessage(),
                error: true,
                data: {
                    currentPlan: seatUsage.currentPlan,
                    currentStaffMembers: seatUsage.currentStaffMembers,
                    maxStaffMembers: seatUsage.maxStaffMembers,
                },
            };
        }

        // Generate invite token
        const inviteToken = crypto.randomBytes(32).toString('hex');

        // Create staff profile with PENDING status
        const staff = await StaffRepo.createStaffProfile({
            companyId,
            userId: user.id,
            displayName: input.display_name,
            bio: input.bio ?? '',
            isBookable: false, // Not bookable until they accept the invite
            role,
            status: 'PENDING',
            inviteToken,
            startDate: input.start_date ? new Date(input.start_date) : undefined,
            endDate: input.end_date ? new Date(input.end_date) : undefined,
        });

        if (hasBookingModule) {
            await ensureDefaultStaffAvailabilityFromCompanyHours({
                companyId,
                staffId: staff.id,
            });
        }

        // Assign services if provided
        if (input.service_ids && input.service_ids.length > 0) {
            await assignServicesToStaff(companyId, staff.id, input.service_ids);
        }

        // Generate OTP and store verification code
        const otp = generateNumericCode();
        const codeHash = await bcrypt.hash(otp, 10);

        await prisma.verificationCode.create({
            data: {
                channel: VerificationChannel.EMAIL,
                purpose: VerificationPurpose.STAFF_INVITE,
                identifier: normalizedEmail,
                code_hash: codeHash,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours for invite
            },
        });

        // Get company name for email
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { name: true },
        });

        // Send invite email
        const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/staff/invite/${inviteToken}`;
        await sendStaffInviteEmail(normalizedEmail, otp, inviteLink, company?.name || 'Our Company');

        // Get the complete staff profile with services
        const completeStaff = await StaffRepo.getStaffById(staff.id, companyId);

        return {
            code: 201,
            message: 'Staff created and invite sent successfully',
            error: false,
            data: completeStaff ? { ...completeStaff, bio: completeStaff.bio ?? '' } : completeStaff,
        };
    } catch (error: any) {
        console.error('Error creating staff:', error);

        // Handle unique constraint violation
        if (error.code === 'P2002') {
            const target = String(error?.meta?.target || '');
            if (target.includes('phoneNumber') || target.includes('User_phoneNumber_key')) {
                return {
                    code: 400,
                    message: 'Phone number is already in use by another user',
                    error: true,
                };
            }

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
 * Resend invitation email for a pending staff profile
 */
export async function resendStaffInvite(
    companyId: number,
    staffId: number
): Promise<StaffResult> {
    try {
        const staff = await prisma.staffProfile.findFirst({
            where: {
                id: staffId,
                company_id: companyId,
                deleted_at: null,
            },
            select: {
                id: true,
                invite_token: true,
                status: true,
                user: {
                    select: {
                        email: true,
                    },
                },
                company: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        if (!staff) {
            return {
                code: 404,
                message: 'Staff not found',
                error: true,
            };
        }

        if (staff.status !== 'PENDING') {
            return {
                code: 400,
                message: 'Invitation can only be resent for pending staff',
                error: true,
            };
        }

        const normalizedEmail = (staff.user.email || '').trim().toLowerCase();
        if (!normalizedEmail) {
            return {
                code: 400,
                message: 'Pending staff user has no email to receive invitation',
                error: true,
            };
        }

        const inviteToken = staff.invite_token || crypto.randomBytes(32).toString('hex');
        const otp = generateNumericCode();
        const codeHash = await bcrypt.hash(otp, 10);
        const now = new Date();

        await prisma.$transaction(async (tx) => {
            if (!staff.invite_token) {
                await tx.staffProfile.update({
                    where: { id: staff.id },
                    data: { invite_token: inviteToken },
                });
            }

            await tx.verificationCode.updateMany({
                where: {
                    identifier: normalizedEmail,
                    channel: VerificationChannel.EMAIL,
                    purpose: VerificationPurpose.STAFF_INVITE,
                    consumed_at: null,
                },
                data: {
                    consumed_at: now,
                },
            });

            await tx.verificationCode.create({
                data: {
                    channel: VerificationChannel.EMAIL,
                    purpose: VerificationPurpose.STAFF_INVITE,
                    identifier: normalizedEmail,
                    code_hash: codeHash,
                    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
                },
            });
        });

        const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/staff/invite/${inviteToken}`;
        const emailStatus = await sendStaffInviteEmail(
            normalizedEmail,
            otp,
            inviteLink,
            staff.company.name || 'Our Company'
        );

        if (emailStatus !== 1) {
            return {
                code: 500,
                message: 'Failed to send invitation email',
                error: true,
            };
        }

        return {
            code: 200,
            message: 'Invitation resent successfully',
            error: false,
        };
    } catch (error: any) {
        console.error('Error resending staff invite:', error);
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
    email?: string;
    phoneNumber?: string;
    phonePrefix?: string;
    display_name?: string;
    bio?: string;
    image_url?: string;
    is_bookable?: boolean;
    resource_type?: 'PERSON' | 'ROOM' | 'EQUIPMENT';
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

        const normalizedEmail = input.email !== undefined ? input.email.trim().toLowerCase() : undefined;
        const cleanPhone = input.phoneNumber !== undefined ? input.phoneNumber.replace(/\D/g, '') : undefined;
        const cleanPhonePrefix = input.phonePrefix !== undefined
            ? input.phonePrefix.replace(/\D/g, '')
            : undefined;

        await prisma.$transaction(async (tx) => {
            if (normalizedEmail !== undefined) {
                const existingEmailUser = normalizedEmail
                    ? await tx.user.findFirst({
                        where: {
                            deleted_at: null,
                            email: normalizedEmail,
                        },
                        select: { id: true },
                    })
                    : null;

                if (existingEmailUser && existingEmailUser.id !== existing.user?.id) {
                    throw new Error('Email is already in use');
                }
            }

            const nextPhone = cleanPhone !== undefined
                ? (cleanPhone.length > 0 ? cleanPhone : null)
                : (existing.user?.phoneNumber || null);
            let nextPhonePrefix = cleanPhonePrefix !== undefined
                ? (cleanPhonePrefix.length > 0 ? cleanPhonePrefix : null)
                : (existing.user?.phone_prefix || null);

            if (nextPhone && !nextPhonePrefix) {
                nextPhonePrefix = '591';
            }

            if (nextPhone) {
                const phoneCandidates = buildPhoneLookupCandidates(nextPhone, nextPhonePrefix || undefined);
                const existingPhoneUser = phoneCandidates.length > 0
                    ? await tx.user.findFirst({
                        where: {
                            deleted_at: null,
                            phoneNumber: { in: phoneCandidates },
                        },
                        select: { id: true },
                    })
                    : null;

                if (existingPhoneUser && existingPhoneUser.id !== existing.user?.id) {
                    throw new Error('Phone number is already in use');
                }
            }

            if (normalizedEmail !== undefined || cleanPhone !== undefined || cleanPhonePrefix !== undefined) {
                const existingUser = existing.user;

                if (!existingUser?.id) {
                    throw new Error('Staff user not found');
                }

                const nextEmail = normalizedEmail !== undefined
                    ? normalizedEmail
                    : existingUser.email;
                const emailChanged = nextEmail !== existingUser.email;
                const phoneChanged =
                    nextPhone !== (existingUser.phoneNumber || null) ||
                    nextPhonePrefix !== (existingUser.phone_prefix || null);

                await tx.user.update({
                    where: { id: existingUser.id },
                    data: {
                        ...(normalizedEmail !== undefined
                            ? {
                                email: nextEmail,
                                ...(emailChanged ? { emailVerified: false } : {}),
                            }
                            : {}),
                        ...(cleanPhone !== undefined || cleanPhonePrefix !== undefined
                            ? {
                                phoneNumber: nextPhone,
                                phone_prefix: nextPhonePrefix,
                                ...(phoneChanged ? { phoneNumberVerified: false } : {}),
                            }
                            : {}),
                    },
                });
            }

            await StaffRepo.updateStaffProfile(staffId, companyId, {
                display_name: input.display_name,
                bio: input.bio,
                image_url: input.image_url,
                is_bookable: input.is_bookable,
                resource_type: input.resource_type,
            });
        });

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
            data: updated ? { ...updated, bio: updated.bio ?? '' } : updated,
        };
    } catch (error: any) {
        if (error?.code === 'P2002') {
            const target = String(error?.meta?.target || '');
            if (target.includes('email')) {
                return {
                    code: 400,
                    message: 'Email is already in use',
                    error: true,
                };
            }
            if (target.includes('phoneNumber')) {
                return {
                    code: 400,
                    message: 'Phone number is already in use',
                    error: true,
                };
            }
        }
        if (String(error?.message || '').includes('Email is already in use')) {
            return {
                code: 400,
                message: 'Email is already in use',
                error: true,
            };
        }
        if (String(error?.message || '').includes('Phone number is already in use')) {
            return {
                code: 400,
                message: 'Phone number is already in use',
                error: true,
            };
        }
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
