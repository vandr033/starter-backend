import { prisma } from '../prisma/client';
import { getAuth } from '../config/auth';
import { MensajeApi } from '../types/MensajeApi';
import { CompanyUserRole, ShopPlan } from '@prisma/client';
import { VerificationChannel, VerificationPurpose } from '../types/verification-enums';
import bcrypt from 'bcryptjs';
import { generateNumericCode } from '../utils/otp';
import { sendEmailCode } from '../utils/sendEmail';
import { getCompanyCapabilitiesPayload, type CompanyCapabilitiesPayload } from '../config/plan-capabilities';

export type AdminCompanyUserSummary = {
    id: number;
    company_id: number;
    role: CompanyUserRole;
    is_primary_contact: boolean;
    company?: {
        id: number;
        name: string;
        slug: string;
        currency: string;
        plan: ShopPlan;
        capabilities: CompanyCapabilitiesPayload;
        availableUntil: Date;
        default_language: string;
    };
};

const DEFAULT_LANGUAGE_KEY = 'default_language';
const FALLBACK_DEFAULT_LANGUAGE = 'es';

interface AdminSignInResult extends MensajeApi {
    data?: {
        user: any;
        session: any;
        companyUser: AdminCompanyUserSummary | null;
        companyUsers: AdminCompanyUserSummary[];
        activeCompanyId: number | null;
    };
    cookies?: string[]; // All Set-Cookie headers to forward
}

const ADMIN_ALLOWED_ROLES: CompanyUserRole[] = [
    CompanyUserRole.OWNER,
    CompanyUserRole.ADMIN,
    CompanyUserRole.STAFF,
];

const RESET_CODE_TTL_MINUTES = 15;

async function getAdminCompanyUsers(userId: string) {
    return prisma.companyUser.findMany({
        where: {
            user_id: userId,
            deleted_at: null,
            role: {
                in: ADMIN_ALLOWED_ROLES,
            },
        },
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    currency: true,
                    plan: true,
                    availableUntil: true,
                    config_messages: {
                        where: {
                            key: DEFAULT_LANGUAGE_KEY,
                        },
                        select: {
                            value: true,
                        },
                        take: 1,
                    },
                },
            },
        },
        orderBy: [
            { role: 'asc' },
            { updated_at: 'desc' },
        ],
    });
}

function toAdminCompanyUserSummary(companyUser: Awaited<ReturnType<typeof getAdminCompanyUsers>>[number]): AdminCompanyUserSummary {
    const defaultLanguage =
        companyUser.company?.config_messages?.[0]?.value?.trim().toLowerCase() || FALLBACK_DEFAULT_LANGUAGE;

    return {
        id: companyUser.id,
        company_id: companyUser.company_id,
        role: companyUser.role,
        is_primary_contact: companyUser.is_primary_contact,
        company: companyUser.company
            ? {
                id: companyUser.company.id,
                name: companyUser.company.name,
                slug: companyUser.company.slug,
                currency: companyUser.company.currency,
                plan: companyUser.company.plan,
                capabilities: getCompanyCapabilitiesPayload(companyUser.company.plan),
                availableUntil: companyUser.company.availableUntil,
                default_language: defaultLanguage,
            }
            : undefined,
    };
}

function resolveActiveCompanyUser(
    companyUsers: AdminCompanyUserSummary[],
    preferredCompanyId?: number | null,
): AdminCompanyUserSummary | null {
    if (companyUsers.length === 0) return null;
    if (preferredCompanyId) {
        const preferred = companyUsers.find((companyUser) => companyUser.company_id === preferredCompanyId);
        if (preferred) return preferred;
    }
    return companyUsers[0] ?? null;
}

async function hasAdminDashboardAccess(userId: string): Promise<boolean> {
    const companyUser = await prisma.companyUser.findFirst({
        where: {
            user_id: userId,
            deleted_at: null,
            role: {
                in: ADMIN_ALLOWED_ROLES,
            },
        },
        select: { id: true },
    });
    return Boolean(companyUser);
}

function isInvalidCredentialsError(error: unknown): boolean {
    const message = String(
        (error as any)?.message ??
        (error as any)?.toString?.() ??
        ''
    ).toLowerCase();

    return (
        message.includes('invalid password') ||
        message.includes('invalid credentials') ||
        message.includes('credential account not found')
    );
}

/**
 * Sign in an admin user (must have a CompanyUser record)
 */
