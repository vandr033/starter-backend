import { MensajeApi } from '../types/MensajeApi';
import * as Repo from '../repositories/super-admin-users.repo';
import { prisma } from '../prisma/client';
import { StaffProfileStatus } from '@prisma/client';

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

export async function deleteUserAccount(userId: string, actorUserId?: string): Promise<MensajeApi> {
    try {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
            return {
                code: 400,
                error: true,
                message: 'User id is required',
            };
        }

        if (actorUserId && normalizedUserId === actorUserId) {
            return {
                code: 400,
                error: true,
                message: 'You cannot delete your own super admin account',
            };
        }

        const user = await prisma.user.findUnique({
            where: { id: normalizedUserId },
            select: {
                id: true,
                email: true,
                phoneNumber: true,
                is_super_admin: true,
                deleted_at: true,
            },
        });

        if (!user || user.deleted_at) {
            return {
                code: 404,
                error: true,
                message: 'User not found',
            };
        }

        if (user.is_super_admin) {
            return {
                code: 400,
                error: true,
                message: 'Super admin accounts cannot be deleted from this screen',
            };
        }

        const deletedAt = new Date();
        const replacementEmail = `deleted+${user.id}@deleted.priconpri.local`;

        await prisma.$transaction(async (tx) => {
            await tx.companyUser.updateMany({
                where: {
                    user_id: user.id,
                    deleted_at: null,
                },
                data: {
                    deleted_at: deletedAt,
                },
            });

            await tx.staffProfile.updateMany({
                where: {
                    user_id: user.id,
                    deleted_at: null,
                },
                data: {
                    deleted_at: deletedAt,
                    status: StaffProfileStatus.INACTIVE,
                    is_bookable: false,
                    end_date: deletedAt,
                    invite_token: null,
                },
            });

            await tx.customerProfile.updateMany({
                where: {
                    user_id: user.id,
                    deleted_at: null,
                },
                data: {
                    deleted_at: deletedAt,
                },
            });

            await tx.session.deleteMany({
                where: { userId: user.id },
            });

            await tx.account.deleteMany({
                where: { userId: user.id },
            });

            await tx.user.update({
                where: { id: user.id },
                data: {
                    email: replacementEmail,
                    phoneNumber: null,
                    phoneNumberVerified: false,
                    emailVerified: false,
                    first_name: 'Deleted',
                    last_name: 'User',
                    name: `Deleted User ${user.id}`,
                    image: null,
                    is_active: false,
                    must_change_password: false,
                    deleted_at: deletedAt,
                },
            });

            const identifiers = [user.email, user.phoneNumber]
                .map((value) => (value || '').trim())
                .filter(Boolean);

            if (identifiers.length > 0) {
                await tx.verification.deleteMany({
                    where: {
                        identifier: { in: identifiers },
                    },
                });

                await tx.verificationCode.deleteMany({
                    where: {
                        identifier: { in: identifiers },
                    },
                });
            }
        });

        return {
            code: 200,
            error: false,
            message: 'User account deleted successfully',
        };
    } catch (error) {
        console.error('Error deleting user account:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to delete user account',
        };
    }
}
