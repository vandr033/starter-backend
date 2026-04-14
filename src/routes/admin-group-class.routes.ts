import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { requireCompanyModule } from '../middlewares/requireCompanyModule';
import { validate } from '../middlewares/validate';
import * as AdminGroupClassController from '../controllers/admin-group-class.controller';
import { createGroupClassSchema, setGroupItemStatusSchema, updateGroupClassSchema } from '../schemas/group.schema';

const router = Router();
const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

router.use(requireAuth, requireCompanyRole(adminRoles), requireCompanyModule('RESERVATIONS'), requirePlanFeature('GROUP_CLASSES'));

router.get('/', AdminGroupClassController.listClasses);
router.post('/', validate(createGroupClassSchema), AdminGroupClassController.createClass);
router.get('/:classId', AdminGroupClassController.getClassById);
router.put('/:classId', validate(updateGroupClassSchema), AdminGroupClassController.updateClass);
router.post('/:classId/status', validate(setGroupItemStatusSchema), AdminGroupClassController.setClassStatus);
router.delete('/:classId', AdminGroupClassController.deleteClass);

router.post('/:classId/sessions/generate', AdminGroupClassController.generateClassSessions);
router.get('/:classId/sessions', AdminGroupClassController.listClassSessions);
router.get('/sessions/:sessionId', AdminGroupClassController.getSessionDetail);
router.post('/sessions/:sessionId/cancel', AdminGroupClassController.cancelSession);
router.get('/sessions/:sessionId/attendance', AdminGroupClassController.listClassSessionAttendance);

router.get('/:classId/enrollments', AdminGroupClassController.listClassEnrollments);

export default router;
