import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../prisma/client';
import { DEMO_OPERATOR_EMAIL, DEMO_PROFILES, getDemoProfile } from '../config/demo-profiles';
import { assertDemoOperatorMembershipsAreDemo } from './demo-operator-membership.service';

export const DEMO_SESSION_COOKIE = 'priconpri_demo_session';
export const DEMO_SESSION_TTL_MS = 45 * 60 * 1000;
export function hashDemoSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export type ResolvedDemoSession = {
    id: string;
    tokenHash: string;
    userId: string;
    companyId: number;
    expiresAt: Date;
    profile: NonNullable<ReturnType<typeof getDemoProfile>>;
};

export async function createDemoSession(profileValue: unknown) {
    const profile = getDemoProfile(profileValue);
    if (!profile) return { error: 'INVALID_DEMO_PROFILE' as const };

    const [company, user] = await Promise.all([
        prisma.company.findUnique({ where: { slug: profile.companySlug }, select: { id: true, slug: true, is_active: true, deleted_at: true } }),
        prisma.user.findUnique({ where: { email: DEMO_OPERATOR_EMAIL }, select: { id: true, is_active: true, deleted_at: true } }),
    ]);
    if (!company || !company.is_active || company.deleted_at || !user?.is_active || user.deleted_at || company.slug !== profile.companySlug) {
        return { error: 'DEMO_PROFILE_NOT_SEEDED' as const };
    }

    await assertDemoOperatorMembershipsAreDemo();

    const membership = await prisma.companyUser.findFirst({
        where: { company_id: company.id, user_id: user.id, role: 'OWNER', deleted_at: null },
        select: { id: true },
    });
    if (!membership) return { error: 'DEMO_PROFILE_NOT_SEEDED' as const };

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashDemoSessionToken(token);
    const expiresAt = new Date(Date.now() + DEMO_SESSION_TTL_MS);
    const session = await prisma.demoSession.create({
        data: { tokenHash, profile: profile.key, companyId: company.id, userId: user.id, expiresAt },
        select: { id: true, expiresAt: true },
    });

    return { token, session, profile };
}

export async function resolveDemoSession(token: string): Promise<ResolvedDemoSession | null> {
    const record = await prisma.demoSession.findUnique({
        where: { tokenHash: hashDemoSessionToken(token) },
        include: {
        company: { select: { slug: true, is_active: true, deleted_at: true } },
            user: { select: { id: true, email: true, is_active: true, deleted_at: true } },
        },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) return null;

    const profile = getDemoProfile(record.profile);
    if (
        !profile ||
        profile.companySlug !== record.company.slug ||
        !record.company.is_active ||
        record.company.deleted_at ||
        record.userId !== record.user.id ||
        record.user.email !== DEMO_OPERATOR_EMAIL ||
        !record.user.is_active ||
        record.user.deleted_at
    ) return null;

    return {
        id: record.id,
        tokenHash: record.tokenHash,
        userId: record.userId,
        companyId: record.companyId,
        expiresAt: record.expiresAt,
        profile,
    };
}

export async function revokeDemoSession(id: string) {
    await prisma.demoSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function isDemoCompanyId(companyId: number): Promise<boolean> {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
    return Boolean(company && Object.values(DEMO_PROFILES).some((profile) => profile.companySlug === company.slug));
}
