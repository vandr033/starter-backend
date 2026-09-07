import { Router } from 'express';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import {
    getCompanySettings,
    getCompanySubscriptionHistory,
    updateCompanySettings,
    resetCompanySettings,
} from '../controllers/admin-settings.controller';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// GET /api/admin/settings - Get company settings
router.get(
    '/',
    requireAuth,
    requireCompanyRole(adminRoles),
    getCompanySettings
);

// GET /api/admin/settings/subscription-history - Get current plan snapshot and subscription history
router.get(
    '/subscription-history',
    requireAuth,
    requireCompanyRole(adminRoles, { allowRenewalOnly: true }),
    getCompanySubscriptionHistory,
);

// PUT /api/admin/settings - Update company settings
router.put(
    '/',
    requireAuth,
    requireCompanyRole(adminRoles),
    updateCompanySettings
);

// DELETE /api/admin/settings - Reset company settings to defaults
router.delete(
    '/',
    requireAuth,
    requireCompanyRole(adminRoles),
    resetCompanySettings
);

export default router;
