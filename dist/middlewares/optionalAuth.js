"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = optionalAuth;
const auth_1 = require("../config/auth");
const client_1 = require("../prisma/client");
/**
 * Like requireAuth but does not reject unauthenticated requests.
 * Sets req.authUser if a valid session exists, otherwise leaves it undefined.
 */
async function optionalAuth(req, _res, next) {
    try {
        const auth = await (0, auth_1.getAuth)();
        const session = await auth.api.getSession({ headers: req.headers });
        if (session?.user?.id) {
            const fullUser = await client_1.prisma.user.findUnique({
                where: { id: session.user.id },
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                    name: true,
                    country_code: true,
                    gender: true,
                    age: true,
                    phone_prefix: true,
                    phoneNumber: true,
                    emailVerified: true,
                    phoneNumberVerified: true,
                    image: true,
                    is_super_admin: true,
                    is_active: true,
                },
            });
            if (fullUser) {
                req.authUser = fullUser;
            }
        }
    }
    catch {
        // Ignore auth errors — treat as unauthenticated
    }
    next();
}
