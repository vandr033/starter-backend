import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRestaurantCompanyContext } from '../middlewares/requireRestaurantCompanyContext';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { requireRestaurantAccess } from '../middlewares/requireRestaurantAccess';
import { validate } from '../middlewares/validate';
import * as Controller from '../controllers/admin-restaurant-staff.controller';
import { tableStateSchema, waiterInternalNoteSchema, waiterReservationStatusSchema } from '../schemas/restaurant-shift.schema';
import { staffVisitSchema } from '../schemas/restaurant-operations.schema';
import * as OperationsController from '../controllers/admin-restaurant-operations.controller';

const router = Router();
router.use(requireAuth, requireRestaurantCompanyContext([CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF]), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess);
router.get('/my-shift', Controller.currentShift);
router.get('/my-shifts', Controller.upcomingShifts);
router.post('/my-floor/tables/:id/status', validate(tableStateSchema), Controller.tableStatus);
router.post('/my-floor/reservations/:id/status', validate(waiterReservationStatusSchema), Controller.reservationStatus);
router.post('/my-floor/notes', validate(waiterInternalNoteSchema), Controller.note);
router.post('/my-floor/visits', validate(staffVisitSchema), OperationsController.saveStaffVisit);

export default router;
