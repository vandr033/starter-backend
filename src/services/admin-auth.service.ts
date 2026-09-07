import { prisma } from '../prisma/client';
import { getAuth } from '../config/auth';
import { MensajeApi } from '../types/MensajeApi';
import { CompanyUserRole, ShopPlan } from '@prisma/client';
import { VerificationChannel, VerificationPurpose } from '../types/verification-enums';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { generateNumericCode } from '../utils/otp';
import { sendEmailCode } from '../utils/sendEmail';
import {
    getCompanyEntitlements,
} from './company-entitlements.service';
import type { CompanyEntitlementPayload } from '../config/product-entitlements';
import {
    resolveEffectiveCompanyAccess,
    type EffectiveCompanyAccess,
} from './company-access.service';
import { logger } from '../config/logger';
import {
    BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
    BETTER_AUTH_CREDENTIAL_PROVIDER_IDS,
} from '../config/auth-constants';

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
        capabilities: CompanyEntitlementPayload;
        effectiveAccess: EffectiveCompanyAccess;
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

type AdminSignInRequestContext = {
    method?: string;
    path?: string;
    origin?: string | null;
    referer?: string | null;
    userAgent?: string | null;
};

function getHeaderValue(headers: any, name: string): string | null {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);

    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) return value[0] ?? null;
    return typeof value === 'string' ? value : null;
}

function summarizeDatabaseTarget() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) return { configured: false };

    try {
        const databaseUrl = new URL(rawUrl);
        return {
            configured: true,
            protocol: databaseUrl.protocol,
            host: databaseUrl.hostname,
            port: databaseUrl.port || null,
            database: databaseUrl.pathname.replace(/^\//, '') || null,
        };
    } catch {
        return { configured: true, parseable: false };
    }
}

function summarizeError(error: unknown) {
    const candidate = error as { name?: unknown; message?: unknown; stack?: unknown } | null;
    return {
        name: typeof candidate?.name === 'string' ? candidate.name : undefined,
        message: typeof candidate?.message === 'string' ? candidate.message : String(error),
        stack: typeof candidate?.stack === 'string' ? candidate.stack : undefined,
    };
}

function summarizeCookieHeaders(cookies: string[]) {
    return cookies.map((cookie) => {
        const firstSegment = cookie.split(';', 1)[0] ?? '';
        return firstSegment.split('=', 1)[0] || 'unknown';
    });
}

function summarizeAuthConfig() {
    return {
        nodeEnv: process.env.NODE_ENV ?? null,
        baseURL: process.env.BASE_URL || 'http://localhost:3001 (default)',
        betterAuthUrlConfigured: Boolean(process.env.BETTER_AUTH_URL),
        frontendURL: process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || null,
        trustedOriginsConfigured: Boolean(
            process.env.TRUSTED_ORIGINS || process.env.BETTER_AUTH_TRUSTED_ORIGINS,
        ),
        database: summarizeDatabaseTarget(),
    };
}

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

async function toAdminCompanyUserSummary(
    companyUser: Awaited<ReturnType<typeof getAdminCompanyUsers>>[number],
): Promise<AdminCompanyUserSummary> {
    const defaultLanguage =
        companyUser.company?.config_messages?.[0]?.value?.trim().toLowerCase() || FALLBACK_DEFAULT_LANGUAGE;
    const effectiveAccess = companyUser.company
        ? await resolveEffectiveCompanyAccess({
            companyId: companyUser.company.id,
            userId: companyUser.user_id,
            role: companyUser.role,
        })
        : null;

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
                capabilities: effectiveAccess?.entitlements ?? await getCompanyEntitlements(companyUser.company.id),
                effectiveAccess: effectiveAccess!,
                availableUntil: companyUser.company.availableUntil,
                default_language: defaultLanguage,
            }
            : undefined,
    };
}

