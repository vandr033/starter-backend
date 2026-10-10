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
exports.adminSignIn = adminSignIn;
exports.startAdminPasswordReset = startAdminPasswordReset;
exports.completeAdminPasswordReset = completeAdminPasswordReset;
exports.adminSignOut = adminSignOut;
exports.changeAdminPassword = changeAdminPassword;
exports.getAdminSession = getAdminSession;
exports.getMyShops = getMyShops;
exports.getActiveShop = getActiveShop;
exports.setActiveShop = setActiveShop;
const AdminAuthService = __importStar(require("../services/admin-auth.service"));
const auth_1 = require("../config/auth");
const active_shop_cookie_1 = require("../utils/active-shop-cookie");
const logger_1 = require("../config/logger");
const demo_session_middleware_1 = require("../middlewares/demo-session.middleware");
const demo_session_service_1 = require("../services/demo-session.service");
const demo_profiles_1 = require("../config/demo-profiles");
let mensaje;
/**
 * POST /api/admin/auth/sign-in
 * Sign in an admin user with email and password
 */
async function adminSignIn(req, res) {
    const { email, password } = req.body;
    logger_1.logger.info({
        event: 'admin_sign_in_http_request',
        method: req.method,
        path: req.originalUrl,
        origin: req.headers.origin ?? null,
        referer: req.headers.referer ?? null,
        userAgent: req.headers['user-agent'] ?? null,
        host: req.headers.host ?? null,
        contentType: req.headers['content-type'] ?? null,
        email: typeof email === 'string' ? email.trim().toLowerCase() : null,
        emailLength: typeof email === 'string' ? email.length : 0,
        emailWasTrimmed: typeof email === 'string' && email !== email.trim(),
        passwordProvided: typeof password === 'string' && password.length > 0,
        passwordLength: typeof password === 'string' ? password.length : 0,
        cookiePresent: Boolean(req.headers.cookie),
        authorizationPresent: Boolean(req.headers.authorization),
    }, 'Admin sign-in HTTP request received');
    if (!email || !password) {
        logger_1.logger.warn({
            event: 'admin_sign_in_http_request_invalid',
            path: req.originalUrl,
            hasEmail: Boolean(email),
            hasPassword: Boolean(password),
        }, 'Admin sign-in HTTP request missing email or password');
        return res.status(400).json({
            code: 400,
            message: 'Email and password are required',
            error: true,
        });
    }
    const result = await AdminAuthService.signInAdmin(email, password, req.headers, {
        method: req.method,
        path: req.originalUrl,
        origin: req.headers.origin ?? null,
        referer: req.headers.referer ?? null,
        userAgent: req.headers['user-agent'] ?? null,
    });
    logger_1.logger.info({
        event: 'admin_sign_in_http_response',
        path: req.originalUrl,
        statusCode: result.code,
        error: result.error,
        message: result.message,
        cookieCount: result.cookies?.length ?? 0,
    }, 'Admin sign-in HTTP response prepared');
    // Forward ALL Set-Cookie headers from Better Auth (session_token + session_data)
    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }
    // Return the data in the format expected by frontend
    if (result.error) {
        return res.status(result.code).json(result);
    }
    const activeCompanyId = result.data?.activeCompanyId;
    if (typeof activeCompanyId === 'number' && activeCompanyId > 0) {
        (0, active_shop_cookie_1.setActiveCompanyCookie)(res, activeCompanyId);
    }
    else {
        (0, active_shop_cookie_1.clearActiveCompanyCookie)(res);
    }
    return res.status(result.code).json({
        data: {
            user: result.data?.user,
            companyUser: result.data?.companyUser,
            companyUsers: result.data?.companyUsers ?? [],
            activeCompanyId: result.data?.activeCompanyId ?? null,
        },
    });
}
/**
 * POST /api/admin/auth/password-reset/start
 * Start admin password reset flow (email -> otp)
 */
