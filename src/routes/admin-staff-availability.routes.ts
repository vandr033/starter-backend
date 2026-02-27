import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import * as StaffAvailabilityController from '../controllers/admin-staff-availability.controller';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const allRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];

// Staff availability
router.get(
    '/me/availability',
    requireAuth,
    requireCompanyRole(allRoles),
    StaffAvailabilityController.getMyAvailability
);
router.get(
    '/:id/availability',
    requireAuth,
    requireCompanyRole(adminRoles),
    StaffAvailabilityController.getStaffAvailability
);
router.put(
    '/:id/availability',
    requireAuth,
    requireCompanyRole(adminRoles),
    StaffAvailabilityController.saveStaffAvailability
);

// Staff time-off
router.get(
    '/time-off',
    requireAuth,
    requireCompanyRole(allRoles),
    StaffAvailabilityController.listTimeOffRequests
);
router.post(
    '/time-off',
    requireAuth,
    requireCompanyRole(allRoles),
    StaffAvailabilityController.createTimeOffRequest
);
router.post(
    '/time-off/:id/review',
    requireAuth,
    requireCompanyRole(adminRoles),
    StaffAvailabilityController.reviewTimeOffRequest
);
router.post(
    '/time-off/:id/cancel',
    requireAuth,
    requireCompanyRole(allRoles),
    StaffAvailabilityController.cancelTimeOffRequest
);

export default router;
