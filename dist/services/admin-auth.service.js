"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveActiveCompanyUser = resolveActiveCompanyUser;
exports.signInAdmin = signInAdmin;
exports.getAdminSessionData = getAdminSessionData;
exports.switchActiveShop = switchActiveShop;
exports.changeAdminPassword = changeAdminPassword;
exports.startAdminPasswordReset = startAdminPasswordReset;
exports.completeAdminPasswordReset = completeAdminPasswordReset;
const client_1 = require("../prisma/client");
const auth_1 = require("../config/auth");
const client_2 = require("@prisma/client");
const verification_enums_1 = require("../types/verification-enums");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const node_crypto_1 = require("node:crypto");
const otp_1 = require("../utils/otp");
const sendEmail_1 = require("../utils/sendEmail");
const company_entitlements_service_1 = require("./company-entitlements.service");
const company_access_service_1 = require("./company-access.service");
const logger_1 = require("../config/logger");
const auth_constants_1 = require("../config/auth-constants");
const DEFAULT_LANGUAGE_KEY = 'default_language';
const FALLBACK_DEFAULT_LANGUAGE = 'es';
const ADMIN_ALLOWED_ROLES = [
    client_2.CompanyUserRole.OWNER,
    client_2.CompanyUserRole.ADMIN,
    client_2.CompanyUserRole.STAFF,
];
const RESET_CODE_TTL_MINUTES = 15;
function getHeaderValue(headers, name) {
    if (!headers)
        return null;
    if (typeof headers.get === 'function')
        return headers.get(name);
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value))
        return value[0] ?? null;
    return typeof value === 'string' ? value : null;
}
function summarizeDatabaseTarget() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl)
        return { configured: false };
    try {
        const databaseUrl = new URL(rawUrl);
        return {
            configured: true,
            protocol: databaseUrl.protocol,
            host: databaseUrl.hostname,
            port: databaseUrl.port || null,
            database: databaseUrl.pathname.replace(/^\//, '') || null,
        };
    }
    catch {
        return { configured: true, parseable: false };
    }
}
function summarizeError(error) {
    const candidate = error;
    return {
        name: typeof candidate?.name === 'string' ? candidate.name : undefined,
        message: typeof candidate?.message === 'string' ? candidate.message : String(error),
        stack: typeof candidate?.stack === 'string' ? candidate.stack : undefined,
    };
}
function summarizeCookieHeaders(cookies) {
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
        trustedOriginsConfigured: Boolean(process.env.TRUSTED_ORIGINS || process.env.BETTER_AUTH_TRUSTED_ORIGINS),
        database: summarizeDatabaseTarget(),
    };
}
async function getAdminCompanyUsers(userId, lockedCompanyId) {
    return client_1.prisma.companyUser.findMany({
        where: {
            user_id: userId,
            deleted_at: null,
            ...(lockedCompanyId ? { company_id: lockedCompanyId } : {}),
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
async function toAdminCompanyUserSummary(companyUser) {
    const defaultLanguage = companyUser.company?.config_messages?.[0]?.value?.trim().toLowerCase() || FALLBACK_DEFAULT_LANGUAGE;
    const effectiveAccess = companyUser.company
        ? await (0, company_access_service_1.resolveEffectiveCompanyAccess)({
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
                capabilities: effectiveAccess?.entitlements ?? await (0, company_entitlements_service_1.getCompanyEntitlements)(companyUser.company.id),
                effectiveAccess: effectiveAccess,
                availableUntil: companyUser.company.availableUntil,
                default_language: defaultLanguage,
            }
            : undefined,
    };
}
function resolveActiveCompanyUser(companyUsers, preferredCompanyId) {
    if (companyUsers.length === 0)
        return null;
    if (preferredCompanyId !== undefined && preferredCompanyId !== null) {
        const preferred = companyUsers.find((companyUser) => companyUser.company_id === preferredCompanyId);
        if (preferred)
            return preferred;
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
async function hasAdminDashboardAccess(userId) {
    const companyUser = await client_1.prisma.companyUser.findFirst({
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
function isInvalidCredentialsError(error) {
    const message = String(error?.message ??
        error?.toString?.() ??
        '').toLowerCase();
    return (message.includes('invalid password') ||
        message.includes('invalid credentials') ||
        message.includes('credential account not found'));
}
/**
 * Sign in an admin user (must have a CompanyUser record)
 */
async function signInAdmin(email, password, reqHeaders, requestContext) {
    const traceId = (0, node_crypto_1.randomUUID)();
    const startedAt = Date.now();
    const inputEmail = typeof email === 'string' ? email : String(email ?? '');
    const normalizedEmail = inputEmail.trim().toLowerCase();
    const passwordLength = typeof password === 'string' ? password.length : 0;
    try {
        logger_1.logger.info({
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
        const preAuthUser = await client_1.prisma.user.findUnique({
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
                    where: { providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] } },
                    select: {
                        id: true,
                        providerId: true,
                        accountId: true,
                        password: true,
                    },
                },
            },
        });
        logger_1.logger.info({
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
        logger_1.logger.info({
            event: 'admin_sign_in_better_auth_starting',
            traceId,
            email: normalizedEmail,
        }, 'Admin sign-in: calling Better Auth signInEmail');
        const auth = await (0, auth_1.getAuth)();
        logger_1.logger.info({
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
        logger_1.logger.info({
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
            let payloadKeys = [];
            try {
                const payload = await signInResponse.json();
                payloadKeys = Object.keys(payload);
                if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
                    message = payload.message;
                }
            }
            catch {
                logger_1.logger.warn({
                    event: 'admin_sign_in_better_auth_error_body_unreadable',
                    traceId,
                    email: normalizedEmail,
                }, 'Admin sign-in: could not parse Better Auth error response');
            }
            logger_1.logger.warn({
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
            if (singleCookie)
                setCookies.push(singleCookie);
        }
        // Parse the response to get session info
        const signInData = await signInResponse.json();
        logger_1.logger.info({
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
        logger_1.logger.info({
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
        logger_1.logger.info({
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
            logger_1.logger.error({
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
        const user = await client_1.prisma.user.findUnique({
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
        logger_1.logger.info({
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
            logger_1.logger.error({
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
        const companyUsers = await Promise.all((await getAdminCompanyUsers(session.user.id)).map(toAdminCompanyUserSummary));
        logger_1.logger.info({
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
            logger_1.logger.warn({
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
        logger_1.logger.info({
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
    }
    catch (error) {
        const errorSummary = summarizeError(error);
        if (isInvalidCredentialsError(error)) {
            logger_1.logger.warn({
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
        logger_1.logger.error({
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
async function getAdminSessionData(userId, preferredCompanyId, lockedCompanyId) {
    try {
        // Get user from database
        const user = await client_1.prisma.user.findUnique({
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
        const companyUsers = await Promise.all((await getAdminCompanyUsers(userId, lockedCompanyId)).map(toAdminCompanyUserSummary));
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
    }
    catch (error) {
        console.error('Get admin session error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
async function switchActiveShop(userId, companyId, lockedCompanyId) {
    try {
        const companyUsers = await Promise.all((await getAdminCompanyUsers(userId, lockedCompanyId)).map(toAdminCompanyUserSummary));
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
    }
    catch (error) {
        console.error('Switch active shop error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
async function changeAdminPassword(userId, currentPassword, newPassword) {
    try {
        const canUseAdminDashboardAuth = await hasAdminDashboardAccess(userId);
        if (!canUseAdminDashboardAuth) {
            return {
                code: 403,
                message: 'User does not have admin dashboard access',
                error: true,
            };
        }
        const credentialAccount = await client_1.prisma.account.findFirst({
            where: {
                userId,
                providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
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
        const matches = await bcryptjs_1.default.compare(currentPassword, credentialAccount.password);
        if (!matches) {
            return {
                code: 400,
                message: 'Current password is incorrect',
                error: true,
            };
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        await client_1.prisma.$transaction([
            client_1.prisma.account.updateMany({
                where: {
                    userId,
                    providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
                },
                data: {
                    providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                    password: hashedPassword,
                },
            }),
            client_1.prisma.user.update({
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
    }
    catch (error) {
        console.error('Change admin password error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
async function startAdminPasswordReset(email) {
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
        const successMessage = {
            code: 200,
            message: 'If the account exists, a reset code has been sent',
            error: false,
        };
        const user = await client_1.prisma.user.findUnique({
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
        const credentialAccount = await client_1.prisma.account.findFirst({
            where: {
                userId: user.id,
                providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
            },
            select: { id: true },
        });
        if (!credentialAccount) {
            return successMessage;
        }
        const code = (0, otp_1.generateNumericCode)(6);
        const codeHash = await bcryptjs_1.default.hash(code, 10);
        const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60000);
        await client_1.prisma.verificationCode.create({
            data: {
                channel: verification_enums_1.VerificationChannel.EMAIL,
                purpose: verification_enums_1.VerificationPurpose.LOGIN,
                identifier: normalizedEmail,
                code_hash: codeHash,
                expires_at: expiresAt,
            },
        });
        const sent = await (0, sendEmail_1.sendEmailCode)(normalizedEmail, code);
        if (sent === -1) {
            return {
                code: 500,
                message: 'Failed to send reset code',
                error: true,
            };
        }
        return successMessage;
    }
    catch (error) {
        console.error('Start admin password reset error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error?.toString(),
        };
    }
}
async function completeAdminPasswordReset(email, code, newPassword) {
    try {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await client_1.prisma.user.findUnique({
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
        const credentialAccount = await client_1.prisma.account.findFirst({
            where: {
                userId: user.id,
                providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
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
        const verification = await client_1.prisma.verificationCode.findFirst({
            where: {
                channel: verification_enums_1.VerificationChannel.EMAIL,
                purpose: verification_enums_1.VerificationPurpose.LOGIN,
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
        const isCodeValid = await bcryptjs_1.default.compare(code, verification.code_hash);
        await client_1.prisma.verificationCode.update({
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
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        await client_1.prisma.$transaction([
            client_1.prisma.account.updateMany({
                where: {
                    userId: user.id,
                    providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
                },
                data: {
                    providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                    password: hashedPassword,
                },
            }),
            client_1.prisma.user.update({
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
    }
    catch (error) {
        console.error('Complete admin password reset error:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error?.toString(),
        };
    }
}