export async function signInAdmin(
    email: string,
    password: string,
    reqHeaders: any
): Promise<AdminSignInResult> {
    try {
        const auth = await getAuth();
        // 1. Authenticate via Better Auth
        const signInResponse = await auth.api.signInEmail({
            body: { email, password },
            headers: reqHeaders,
            asResponse: true,
        });

        if (!signInResponse.ok) {
            let message = 'Invalid credentials';
            try {
                const payload = await signInResponse.json();
                if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
                    message = payload.message;
                }
            } catch {
                // Keep default message
            }
            return {
                code: 401,
                message,
                error: true,
            };
        }

        // Get ALL Set-Cookie headers to forward to client
        const setCookies = signInResponse.headers.getSetCookie?.() || [];
        // Fallback to headers.get if getSetCookie is not available
        if (setCookies.length === 0) {
            const singleCookie = signInResponse.headers.get('set-cookie');
            if (singleCookie) setCookies.push(singleCookie);
        }

        // Parse the response to get session info
        const signInData = await signInResponse.json();

        // 2. Get session to retrieve user info
        const sessionHeaders = new Headers(reqHeaders);
        if (setCookies.length > 0) {
            sessionHeaders.set('cookie', setCookies.join('; '));
        }

        const session = await auth.api.getSession({
            headers: sessionHeaders,
        });

        if (!session || !session.user) {
            return {
                code: 401,
                message: 'Could not retrieve session',
                error: true,
            };
        }

        // 3. Get full user data from database
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                first_name: true,
                last_name: true,
                image: true,
                is_super_admin: true,
                emailVerified: true,
                phoneNumber: true,
                phoneNumberVerified: true,
                must_change_password: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            return {
                code: 404,
                message: 'User not found',
                error: true,
            };
        }

        // 4. Resolve memberships (multi-shop support)
        const companyUsers = (await getAdminCompanyUsers(session.user.id)).map(toAdminCompanyUserSummary);

        if (companyUsers.length === 0 && !user.is_super_admin) {
            return {
                code: 403,
                message: 'User does not have admin access to any company',
                error: true,
            };
        }

        const activeCompanyUser = resolveActiveCompanyUser(companyUsers);

        return {
            code: 200,
            message: 'Admin sign-in successful',
            error: false,
            data: {
                user: user,
                session: {
                    ...signInData.session,
                    token: signInData.token,
                },
                companyUser: activeCompanyUser,
                companyUsers,
                activeCompanyId: activeCompanyUser?.company_id ?? null,
            },
            cookies: setCookies.length > 0 ? setCookies : undefined,
        };
    } catch (error: any) {
        if (isInvalidCredentialsError(error)) {
            return {
                code: 401,
                message: 'Invalid credentials',
                error: true,
            };
        }
        console.error('Admin sign-in error:', error);
        return {
            code: 500,
            message: 'Internal server error during sign-in',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Get admin session with company context
 */
export async function getAdminSessionData(
    userId: string,
    preferredCompanyId?: number | null,
): Promise<AdminSignInResult> {
    try {
        // Get user from database
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                first_name: true,
                last_name: true,
                image: true,
                is_super_admin: true,
                must_change_password: true,
            },
        });

        if (!user) {
            return {
                code: 404,
                message: 'User not found',
                error: true,
            };
        }

        // Resolve memberships (multi-shop support)
        const companyUsers = (await getAdminCompanyUsers(userId)).map(toAdminCompanyUserSummary);
        const activeCompanyUser = resolveActiveCompanyUser(companyUsers, preferredCompanyId);

        if (companyUsers.length === 0 && !user.is_super_admin) {
            return {
                code: 403,
                message: 'User does not have admin access to any company',
                error: true,
            };
        }

        return {
            code: 200,
            message: 'Session retrieved successfully',
            error: false,
            data: {
                user,
                session: null, // Session already validated by middleware
                companyUser: activeCompanyUser,
                companyUsers,
                activeCompanyId: activeCompanyUser?.company_id ?? null,
            },
        };
    } catch (error: any) {
        console.error('Get admin session error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

export async function switchActiveShop(userId: string, companyId: number): Promise<MensajeApi> {
    try {
        const companyUsers = (await getAdminCompanyUsers(userId)).map(toAdminCompanyUserSummary);

        const selected = companyUsers.find((companyUser) => companyUser.company_id === companyId);
        if (!selected) {
            return {
                code: 403,
                message: 'You do not belong to this shop',
                error: true,
            };
        }

        return {
            code: 200,
            error: false,
            message: 'Active shop updated',
            data: {
                companyUser: selected,
                companyUsers,
                activeCompanyId: selected.company_id,
            },
        };
    } catch (error: any) {
        console.error('Switch active shop error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

interface ChangePasswordResult extends MensajeApi {}

export async function changeAdminPassword(
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<ChangePasswordResult> {
    try {
        const canUseAdminDashboardAuth = await hasAdminDashboardAccess(userId);
        if (!canUseAdminDashboardAuth) {
            return {
                code: 403,
                message: 'User does not have admin dashboard access',
                error: true,
            };
        }

        const credentialAccount = await prisma.account.findFirst({
            where: {
                userId,
                providerId: { in: ['credential', 'credentials'] },
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        if (!credentialAccount || !credentialAccount.password) {
            return {
                code: 400,
                message: 'Credential account not found for this user',
                error: true,
            };
        }

        const matches = await bcrypt.compare(currentPassword, credentialAccount.password);
        if (!matches) {
            return {
                code: 400,
                message: 'Current password is incorrect',
                error: true,
            };
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.$transaction([
            prisma.account.updateMany({
                where: {
                    userId,
                    providerId: { in: ['credential', 'credentials'] },
                },
                data: {
                    providerId: 'credential',
                    password: hashedPassword,
                },
            }),
            prisma.user.update({
                where: { id: userId },
                data: {
                    must_change_password: false,
                },
            }),
        ]);

        return {
            code: 200,
            message: 'Password updated successfully',
            error: false,
        };
    } catch (error: any) {
        console.error('Change admin password error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

interface AdminPasswordResetResult extends MensajeApi {}

export async function startAdminPasswordReset(email: string): Promise<AdminPasswordResetResult> {
    try {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
            return {
                code: 400,
                message: 'Email is required',
                error: true,
            };
        }

        // Always return a generic success to avoid user enumeration.
        const successMessage: AdminPasswordResetResult = {
            code: 200,
            message: 'If the account exists, a reset code has been sent',
            error: false,
        };

        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: {
                id: true,
            },
        });

        if (!user) {
            return successMessage;
        }

        const hasDashboardAccess = await hasAdminDashboardAccess(user.id);
        if (!hasDashboardAccess) {
            return successMessage;
        }

        const credentialAccount = await prisma.account.findFirst({
            where: {
                userId: user.id,
                providerId: { in: ['credential', 'credentials'] },
            },
            select: { id: true },
        });

        if (!credentialAccount) {
            return successMessage;
        }

        const code = generateNumericCode(6);
        const codeHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000);

        await prisma.verificationCode.create({
            data: {
                channel: VerificationChannel.EMAIL,
                purpose: VerificationPurpose.LOGIN,
                identifier: normalizedEmail,
                code_hash: codeHash,
                expires_at: expiresAt,
            },
        });

        const sent = await sendEmailCode(normalizedEmail, code);
        if (sent === -1) {
            return {
                code: 500,
                message: 'Failed to send reset code',
                error: true,
            };
        }

        return successMessage;
    } catch (error: any) {
        console.error('Start admin password reset error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error?.toString(),
        };
    }
}

export async function completeAdminPasswordReset(
    email: string,
    code: string,
    newPassword: string
): Promise<AdminPasswordResetResult> {
    try {
        const normalizedEmail = email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: {
                id: true,
            },
        });

        if (!user) {
            return {
                code: 400,
                message: 'Invalid or expired verification code',
                error: true,
            };
        }

        const hasDashboardAccess = await hasAdminDashboardAccess(user.id);
        if (!hasDashboardAccess) {
            return {
                code: 403,
                message: 'User does not have admin dashboard access',
                error: true,
            };
        }

        const credentialAccount = await prisma.account.findFirst({
            where: {
                userId: user.id,
                providerId: { in: ['credential', 'credentials'] },
            },
            select: { id: true },
        });

        if (!credentialAccount) {
            return {
                code: 400,
                message: 'Credential account not found for this user',
                error: true,
            };
        }

        const verification = await prisma.verificationCode.findFirst({
            where: {
                channel: VerificationChannel.EMAIL,
                purpose: VerificationPurpose.LOGIN,
                identifier: normalizedEmail,
                consumed_at: null,
                expires_at: { gt: new Date() },
            },
            orderBy: { created_at: 'desc' },
        });

        if (!verification) {
            return {
                code: 400,
                message: 'Invalid or expired verification code',
                error: true,
            };
        }

        if (verification.attempts >= verification.max_attempts) {
            return {
                code: 400,
                message: 'Too many attempts. Request a new code.',
                error: true,
            };
        }

        const isCodeValid = await bcrypt.compare(code, verification.code_hash);

        await prisma.verificationCode.update({
            where: { id: verification.id },
            data: {
                attempts: verification.attempts + 1,
                consumed_at: isCodeValid ? new Date() : verification.consumed_at,
            },
        });

        if (!isCodeValid) {
            return {
                code: 400,
                message: 'Invalid or expired verification code',
                error: true,
            };
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.$transaction([
            prisma.account.updateMany({
                where: {
                    userId: user.id,
                    providerId: { in: ['credential', 'credentials'] },
                },
                data: {
                    providerId: 'credential',
                    password: hashedPassword,
                },
            }),
            prisma.user.update({
                where: { id: user.id },
                data: {
                    must_change_password: false,
                },
            }),
        ]);

        return {
            code: 200,
            message: 'Password reset successfully',
            error: false,
        };
    } catch (error: any) {
        console.error('Complete admin password reset error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error?.toString(),
        };
    }
}
