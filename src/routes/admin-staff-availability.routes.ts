import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import * as StaffAvailabilityController from '../controllers/admin-staff-availability.controller';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const allRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];
const requireAvailabilityFeature = requirePlanFeature('STAFF_AVAILABILITY');

// Staff availability
router.get(
    '/me/availability',
    requireAuth,
    requireCompanyRole(allRoles),
    requireAvailabilityFeature,
    StaffAvailabilityController.getMyAvailability
);
router.get(
    '/:id/availability',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireAvailabilityFeature,
    StaffAvailabilityController.getStaffAvailability
);
router.put(
    '/:id/availability',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireAvailabilityFeature,
    StaffAvailabilityController.saveStaffAvailability
);
router.post(
    '/:id/availability/from-company-hours',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireAvailabilityFeature,
    StaffAvailabilityController.assignStaffAvailabilityFromCompanyHours
);

// Staff time-off
router.get(
    '/time-off',
    requireAuth,
    requireCompanyRole(allRoles),
    requireAvailabilityFeature,
    StaffAvailabilityController.listTimeOffRequests
);
router.post(
    '/time-off',
    requireAuth,
    requireCompanyRole(allRoles),
    requireAvailabilityFeature,
    StaffAvailabilityController.createTimeOffRequest
);
router.post(
    '/time-off/:id/review',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireAvailabilityFeature,
    StaffAvailabilityController.reviewTimeOffRequest
);
router.post(
    '/time-off/:id/cancel',
    requireAuth,
    requireCompanyRole(allRoles),
    requireAvailabilityFeature,
    StaffAvailabilityController.cancelTimeOffRequest
);

export default router;
