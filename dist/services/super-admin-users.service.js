"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllUsers = getAllUsers;
exports.deleteUserAccount = deleteUserAccount;
const Repo = __importStar(require("../repositories/super-admin-users.repo"));
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
async function getAllUsers(options) {
    try {
        const result = await Repo.getAllUsers(options);
        return {
            code: 200,
            error: false,
            message: 'Users retrieved successfully',
            data: result,
        };
    }
    catch (error) {
        console.error('Error getting all users:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve users',
        };
    }
}
async function deleteUserAccount(userId, actorUserId) {
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
        const user = await client_1.prisma.user.findUnique({
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
        await client_1.prisma.$transaction(async (tx) => {
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
                    status: client_2.StaffProfileStatus.INACTIVE,
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
                    phone_prefix: null,
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
    }
    catch (error) {
        console.error('Error deleting user account:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to delete user account',
        };
    }
}
