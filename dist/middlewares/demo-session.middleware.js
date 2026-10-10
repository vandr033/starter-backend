"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDemoSessionCookie = setDemoSessionCookie;
exports.clearDemoSessionCookie = clearDemoSessionCookie;
exports.sendDemoReadOnly = sendDemoReadOnly;
exports.sendDemoCompanyMismatch = sendDemoCompanyMismatch;
exports.demoSessionMiddleware = demoSessionMiddleware;
exports.demoReadOnlyMiddleware = demoReadOnlyMiddleware;
exports.demoCompanySlugWriteGuard = demoCompanySlugWriteGuard;
exports.demoTenantWriteGuard = demoTenantWriteGuard;
exports.demoBookingWriteGuard = demoBookingWriteGuard;
exports.demoRestaurantReservationWriteGuard = demoRestaurantReservationWriteGuard;
exports.demoClassAttendanceWriteGuard = demoClassAttendanceWriteGuard;
const demo_session_service_1 = require("../services/demo-session.service");
const demo_request_context_1 = require("../services/demo-request-context");
const demo_profiles_1 = require("../config/demo-profiles");
const client_1 = require("../prisma/client");
const demo_session_service_2 = require("../services/demo-session.service");
function readCookie(req, name) {
    const header = req.headers.cookie;
    if (typeof header !== 'string')
        return null;
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 1 || part.slice(0, separator).trim() !== name)
            continue;
        try {
            return decodeURIComponent(part.slice(separator + 1).trim());
        }
        catch {
            return null;
        }
    }
    return null;
}
function demoCookieOptions() {
    const secure = process.env.NODE_ENV === 'production';
    return { httpOnly: true, secure, sameSite: secure ? 'none' : 'lax', path: '/' };
}
function setDemoSessionCookie(res, token) {
    res.cookie(demo_session_service_1.DEMO_SESSION_COOKIE, token, { ...demoCookieOptions(), maxAge: demo_session_service_1.DEMO_SESSION_TTL_MS });
}
function clearDemoSessionCookie(res) {
    res.clearCookie(demo_session_service_1.DEMO_SESSION_COOKIE, demoCookieOptions());
}
function sendDemoReadOnly(res) {
    return res.status(403).json({
        code: 'DEMO_READ_ONLY',
        error: true,
        message: 'Esta acción no está disponible en modo demo.',
    });
}
function sendDemoCompanyMismatch(res) {
    return res.status(403).json({
        code: 'DEMO_COMPANY_MISMATCH',
        error: true,
        message: 'La empresa seleccionada no corresponde a esta sesión demo.',
    });
}
async function demoSessionMiddleware(req, res, next) {
    const token = readCookie(req, demo_session_service_1.DEMO_SESSION_COOKIE);
    if (!token)
        return next();
    try {
        const session = await (0, demo_session_service_1.resolveDemoSession)(token);
        if (!session) {
            clearDemoSessionCookie(res);
            return res.status(401).json({
                code: 'DEMO_SESSION_EXPIRED',
                error: true,
                message: 'La sesión de demostración venció. Inicia otra demostración.',
            });
        }
        req.demoSessionContext = session;
        return (0, demo_request_context_1.runWithDemoRequestContext)({
            isDemo: true,
            sessionId: session.id,
            profileKey: session.profile.key,
            companyId: session.companyId,
        }, next);
    }
    catch (error) {
        return next(error);
    }
}
const DEMO_POST_ALLOWLIST = new Set([
    '/api/demo/launch',
    '/api/demo/logout',
    '/api/admin/auth/active-shop',
    '/api/admin/auth/sign-out',
]);
function demoReadOnlyMiddleware(req, res, next) {
    if (!req.demoSessionContext)
        return next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()))
        return next();
    const path = (req.originalUrl || req.url).split('?', 1)[0];
    if (req.method.toUpperCase() === 'POST' && DEMO_POST_ALLOWLIST.has(path))
        return next();
    return sendDemoReadOnly(res);
}
function demoCompanySlugWriteGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()))
        return next();
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] ?? '' : req.params.slug ?? '';
    if ((0, demo_profiles_1.getDemoProfileForCompanySlug)(slug))
        return sendDemoReadOnly(res);
    return next();
}
async function demoTenantWriteGuard(req, res, next) {
    const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
    if (req.demoSessionContext)
        return next();
    try {
        const pathSegments = decodeURIComponent(req.originalUrl.split('?', 1)[0])
            .split('/')
            .filter(Boolean);
        const slugProfile = Object.values(demo_profiles_1.DEMO_PROFILES).find((profile) => pathSegments.includes(profile.companySlug));
        if (!isRead && slugProfile)
            return sendDemoReadOnly(res);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const query = req.query;
        const rawCompanyId = body.company_id ?? body.companyId ?? query.company_id ?? query.companyId;
        const companyId = typeof rawCompanyId === 'number'
            ? rawCompanyId
            : typeof rawCompanyId === 'string' && /^\d+$/.test(rawCompanyId) ? Number(rawCompanyId) : null;
        let companySlug = slugProfile?.companySlug ?? null;
        let resolvedCompanyId = null;
        if (slugProfile) {
            const company = await client_1.prisma.company.findUnique({ where: { slug: slugProfile.companySlug }, select: { id: true } });
            resolvedCompanyId = company?.id ?? null;
        }
        else if (companyId) {
            const company = await client_1.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, slug: true } });
            const profile = company ? (0, demo_profiles_1.getDemoProfileForCompanySlug)(company.slug) : null;
            if (profile) {
                companySlug = profile.companySlug;
                resolvedCompanyId = company.id;
            }
        }
        if (!isRead && resolvedCompanyId)
            return sendDemoReadOnly(res);
        if (!isRead) {
            const rawBookingId = body.booking_id ?? body.bookingId;
            const bookingId = typeof rawBookingId === 'number'
                ? rawBookingId
                : typeof rawBookingId === 'string' && /^\d+$/.test(rawBookingId) ? Number(rawBookingId) : null;
            if (bookingId) {
                const booking = await client_1.prisma.booking.findUnique({ where: { id: bookingId }, select: { company_id: true } });
                if (booking && await (0, demo_session_service_2.isDemoCompanyId)(booking.company_id))
                    return sendDemoReadOnly(res);
            }
            return next();
        }
        if (companySlug && resolvedCompanyId) {
            const profile = (0, demo_profiles_1.getDemoProfileForCompanySlug)(companySlug);
            if (profile) {
                return (0, demo_request_context_1.runWithDemoRequestContext)({
                    isDemo: true,
                    sessionId: 'public-demo-read',
                    profileKey: profile.key,
                    companyId: resolvedCompanyId,
                }, next);
            }
        }
        return next();
    }
    catch (error) {
        return next(error);
    }
}
async function demoBookingWriteGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()))
        return next();
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0)
        return next();
    try {
        const booking = await client_1.prisma.booking.findUnique({ where: { id: bookingId }, select: { company_id: true } });
        if (booking && await (0, demo_session_service_2.isDemoCompanyId)(booking.company_id))
            return sendDemoReadOnly(res);
        return next();
    }
    catch (error) {
        return next(error);
    }
}
async function demoRestaurantReservationWriteGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()))
        return next();
    const code = typeof req.params.code === 'string' ? req.params.code : '';
    if (!code)
        return next();
    try {
        const reservation = await client_1.prisma.restaurantReservation.findUnique({
            where: { reservation_code: code },
            select: { company_id: true },
        });
        if (reservation && await (0, demo_session_service_2.isDemoCompanyId)(reservation.company_id))
            return sendDemoReadOnly(res);
        return next();
    }
    catch (error) {
        return next(error);
    }
}
async function demoClassAttendanceWriteGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()))
        return next();
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    if (!token)
        return next();
    try {
        const session = await client_1.prisma.groupClassSession.findFirst({
            where: { attendance_public_token: token },
            select: { company_id: true },
        });
        if (session && await (0, demo_session_service_2.isDemoCompanyId)(session.company_id))
            return sendDemoReadOnly(res);
        return next();
    }
    catch (error) {
        return next(error);
    }
}
