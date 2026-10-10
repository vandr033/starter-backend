"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRestaurantShiftRole = requireRestaurantShiftRole;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
/**
 * Restricts staff-only restaurant operations to the role they hold in the
 * currently open shift. Company owners/admins already passed the company-role
 * middleware and retain access to manager routes.
 */
function requireRestaurantShiftRole(allowedRoles) {
    return async (req, res, next) => {
        const companyId = req.companyID;
        const companyUser = req.companyUser;
        const userId = req.authUser?.id;
        if (!companyId || !userId)
            return res.status(401).json({ code: 401, error: true, message: 'Sesión no válida.' });
        if (companyUser?.role === client_1.CompanyUserRole.OWNER || companyUser?.role === client_1.CompanyUserRole.ADMIN)
            return next();
        if (req.companyAccess && req.companyAccess.companyId === companyId) {
            const activeShiftRole = req.companyAccess.restaurant.activeShiftRole;
            if (activeShiftRole && allowedRoles.includes(activeShiftRole)) {
                req.restaurantShiftMember = {
                    id: null,
                    shift_id: req.companyAccess.restaurant.activeShiftId,
                    role: activeShiftRole,
                };
                return next();
            }
            return res.status(403).json({
                code: 403,
                error: true,
                errorCode: 'RESTAURANT_SHIFT_ROLE_REQUIRED',
                reason: 'RESTAURANT_SHIFT_ROLE_REQUIRED',
                message: 'Esta operación requiere un rol de anfitrión o encargado en el turno activo.',
            });
        }
        try {
            const now = new Date();
            const member = await client_2.prisma.restaurantShiftMember.findFirst({
                where: {
                    company_id: companyId,
                    user_id: userId,
                    role: { in: allowedRoles },
                    shift: {
                        company_id: companyId,
                        status: 'OPEN',
                        start_at: { lte: now },
                        end_at: { gt: now },
                    },
                },
                select: { id: true, shift_id: true, role: true },
            });
            if (!member) {
                return res.status(403).json({
                    code: 403,
                    error: true,
                    errorCode: 'RESTAURANT_SHIFT_ROLE_REQUIRED',
                    reason: 'RESTAURANT_SHIFT_ROLE_REQUIRED',
                    message: 'Esta operación requiere un rol de anfitrión o encargado en el turno activo.',
                });
            }
            req.restaurantShiftMember = member;
            return next();
        }
        catch (error) {
            console.error('Error resolving restaurant shift role:', error);
            return res.status(500).json({ code: 500, error: true, message: 'No pudimos validar tu rol operativo.' });
        }
    };
}
