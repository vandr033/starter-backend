import type { Request, Response } from 'express';
import { DEMO_PROFILES, getDemoProfileForCompanySlug, toPublicDemoProfile } from '../config/demo-profiles';
import { prisma } from '../prisma/client';
import { createDemoSession, revokeDemoSession } from '../services/demo-session.service';
import type { AuthenticatedRequest } from '../middlewares/requireAuth';
import { clearDemoSessionCookie, setDemoSessionCookie } from '../middlewares/demo-session.middleware';

export function listDemoProfiles(_req: Request, res: Response) {
    return res.json({ data: Object.values(DEMO_PROFILES).map(toPublicDemoProfile) });
}

export async function getPublicDemoProfile(req: Request, res: Response) {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] ?? '' : req.params.slug;
    const profile = getDemoProfileForCompanySlug(slug);
    if (!profile) return res.status(404).json({ code: 'DEMO_PROFILE_NOT_FOUND', message: 'No encontramos esta demostración.' });

    const company = await prisma.company.findUnique({
        where: { slug: profile.companySlug },
        select: { is_active: true, deleted_at: true },
    });
    if (!company?.is_active || company.deleted_at) {
        return res.status(404).json({ code: 'DEMO_PROFILE_NOT_FOUND', message: 'Esta demostración no está disponible.' });
    }

    return res.json({ data: toPublicDemoProfile(profile) });
}

export async function launchDemo(req: Request, res: Response) {
    const current = (req as AuthenticatedRequest).demoSessionContext;
    const result = await createDemoSession(req.body?.profile);
    if ('error' in result) {
        const invalid = result.error === 'INVALID_DEMO_PROFILE';
        return res.status(invalid ? 404 : 503).json({
            code: result.error,
            message: invalid
                ? 'No encontramos ese perfil de demostración.'
                : 'La demostración todavía no está configurada.',
        });
    }

    if (current) {
        await revokeDemoSession(current.id);
    }
    setDemoSessionCookie(res, result.token);
    return res.json({
        data: {
            isDemo: true,
            profile: toPublicDemoProfile(result.profile),
            expiresAt: result.session.expiresAt.toISOString(),
        },
    });
}

export async function getDemoSession(req: Request, res: Response) {
    const session = (req as AuthenticatedRequest).demoSessionContext;
    if (!session) return res.json({ data: { isDemo: false } });
    return res.json({
        data: {
            isDemo: true,
            profile: toPublicDemoProfile(session.profile),
            expiresAt: session.expiresAt.toISOString(),
        },
    });
}

export async function logoutDemo(req: Request, res: Response) {
    const session = (req as AuthenticatedRequest).demoSessionContext;
    if (session) {
        await revokeDemoSession(session.id);
    }
    clearDemoSessionCookie(res);
    return res.json({ data: { isDemo: false } });
}
