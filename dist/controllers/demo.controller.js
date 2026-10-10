"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDemoProfiles = listDemoProfiles;
exports.getPublicDemoProfile = getPublicDemoProfile;
exports.launchDemo = launchDemo;
exports.getDemoSession = getDemoSession;
exports.logoutDemo = logoutDemo;
const demo_profiles_1 = require("../config/demo-profiles");
const client_1 = require("../prisma/client");
const demo_session_service_1 = require("../services/demo-session.service");
const demo_session_middleware_1 = require("../middlewares/demo-session.middleware");
function listDemoProfiles(_req, res) {
    return res.json({ data: Object.values(demo_profiles_1.DEMO_PROFILES).map(demo_profiles_1.toPublicDemoProfile) });
}
async function getPublicDemoProfile(req, res) {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] ?? '' : req.params.slug;
    const profile = (0, demo_profiles_1.getDemoProfileForCompanySlug)(slug);
    if (!profile)
        return res.status(404).json({ code: 'DEMO_PROFILE_NOT_FOUND', message: 'No encontramos esta demostración.' });
    const company = await client_1.prisma.company.findUnique({
        where: { slug: profile.companySlug },
        select: { is_active: true, deleted_at: true },
    });
    if (!company?.is_active || company.deleted_at) {
        return res.status(404).json({ code: 'DEMO_PROFILE_NOT_FOUND', message: 'Esta demostración no está disponible.' });
    }
    return res.json({ data: (0, demo_profiles_1.toPublicDemoProfile)(profile) });
}
async function launchDemo(req, res) {
    const current = req.demoSessionContext;
    const result = await (0, demo_session_service_1.createDemoSession)(req.body?.profile);
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
        await (0, demo_session_service_1.revokeDemoSession)(current.id);
    }
    (0, demo_session_middleware_1.setDemoSessionCookie)(res, result.token);
    return res.json({
        data: {
            isDemo: true,
            profile: (0, demo_profiles_1.toPublicDemoProfile)(result.profile),
            expiresAt: result.session.expiresAt.toISOString(),
        },
    });
}
async function getDemoSession(req, res) {
    const session = req.demoSessionContext;
    if (!session)
        return res.json({ data: { isDemo: false } });
    return res.json({
        data: {
            isDemo: true,
            profile: (0, demo_profiles_1.toPublicDemoProfile)(session.profile),
            expiresAt: session.expiresAt.toISOString(),
        },
    });
}
async function logoutDemo(req, res) {
    const session = req.demoSessionContext;
    if (session) {
        await (0, demo_session_service_1.revokeDemoSession)(session.id);
    }
    (0, demo_session_middleware_1.clearDemoSessionCookie)(res);
    return res.json({ data: { isDemo: false } });
}