async function startAdminPasswordReset(req, res) {
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
async function completeAdminPasswordReset(req, res) {
    const { email, code, newPassword, confirmPassword } = req.body || {};
    if (typeof email !== 'string' ||
        typeof code !== 'string' ||
        typeof newPassword !== 'string' ||
        typeof confirmPassword !== 'string') {
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
async function adminSignOut(req, res) {
    try {
        const demoSession = req.demoSessionContext;
        if (demoSession) {
            await (0, demo_session_service_1.revokeDemoSession)(demoSession.id);
            (0, demo_session_middleware_1.clearDemoSessionCookie)(res);
            (0, active_shop_cookie_1.clearActiveCompanyCookie)(res);
            return res.json({ code: 200, message: 'Sign-out successful', error: false });
        }
        const auth = await (0, auth_1.getAuth)();
        // Convert Express headers to the format Better Auth expects
        const headers = {};
        Object.entries(req.headers).forEach(([key, value]) => {
            if (typeof value === 'string') {
                headers[key] = value;
            }
            else if (Array.isArray(value)) {
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
        }
        else {
            // Fallback for environments without getSetCookie
            const setCookieHeader = signOutResponse.headers.get('set-cookie');
            if (setCookieHeader) {
                res.setHeader('Set-Cookie', setCookieHeader);
            }
        }
        (0, active_shop_cookie_1.clearActiveCompanyCookie)(res);
        res.json({
            code: 200,
            message: 'Sign-out successful',
            error: false,
        });
    }
    catch (error) {
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
async function changeAdminPassword(req, res) {
    const userId = req.authUser?.id;
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!userId) {
        return res.status(401).json({
            code: 401,
            message: 'Not authenticated',
            error: true,
        });
    }
    if (typeof currentPassword !== 'string' ||
        typeof newPassword !== 'string' ||
        typeof confirmPassword !== 'string') {
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
async function getAdminSession(req, res) {
    const user = req.authUser;
    if (!user) {
        return res.status(401).json({
            code: 401,
            message: 'Not authenticated',
            error: true,
        });
    }
    try {
        if (req.demoSessionContext) {
            const demo = req.demoSessionContext;
            const result = await AdminAuthService.getAdminSessionData(user.id, demo.companyId, demo.companyId);
            if (result.error)
                return res.status(result.code).json(result);
            return res.json({
                data: {
                    user: result.data?.user,
                    companyUser: result.data?.companyUser,
                    companyUsers: result.data?.companyUsers ?? [],
                    activeCompanyId: demo.companyId,
                    demoSession: {
                        isDemo: true,
                        profile: (0, demo_profiles_1.toPublicDemoProfile)(demo.profile),
                        expiresAt: demo.expiresAt.toISOString(),
                    },
                },
            });
        }
        const auth = await (0, auth_1.getAuth)();
        // Refresh session to implement sliding expiration
        const sessionHeaders = {};
        Object.entries(req.headers).forEach(([key, value]) => {
            if (typeof value === 'string') {
                sessionHeaders[key] = value;
            }
            else if (Array.isArray(value)) {
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
        }
        else {
            const setCookieHeader = sessionResponse.headers.get('set-cookie');
            if (setCookieHeader) {
                res.setHeader('Set-Cookie', setCookieHeader);
            }
        }
        const preferredCompanyId = (0, active_shop_cookie_1.getActiveCompanyIdFromRequest)(req);
        const result = await AdminAuthService.getAdminSessionData(user.id, preferredCompanyId);
        // Return the data in the format expected by frontend
        if (result.error) {
            return res.status(result.code).json(result);
        }
        const resolvedActiveCompanyId = result.data?.activeCompanyId ?? null;
        if (resolvedActiveCompanyId) {
            (0, active_shop_cookie_1.setActiveCompanyCookie)(res, resolvedActiveCompanyId);
        }
        else {
            (0, active_shop_cookie_1.clearActiveCompanyCookie)(res);
        }
        return res.json({
            data: {
                user: result.data?.user,
                companyUser: result.data?.companyUser,
                companyUsers: result.data?.companyUsers ?? [],
                activeCompanyId: result.data?.activeCompanyId ?? null,
            },
        });
    }
    catch (error) {
        console.error('Session refresh error:', error);
        // Continue without refresh if there's an error
        const preferredCompanyId = (0, active_shop_cookie_1.getActiveCompanyIdFromRequest)(req);
        const result = await AdminAuthService.getAdminSessionData(user.id, preferredCompanyId);
        if (result.error) {
            return res.status(result.code).json(result);
        }
        const resolvedActiveCompanyId = result.data?.activeCompanyId ?? null;
        if (resolvedActiveCompanyId) {
            (0, active_shop_cookie_1.setActiveCompanyCookie)(res, resolvedActiveCompanyId);
        }
        else {
            (0, active_shop_cookie_1.clearActiveCompanyCookie)(res);
        }
        return res.json({
            data: {
                user: result.data?.user,
                companyUser: result.data?.companyUser,
                companyUsers: result.data?.companyUsers ?? [],
                activeCompanyId: result.data?.activeCompanyId ?? null,
            },
        });
    }
}
/**
 * GET /api/admin/auth/shops
 * List all shops where the current user has admin/shop membership.
 */
async function getMyShops(req, res) {
    const user = req.authUser;
    if (!user?.id) {
        return res.status(401).json({
            code: 401,
            message: 'Not authenticated',
            error: true,
        });
    }
    const demo = req.demoSessionContext;
    const preferredCompanyId = demo?.companyId ?? (0, active_shop_cookie_1.getActiveCompanyIdFromRequest)(req);
    const result = await AdminAuthService.getAdminSessionData(user.id, preferredCompanyId, demo?.companyId);
    if (result.error) {
        return res.status(result.code).json(result);
    }
    const resolvedActiveCompanyId = result.data?.activeCompanyId ?? null;
    if (!demo && resolvedActiveCompanyId) {
        (0, active_shop_cookie_1.setActiveCompanyCookie)(res, resolvedActiveCompanyId);
    }
    else if (!demo) {
        (0, active_shop_cookie_1.clearActiveCompanyCookie)(res);
    }
    return res.status(200).json({
        code: 200,
        error: false,
        message: 'Shops retrieved successfully',
        data: {
            companyUsers: result.data?.companyUsers ?? [],
            activeCompanyId: resolvedActiveCompanyId,
        },
    });
}
/**
 * GET /api/admin/auth/active-shop
 * Return the current active shop membership context.
 */
async function getActiveShop(req, res) {
    const user = req.authUser;
    if (!user?.id) {
        return res.status(401).json({
            code: 401,
            message: 'Not authenticated',
            error: true,
        });
    }
    const demo = req.demoSessionContext;
    const preferredCompanyId = demo?.companyId ?? (0, active_shop_cookie_1.getActiveCompanyIdFromRequest)(req);
    const result = await AdminAuthService.getAdminSessionData(user.id, preferredCompanyId, demo?.companyId);
    if (result.error) {
        return res.status(result.code).json(result);
    }
    const resolvedActiveCompanyId = result.data?.activeCompanyId ?? null;
    if (!demo && resolvedActiveCompanyId) {
        (0, active_shop_cookie_1.setActiveCompanyCookie)(res, resolvedActiveCompanyId);
    }
    else if (!demo) {
        (0, active_shop_cookie_1.clearActiveCompanyCookie)(res);
    }
    return res.status(200).json({
        code: 200,
        error: false,
        message: 'Active shop retrieved successfully',
        data: {
            companyUser: result.data?.companyUser ?? null,
            activeCompanyId: resolvedActiveCompanyId,
        },
    });
}
/**
 * POST /api/admin/auth/active-shop
 * Update active shop context for current user.
 */
async function setActiveShop(req, res) {
    const user = req.authUser;
    if (!user?.id) {
        return res.status(401).json({
            code: 401,
            message: 'Not authenticated',
            error: true,
        });
    }
    const companyIdRaw = req.body?.company_id;
    const companyId = typeof companyIdRaw === 'number'
        ? companyIdRaw
        : typeof companyIdRaw === 'string'
            ? Number.parseInt(companyIdRaw, 10)
            : NaN;
    if (!Number.isInteger(companyId) || companyId <= 0) {
        return res.status(400).json({
            code: 400,
            message: 'company_id must be a positive integer',
            error: true,
        });
    }
    const demo = req.demoSessionContext;
    if (demo && companyId !== demo.companyId)
        return (0, demo_session_middleware_1.sendDemoCompanyMismatch)(res);
    const result = await AdminAuthService.switchActiveShop(user.id, companyId, demo?.companyId);
    if (result.error) {
        return res.status(result.code).json(result);
    }
    if (!demo)
        (0, active_shop_cookie_1.setActiveCompanyCookie)(res, companyId);
    return res.status(200).json(result);
}