export function resolveActiveCompanyUser(
    companyUsers: AdminCompanyUserSummary[],
    preferredCompanyId?: number | null,
): AdminCompanyUserSummary | null {
    if (companyUsers.length === 0) return null;
    if (preferredCompanyId !== undefined && preferredCompanyId !== null) {
        const preferred = companyUsers.find((companyUser) => companyUser.company_id === preferredCompanyId);
        if (preferred) return preferred;
        // An explicit but stale/invalid context must not silently turn into a
        // different company. The restaurant middleware reports the precise
        // invalid-context reason; the session endpoint simply exposes no
        // active company so callers can ask the user to select one again.
        return null;
    }
    // A single membership is unambiguous. With multiple memberships the user
    // must select the company explicitly; ordering memberships is not a
    // security boundary and must never seed Restaurant Lite scope.
    return companyUsers.length === 1 ? companyUsers[0] : null;
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
    reqHeaders: any,
    requestContext?: AdminSignInRequestContext,
): Promise<AdminSignInResult> {
    const traceId = randomUUID();
    const startedAt = Date.now();
    const inputEmail = typeof email === 'string' ? email : String(email ?? '');
    const normalizedEmail = inputEmail.trim().toLowerCase();
    const passwordLength = typeof password === 'string' ? password.length : 0;

    try {
        logger.info({
            event: 'admin_sign_in_started',
            traceId,
            email: normalizedEmail,
            inputEmailLength: inputEmail.length,
            normalizedEmailLength: normalizedEmail.length,
            emailWasTrimmed: inputEmail !== inputEmail.trim(),
            passwordProvided: passwordLength > 0,
            passwordLength,
            request: {
                method: requestContext?.method ?? null,
                path: requestContext?.path ?? null,
                origin: requestContext?.origin ?? getHeaderValue(reqHeaders, 'origin'),
                referer: requestContext?.referer ?? getHeaderValue(reqHeaders, 'referer'),
                userAgent: requestContext?.userAgent ?? getHeaderValue(reqHeaders, 'user-agent'),
                host: getHeaderValue(reqHeaders, 'host'),
                contentType: getHeaderValue(reqHeaders, 'content-type'),
                cookiePresent: Boolean(getHeaderValue(reqHeaders, 'cookie')),
                authorizationPresent: Boolean(getHeaderValue(reqHeaders, 'authorization')),
            },
            authConfig: summarizeAuthConfig(),
        }, 'Admin sign-in: request received');

        const preAuthUser = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: {
                id: true,
                email: true,
                is_super_admin: true,
                is_active: true,
                deleted_at: true,
                emailVerified: true,
                must_change_password: true,
                accounts: {
                    where: { providerId: { in: [...BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] } },
                    select: {
                        id: true,
                        providerId: true,
                        accountId: true,
                        password: true,
                    },
                },
            },
        });

        logger.info({
            event: 'admin_sign_in_database_identity_check',
            traceId,
            email: normalizedEmail,
            userFound: Boolean(preAuthUser),
            userId: preAuthUser?.id ?? null,
            databaseEmail: preAuthUser?.email ?? null,
            isSuperAdmin: preAuthUser?.is_super_admin ?? null,
            isActive: preAuthUser?.is_active ?? null,
            deletedAt: preAuthUser?.deleted_at ?? null,
            emailVerified: preAuthUser?.emailVerified ?? null,
            mustChangePassword: preAuthUser?.must_change_password ?? null,
            credentialAccounts: preAuthUser?.accounts.map((account) => ({
                id: account.id,
                providerId: account.providerId,
                accountId: account.accountId,
                passwordPresent: Boolean(account.password),
                passwordLength: account.password?.length ?? 0,
            })) ?? [],
        }, 'Admin sign-in: direct Prisma identity check completed');

        logger.info({
            event: 'admin_sign_in_better_auth_starting',
            traceId,
            email: normalizedEmail,
        }, 'Admin sign-in: calling Better Auth signInEmail');

        const auth = await getAuth();
        logger.info({
            event: 'admin_sign_in_better_auth_initialized',
            traceId,
            email: normalizedEmail,
        }, 'Admin sign-in: Better Auth initialized');

        const betterAuthStartedAt = Date.now();
        // 1. Authenticate via Better Auth
        const signInResponse = await auth.api.signInEmail({
            body: { email, password },
            headers: reqHeaders,
            asResponse: true,
        });

        const initialSetCookies = signInResponse.headers.getSetCookie?.() || [];
        logger.info({
            event: 'admin_sign_in_better_auth_response',
            traceId,
            email: normalizedEmail,
            ok: signInResponse.ok,
            status: signInResponse.status,
            statusText: signInResponse.statusText,
            durationMs: Date.now() - betterAuthStartedAt,
            responseHeaderNames: Array.from(signInResponse.headers.keys()),
            setCookieCount: initialSetCookies.length,
            setCookieNames: summarizeCookieHeaders(initialSetCookies),
        }, 'Admin sign-in: Better Auth signInEmail returned');

        if (!signInResponse.ok) {
            let message = 'Invalid credentials';
            let payloadKeys: string[] = [];
            try {
                const payload = await signInResponse.json() as Record<string, unknown>;
                payloadKeys = Object.keys(payload);
                if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
                    message = payload.message;
                }
            } catch {
                logger.warn({
                    event: 'admin_sign_in_better_auth_error_body_unreadable',
                    traceId,
                    email: normalizedEmail,
                }, 'Admin sign-in: could not parse Better Auth error response');
            }

            logger.warn({
                event: 'admin_sign_in_rejected_by_better_auth',
                traceId,
                email: normalizedEmail,
                status: signInResponse.status,
                message,
                payloadKeys,
                totalDurationMs: Date.now() - startedAt,
            }, 'Admin sign-in: Better Auth rejected the credentials');

            return {
                code: 401,
                message,
                error: true,
            };
        }

        // Get ALL Set-Cookie headers to forward to client
        const setCookies = initialSetCookies;
        // Fallback to headers.get if getSetCookie is not available
        if (setCookies.length === 0) {
            const singleCookie = signInResponse.headers.get('set-cookie');
            if (singleCookie) setCookies.push(singleCookie);
        }

        // Parse the response to get session info
        const signInData = await signInResponse.json();

        logger.info({
            event: 'admin_sign_in_better_auth_success_payload',
            traceId,
            email: normalizedEmail,
            payloadKeys: Object.keys(signInData ?? {}),
            responseUserId: signInData?.user?.id ?? null,
            responseUserEmail: signInData?.user?.email ?? null,
            sessionPresent: Boolean(signInData?.session),
            tokenPresent: Boolean(signInData?.token),
            setCookieCount: setCookies.length,
            setCookieNames: summarizeCookieHeaders(setCookies),
        }, 'Admin sign-in: Better Auth authentication succeeded');

        // 2. Get session to retrieve user info
        const sessionHeaders = new Headers(reqHeaders);
        if (setCookies.length > 0) {
            sessionHeaders.set('cookie', setCookies.join('; '));
        }

        logger.info({
            event: 'admin_sign_in_session_lookup_starting',
            traceId,
            email: normalizedEmail,
            sessionRequestCookiePresent: Boolean(sessionHeaders.get('cookie')),
            sessionRequestCookieNames: summarizeCookieHeaders(setCookies),
        }, 'Admin sign-in: retrieving session from Better Auth');

        const sessionStartedAt = Date.now();
        const session = await auth.api.getSession({
            headers: sessionHeaders,
        });

        logger.info({
            event: 'admin_sign_in_session_lookup_completed',
            traceId,
            email: normalizedEmail,
            durationMs: Date.now() - sessionStartedAt,
            sessionFound: Boolean(session),
            sessionUserFound: Boolean(session?.user),
            sessionUserId: session?.user?.id ?? null,
            sessionUserEmail: session?.user?.email ?? null,
        }, 'Admin sign-in: Better Auth session lookup completed');

        if (!session || !session.user) {
            logger.error({
                event: 'admin_sign_in_session_missing',
                traceId,
                email: normalizedEmail,
                totalDurationMs: Date.now() - startedAt,
            }, 'Admin sign-in: authentication succeeded but session was not retrievable');

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

        logger.info({
            event: 'admin_sign_in_post_session_user_lookup',
            traceId,
            email: normalizedEmail,
            sessionUserId: session.user.id,
            databaseUserFound: Boolean(user),
            databaseUserEmail: user?.email ?? null,
            databaseUserIsSuperAdmin: user?.is_super_admin ?? null,
            databaseUserEmailVerified: user?.emailVerified ?? null,
            databaseUserMustChangePassword: user?.must_change_password ?? null,
        }, 'Admin sign-in: application user lookup completed');

        if (!user) {
            logger.error({
                event: 'admin_sign_in_post_session_user_missing',
                traceId,
                sessionUserId: session.user.id,
                totalDurationMs: Date.now() - startedAt,
            }, 'Admin sign-in: Better Auth session references a missing application user');

            return {
                code: 404,
                message: 'User not found',
                error: true,
            };
        }

        // 4. Resolve memberships (multi-shop support)
        const companyUsers = await Promise.all(
            (await getAdminCompanyUsers(session.user.id)).map(toAdminCompanyUserSummary),
        );

        logger.info({
            event: 'admin_sign_in_authorization_check',
            traceId,
            userId: user.id,
            email: user.email,
            isSuperAdmin: user.is_super_admin,
            companyUserCount: companyUsers.length,
            companyUsers: companyUsers.map((companyUser) => ({
                id: companyUser.id,
                companyId: companyUser.company_id,
                role: companyUser.role,
            })),
        }, 'Admin sign-in: company memberships resolved');

        if (companyUsers.length === 0 && !user.is_super_admin) {
            logger.warn({
                event: 'admin_sign_in_authorization_denied',
                traceId,
                userId: user.id,
                email: user.email,
                reason: 'no_company_membership_and_not_super_admin',
                totalDurationMs: Date.now() - startedAt,
            }, 'Admin sign-in: user lacks admin dashboard access');

            return {
                code: 403,
                message: 'User does not have admin access to any company',
                error: true,
            };
        }

        const activeCompanyUser = resolveActiveCompanyUser(companyUsers);

        logger.info({
            event: 'admin_sign_in_completed',
            traceId,
            userId: user.id,
            email: user.email,
            isSuperAdmin: user.is_super_admin,
            activeCompanyId: activeCompanyUser?.company_id ?? null,
            totalDurationMs: Date.now() - startedAt,
        }, 'Admin sign-in: completed successfully');

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
        const errorSummary = summarizeError(error);
        if (isInvalidCredentialsError(error)) {
            logger.warn({
                event: 'admin_sign_in_exception_invalid_credentials',
                traceId,
                email: normalizedEmail,
                error: errorSummary,
                totalDurationMs: Date.now() - startedAt,
            }, 'Admin sign-in: Better Auth threw an invalid-credentials error');

            return {
                code: 401,
                message: 'Invalid credentials',
                error: true,
            };
        }
        logger.error({
            event: 'admin_sign_in_exception',
            traceId,
            email: normalizedEmail,
            error: errorSummary,
            totalDurationMs: Date.now() - startedAt,
        }, 'Admin sign-in: unexpected exception');

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
        const companyUsers = await Promise.all(
            (await getAdminCompanyUsers(userId)).map(toAdminCompanyUserSummary),
        );
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
        const companyUsers = await Promise.all(
            (await getAdminCompanyUsers(userId)).map(toAdminCompanyUserSummary),
        );

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
                providerId: { in: [...BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
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
                providerId: { in: [...BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
                },
                data: {
                    providerId: BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
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
                providerId: { in: [...BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
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
                providerId: { in: [...BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
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
                providerId: { in: [...BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
                },
                data: {
                    providerId: BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
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
