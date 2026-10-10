import type { NextFunction, Request, Response } from 'express';
import { DEMO_SESSION_COOKIE, DEMO_SESSION_TTL_MS, resolveDemoSession } from '../services/demo-session.service';
import { runWithDemoRequestContext } from '../services/demo-request-context';
import type { AuthenticatedRequest } from './requireAuth';
import { DEMO_PROFILES, getDemoProfileForCompanySlug } from '../config/demo-profiles';
import { prisma } from '../prisma/client';
import { isDemoCompanyId } from '../services/demo-session.service';

function readCookie(req: Request, name: string): string | null {
    const header = req.headers.cookie;
    if (typeof header !== 'string') return null;
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 1 || part.slice(0, separator).trim() !== name) continue;
        try {
            return decodeURIComponent(part.slice(separator + 1).trim());
        } catch {
            return null;
        }
    }
    return null;
}

function demoCookieOptions() {
    const secure = process.env.NODE_ENV === 'production';
    return { httpOnly: true, secure, sameSite: secure ? 'none' as const : 'lax' as const, path: '/' };
}

export function setDemoSessionCookie(res: Response, token: string) {
    res.cookie(DEMO_SESSION_COOKIE, token, { ...demoCookieOptions(), maxAge: DEMO_SESSION_TTL_MS });
}

export function clearDemoSessionCookie(res: Response) {
    res.clearCookie(DEMO_SESSION_COOKIE, demoCookieOptions());
}

export function sendDemoReadOnly(res: Response) {
    return res.status(403).json({
        code: 'DEMO_READ_ONLY',
        error: true,
        message: 'Esta acción no está disponible en modo demo.',
    });
}

export function sendDemoCompanyMismatch(res: Response) {
    return res.status(403).json({
        code: 'DEMO_COMPANY_MISMATCH',
        error: true,
        message: 'La empresa seleccionada no corresponde a esta sesión demo.',
    });
}

export async function demoSessionMiddleware(req: Request, res: Response, next: NextFunction) {
    const token = readCookie(req, DEMO_SESSION_COOKIE);
    if (!token) return next();

    try {
        const session = await resolveDemoSession(token);
        if (!session) {
            clearDemoSessionCookie(res);
            return res.status(401).json({
                code: 'DEMO_SESSION_EXPIRED',
                error: true,
                message: 'La sesión de demostración venció. Inicia otra demostración.',
            });
        }

        (req as AuthenticatedRequest).demoSessionContext = session;
        return runWithDemoRequestContext({
            isDemo: true,
            sessionId: session.id,
            profileKey: session.profile.key,
            companyId: session.companyId,
        }, next);
    } catch (error) {
        return next(error);
    }
}

const DEMO_POST_ALLOWLIST = new Set([
  '/api/demo/launch',
  '/api/demo/logout',
  '/api/admin/auth/active-shop',
  '/api/admin/auth/sign-out',
]);

export function demoReadOnlyMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!(req as AuthenticatedRequest).demoSessionContext) return next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();

    const path = (req.originalUrl || req.url).split('?', 1)[0];
    if (req.method.toUpperCase() === 'POST' && DEMO_POST_ALLOWLIST.has(path)) return next();
    return sendDemoReadOnly(res);
}

export function demoCompanySlugWriteGuard(req: Request, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] ?? '' : req.params.slug ?? '';
    if (getDemoProfileForCompanySlug(slug)) return sendDemoReadOnly(res);
    return next();
}

export async function demoTenantWriteGuard(req: Request, res: Response, next: NextFunction) {
    const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
    if ((req as AuthenticatedRequest).demoSessionContext) return next();

    try {
        const pathSegments = decodeURIComponent(req.originalUrl.split('?', 1)[0])
            .split('/')
            .filter(Boolean);
        const slugProfile = Object.values(DEMO_PROFILES).find((profile) => pathSegments.includes(profile.companySlug));
        if (!isRead && slugProfile) return sendDemoReadOnly(res);

        const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
        const query = req.query as Record<string, unknown>;
        const rawCompanyId = body.company_id ?? body.companyId ?? query.company_id ?? query.companyId;
        const companyId = typeof rawCompanyId === 'number'
            ? rawCompanyId
            : typeof rawCompanyId === 'string' && /^\d+$/.test(rawCompanyId) ? Number(rawCompanyId) : null;

        let companySlug = slugProfile?.companySlug ?? null;
        let resolvedCompanyId: number | null = null;
        if (slugProfile) {
            const company = await prisma.company.findUnique({ where: { slug: slugProfile.companySlug }, select: { id: true } });
            resolvedCompanyId = company?.id ?? null;
        } else if (companyId) {
            const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, slug: true } });
            const profile = company ? getDemoProfileForCompanySlug(company.slug) : null;
            if (profile) {
                companySlug = profile.companySlug;
                resolvedCompanyId = company!.id;
            }
        }
        if (!isRead && resolvedCompanyId) return sendDemoReadOnly(res);

        if (!isRead) {
            const rawBookingId = body.booking_id ?? body.bookingId;
            const bookingId = typeof rawBookingId === 'number'
                ? rawBookingId
                : typeof rawBookingId === 'string' && /^\d+$/.test(rawBookingId) ? Number(rawBookingId) : null;
            if (bookingId) {
                const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { company_id: true } });
                if (booking && await isDemoCompanyId(booking.company_id)) return sendDemoReadOnly(res);
            }
            return next();
        }

        if (companySlug && resolvedCompanyId) {
            const profile = getDemoProfileForCompanySlug(companySlug);
            if (profile) {
                return runWithDemoRequestContext({
                    isDemo: true,
                    sessionId: 'public-demo-read',
                    profileKey: profile.key,
                    companyId: resolvedCompanyId,
                }, next);
            }
        }
        return next();
    } catch (error) {
        return next(error);
    }
}

export async function demoBookingWriteGuard(req: Request, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) return next();
    try {
        const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { company_id: true } });
        if (booking && await isDemoCompanyId(booking.company_id)) return sendDemoReadOnly(res);
        return next();
    } catch (error) {
        return next(error);
    }
}

export async function demoRestaurantReservationWriteGuard(req: Request, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();
    const code = typeof req.params.code === 'string' ? req.params.code : '';
    if (!code) return next();
    try {
        const reservation = await prisma.restaurantReservation.findUnique({
            where: { reservation_code: code },
            select: { company_id: true },
        });
        if (reservation && await isDemoCompanyId(reservation.company_id)) return sendDemoReadOnly(res);
        return next();
    } catch (error) {
        return next(error);
    }
}

export async function demoClassAttendanceWriteGuard(req: Request, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next();
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    if (!token) return next();
    try {
        const session = await prisma.groupClassSession.findFirst({
            where: { attendance_public_token: token },
            select: { company_id: true },
        });
        if (session && await isDemoCompanyId(session.company_id)) return sendDemoReadOnly(res);
        return next();
    } catch (error) {
        return next(error);
    }
}
