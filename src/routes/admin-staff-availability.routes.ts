import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import * as StaffAvailabilityController from '../controllers/admin-staff-availability.controller';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { requireCompanyModule } from '../middlewares/requireCompanyModule';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const allRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];
const requireAvailabilityFeature = requirePlanFeature('STAFF_AVAILABILITY');

// Staff availability
router.get(
    '/me/availability',
    requireAuth,
    requireCompanyRole(allRoles),
    requireCompanyModule('RESERVATIONS'),
    requireAvailabilityFeature,
    StaffAvailabilityController.getMyAvailability
);
router.get(
    '/:id/availability',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requireAvailabilityFeature,
    StaffAvailabilityController.getStaffAvailability
);
router.put(
    '/:id/availability',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requireAvailabilityFeature,
    StaffAvailabilityController.saveStaffAvailability
);

// Staff time-off
router.get(
    '/time-off',
    requireAuth,
    requireCompanyRole(allRoles),
    requireCompanyModule('RESERVATIONS'),
    requireAvailabilityFeature,
    StaffAvailabilityController.listTimeOffRequests
);
router.post(
    '/time-off',
    requireAuth,
    requireCompanyRole(allRoles),
    requireCompanyModule('RESERVATIONS'),
    requireAvailabilityFeature,
    StaffAvailabilityController.createTimeOffRequest
);
router.post(
    '/time-off/:id/review',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyModule('RESERVATIONS'),
    requireAvailabilityFeature,
    StaffAvailabilityController.reviewTimeOffRequest
);
router.post(
    '/time-off/:id/cancel',
    requireAuth,
    requireCompanyRole(allRoles),
    requireCompanyModule('RESERVATIONS'),
    requireAvailabilityFeature,
    StaffAvailabilityController.cancelTimeOffRequest
);

export default router;
