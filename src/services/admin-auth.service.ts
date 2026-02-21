import { prisma } from '../prisma/client';
import { auth } from '../config/auth';
import { MensajeApi } from '../types/MensajeApi';
import { CompanyUserRole } from '@prisma/client';

interface AdminSignInResult extends MensajeApi {
    data?: {
        user: any;
        session: any;
        companyUser: {
            id: number;
            company_id: number;
            role: CompanyUserRole;
            is_primary_contact: boolean;
            company?: {
                id: number;
                name: string;
                slug: string;
            };
        } | null;
    };
    cookies?: string[]; // All Set-Cookie headers to forward
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
        // 1. Authenticate via Better Auth
        const signInResponse = await auth.api.signInEmail({
            body: { email, password },
            headers: reqHeaders,
            asResponse: true,
        });

        if (!signInResponse.ok) {
            return {
                code: 401,
                message: 'Invalid credentials',
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

        // 4. Check if user has a CompanyUser record (admin/staff access)
        const companyUser = await prisma.companyUser.findFirst({
            where: {
                user_id: session.user.id,
                deleted_at: null,
                role: {
                    in: [
                        CompanyUserRole.OWNER,
                        CompanyUserRole.ADMIN,
                        CompanyUserRole.STAFF,
                    ],
                },
            },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
            },
            orderBy: {
                // Prefer OWNER > ADMIN > STAFF
                role: 'asc',
            },
        });

        if (!companyUser && !user.is_super_admin) {
            return {
                code: 403,
                message: 'User does not have admin access to any company',
                error: true,
            };
        }

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
                companyUser: companyUser ? {
                    id: companyUser.id,
                    company_id: companyUser.company_id,
                    role: companyUser.role,
                    is_primary_contact: companyUser.is_primary_contact,
                    company: companyUser.company ?? undefined,
                } : null,
            },
            cookies: setCookies.length > 0 ? setCookies : undefined,
        };
    } catch (error: any) {
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
export async function getAdminSessionData(userId: string): Promise<AdminSignInResult> {
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
            },
        });

        if (!user) {
            return {
                code: 404,
                message: 'User not found',
                error: true,
            };
        }

        // Get CompanyUser record
        const companyUser = await prisma.companyUser.findFirst({
            where: {
                user_id: userId,
                deleted_at: null,
                role: {
                    in: [
                        CompanyUserRole.OWNER,
                        CompanyUserRole.ADMIN,
                        CompanyUserRole.STAFF,
                    ],
                },
            },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
            },
            orderBy: {
                role: 'asc',
            },
        });

        if (!companyUser && !user.is_super_admin) {
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
                companyUser: companyUser ? {
                    id: companyUser.id,
                    company_id: companyUser.company_id,
                    role: companyUser.role,
                    is_primary_contact: companyUser.is_primary_contact,
                    company: companyUser.company ?? undefined,
                } : null,
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
