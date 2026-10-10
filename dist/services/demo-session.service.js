"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_SESSION_TTL_MS = exports.DEMO_SESSION_COOKIE = void 0;
exports.hashDemoSessionToken = hashDemoSessionToken;
exports.createDemoSession = createDemoSession;
exports.resolveDemoSession = resolveDemoSession;
exports.revokeDemoSession = revokeDemoSession;
exports.isDemoCompanyId = isDemoCompanyId;
const node_crypto_1 = require("node:crypto");
const client_1 = require("../prisma/client");
const demo_profiles_1 = require("../config/demo-profiles");
const demo_operator_membership_service_1 = require("./demo-operator-membership.service");
exports.DEMO_SESSION_COOKIE = 'priconpri_demo_session';
exports.DEMO_SESSION_TTL_MS = 45 * 60 * 1000;
function hashDemoSessionToken(token) {
    return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
}
async function createDemoSession(profileValue) {
    const profile = (0, demo_profiles_1.getDemoProfile)(profileValue);
    if (!profile)
        return { error: 'INVALID_DEMO_PROFILE' };
    const [company, user] = await Promise.all([
        client_1.prisma.company.findUnique({ where: { slug: profile.companySlug }, select: { id: true, slug: true, is_active: true, deleted_at: true } }),
        client_1.prisma.user.findUnique({ where: { email: demo_profiles_1.DEMO_OPERATOR_EMAIL }, select: { id: true, is_active: true, deleted_at: true } }),
    ]);
    if (!company || !company.is_active || company.deleted_at || !user?.is_active || user.deleted_at || company.slug !== profile.companySlug) {
        return { error: 'DEMO_PROFILE_NOT_SEEDED' };
    }
    await (0, demo_operator_membership_service_1.assertDemoOperatorMembershipsAreDemo)();
    const membership = await client_1.prisma.companyUser.findFirst({
        where: { company_id: company.id, user_id: user.id, role: 'OWNER', deleted_at: null },
        select: { id: true },
    });
    if (!membership)
        return { error: 'DEMO_PROFILE_NOT_SEEDED' };
    const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
    const tokenHash = hashDemoSessionToken(token);
    const expiresAt = new Date(Date.now() + exports.DEMO_SESSION_TTL_MS);
    const session = await client_1.prisma.demoSession.create({
        data: { tokenHash, profile: profile.key, companyId: company.id, userId: user.id, expiresAt },
        select: { id: true, expiresAt: true },
    });
    return { token, session, profile };
}
async function resolveDemoSession(token) {
    const record = await client_1.prisma.demoSession.findUnique({
        where: { tokenHash: hashDemoSessionToken(token) },
        include: {
            company: { select: { slug: true, is_active: true, deleted_at: true } },
            user: { select: { id: true, email: true, is_active: true, deleted_at: true } },
        },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now())
        return null;
    const profile = (0, demo_profiles_1.getDemoProfile)(record.profile);
    if (!profile ||
        profile.companySlug !== record.company.slug ||
        !record.company.is_active ||
        record.company.deleted_at ||
        record.userId !== record.user.id ||
        record.user.email !== demo_profiles_1.DEMO_OPERATOR_EMAIL ||
        !record.user.is_active ||
        record.user.deleted_at)
        return null;
    return {
        id: record.id,
        tokenHash: record.tokenHash,
        userId: record.userId,
        companyId: record.companyId,
        expiresAt: record.expiresAt,
        profile,
    };
}
async function revokeDemoSession(id) {
    await client_1.prisma.demoSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
}
async function isDemoCompanyId(companyId) {
    const company = await client_1.prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
    return Boolean(company && Object.values(demo_profiles_1.DEMO_PROFILES).some((profile) => profile.companySlug === company.slug));
}
