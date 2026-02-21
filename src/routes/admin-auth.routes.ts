import { Router } from 'express';
import * as AdminAuthController from '../controllers/admin-auth.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

const router = Router();

// POST /api/admin/auth/sign-in - No auth required (this is the login endpoint)
router.post('/sign-in', AdminAuthController.adminSignIn);

// POST /api/admin/auth/sign-out - Requires auth
router.post('/sign-out', requireAuth, AdminAuthController.adminSignOut);

// GET /api/admin/auth/session - Requires auth only (no role check for basic validation)
router.get('/session', requireAuth, AdminAuthController.getAdminSession);

// GET /api/admin/auth/session-with-role - Requires auth + admin/owner/staff role
router.get(
    '/session-with-role',
    requireAuth,
    requireCompanyRole([
        CompanyUserRole.OWNER,
        CompanyUserRole.ADMIN,
        CompanyUserRole.STAFF,
    ]),
    AdminAuthController.getAdminSession
);

export default router;
