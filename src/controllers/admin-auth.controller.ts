import { Request, Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as AdminAuthService from '../services/admin-auth.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { auth } from '../config/auth';

let mensaje: MensajeApi;

/**
 * POST /api/admin/auth/sign-in
 * Sign in an admin user with email and password
 */
export async function adminSignIn(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            code: 400,
            message: 'Email and password are required',
            error: true,
        });
    }

    const result = await AdminAuthService.signInAdmin(email, password, req.headers);

    // Forward ALL Set-Cookie headers from Better Auth (session_token + session_data)
    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }

    // Return the data in the format expected by frontend
    if (result.error) {
        return res.status(result.code).json(result);
    }

    return res.status(result.code).json({
        data: {
            user: result.data?.user,
            companyUser: result.data?.companyUser,
        },
    });
}

/**
 * POST /api/admin/auth/password-reset/start
 * Start admin password reset flow (email -> otp)
 */
export async function startAdminPasswordReset(req: Request, res: Response) {
    const { email } = req.body || {};

    if (typeof email !== 'string' || email.trim().length === 0) {
        return res.status(400).json({
            code: 400,
            message: 'Email is required',
            error: true,
        });
    }

    const result = await AdminAuthService.startAdminPasswordReset(email);
    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/auth/password-reset/complete
 * Complete admin password reset flow (email + otp + new password)
 */
export async function completeAdminPasswordReset(req: Request, res: Response) {
    const { email, code, newPassword, confirmPassword } = req.body || {};

    if (
        typeof email !== 'string' ||
        typeof code !== 'string' ||
        typeof newPassword !== 'string' ||
        typeof confirmPassword !== 'string'
    ) {
        return res.status(400).json({
            code: 400,
            message: 'email, code, newPassword and confirmPassword are required',
            error: true,
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            code: 400,
            message: 'New password must be at least 8 characters',
            error: true,
        });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({
            code: 400,
            message: 'Passwords do not match',
            error: true,
        });
    }

    const result = await AdminAuthService.completeAdminPasswordReset(email, code, newPassword);
    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/auth/sign-out
 * Sign out the current admin user
 */
export async function adminSignOut(req: Request, res: Response) {
    try {
        // Convert Express headers to the format Better Auth expects
        const headers: Record<string, string> = {};
        Object.entries(req.headers).forEach(([key, value]) => {
            if (typeof value === 'string') {
                headers[key] = value;
            } else if (Array.isArray(value)) {
                headers[key] = value.join(', ');
            }
        });

        // Call Better Auth signOut to clear the session
        const signOutResponse = await auth.api.signOut({
            headers,
            asResponse: true,
        });

        // Forward ALL Set-Cookie headers that clear the session
        const setCookies = signOutResponse.headers.getSetCookie?.() || [];
        if (setCookies.length > 0) {
            res.setHeader('Set-Cookie', setCookies);
        } else {
            // Fallback for environments without getSetCookie
            const setCookieHeader = signOutResponse.headers.get('set-cookie');
            if (setCookieHeader) {
                res.setHeader('Set-Cookie', setCookieHeader);
            }
        }

        res.json({
            code: 200,
            message: 'Sign-out successful',
            error: false,
        });
    } catch (error) {
        console.error('Sign-out error:', error);
        res.status(500).json({
            code: 500,
            message: 'Error during sign-out',
            error: true,
        });
    }
}

/**
 * POST /api/admin/auth/change-password
 * Change current admin password and clear force-change flag
 */
export async function changeAdminPassword(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!userId) {
        return res.status(401).json({
            code: 401,
            message: 'Not authenticated',
            error: true,
        });
    }

    if (
        typeof currentPassword !== 'string' ||
        typeof newPassword !== 'string' ||
        typeof confirmPassword !== 'string'
    ) {
        return res.status(400).json({
            code: 400,
            message: 'currentPassword, newPassword and confirmPassword are required',
            error: true,
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            code: 400,
            message: 'New password must be at least 8 characters',
            error: true,
        });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({
            code: 400,
            message: 'Passwords do not match',
            error: true,
        });
    }

    const result = await AdminAuthService.changeAdminPassword(userId, currentPassword, newPassword);
    return res.status(result.code).json(result);
}

/**
 * GET /api/admin/auth/session
 * Get current admin session with company context
 * Implements sliding expiration by refreshing the session
 */
export async function getAdminSession(req: AuthenticatedRequest, res: Response) {
    const user = req.authUser;

    if (!user) {
        return res.status(401).json({
            code: 401,
            message: 'Not authenticated',
            error: true,
        });
    }

    try {
        // Refresh session to implement sliding expiration
        const sessionHeaders: Record<string, string> = {};
        Object.entries(req.headers).forEach(([key, value]) => {
            if (typeof value === 'string') {
                sessionHeaders[key] = value;
            } else if (Array.isArray(value)) {
                sessionHeaders[key] = value.join(', ');
            }
        });

        // Call Better Auth's session endpoint to refresh it
        const sessionResponse = await auth.api.getSession({
            headers: sessionHeaders,
            asResponse: true,
        });

        // Forward ALL Set-Cookie headers if present (this refreshes the session)
        const setCookies = sessionResponse.headers.getSetCookie?.() || [];
        if (setCookies.length > 0) {
            res.setHeader('Set-Cookie', setCookies);
        } else {
            const setCookieHeader = sessionResponse.headers.get('set-cookie');
            if (setCookieHeader) {
                res.setHeader('Set-Cookie', setCookieHeader);
            }
        }

        const result = await AdminAuthService.getAdminSessionData(user.id);

        // Return the data in the format expected by frontend
        if (result.error) {
            return res.status(result.code).json(result);
        }

        return res.json({
            data: {
                user: result.data?.user,
                companyUser: result.data?.companyUser,
            },
        });
    } catch (error) {
        console.error('Session refresh error:', error);
        // Continue without refresh if there's an error
        const result = await AdminAuthService.getAdminSessionData(user.id);

        if (result.error) {
            return res.status(result.code).json(result);
        }

        return res.json({
            data: {
                user: result.data?.user,
                companyUser: result.data?.companyUser,
            },
        });
    }
}
