import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { requireCompanyModule } from '../middlewares/requireCompanyModule';
import { validate } from '../middlewares/validate';
import * as AdminGroupEventController from '../controllers/admin-group-event.controller';
import { createGroupEventSchema, setGroupItemStatusSchema, updateGroupEventSchema } from '../schemas/group.schema';

const router = Router();
const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

router.use(requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), requirePlanFeature('GROUP_EVENTS'));

router.get('/', AdminGroupEventController.listEvents);
router.post('/', validate(createGroupEventSchema), AdminGroupEventController.createEvent);
router.get('/:eventId', AdminGroupEventController.getEventById);
router.put('/:eventId', validate(updateGroupEventSchema), AdminGroupEventController.updateEvent);
router.post('/:eventId/status', validate(setGroupItemStatusSchema), AdminGroupEventController.setEventStatus);
router.delete('/:eventId', AdminGroupEventController.deleteEvent);

router.get('/:eventId/bookings', AdminGroupEventController.listEventBookings);
router.get('/:eventId/interests', AdminGroupEventController.listEventInterests);
router.get('/:eventId/attendance', AdminGroupEventController.listEventAttendance);

export default router;
