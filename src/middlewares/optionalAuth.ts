import type { Request, Response, NextFunction } from 'express';
import { getAuth } from '../config/auth';
import { prisma } from '../prisma/client';
import type { AuthenticatedRequest } from './requireAuth';

/**
 * Like requireAuth but does not reject unauthenticated requests.
 * Sets req.authUser if a valid session exists, otherwise leaves it undefined.
 */
export async function optionalAuth(
    req: Request,
    _res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const auth = await getAuth();
        const session = await auth.api.getSession({ headers: req.headers as any });

        if (session?.user?.id) {
            const fullUser = await prisma.user.findUnique({
                where: { id: session.user.id },
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    name: true,
                    gender: true,
                    age: true,
                    phone_prefix: true,
                    phoneNumber: true,
                    is_super_admin: true,
                    is_active: true,
                },
            });
            if (fullUser) {
                (req as AuthenticatedRequest).authUser = fullUser;
            }
        }
    } catch {
        // Ignore auth errors — treat as unauthenticated
    }
    next();
}
