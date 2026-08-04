import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRestaurantCompanyContext } from '../middlewares/requireRestaurantCompanyContext';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { requireRestaurantAccess } from '../middlewares/requireRestaurantAccess';
import { validate } from '../middlewares/validate';
import * as Controller from '../controllers/admin-restaurant-shifts.controller';
import { copyShiftSchema, createRestaurantShiftSchema, replaceShiftAssignmentsSchema, replaceShiftDiningAreasSchema, replaceShiftMembersSchema, replaceShiftSetupSchema, restaurantShiftQuerySchema, saveShiftTemplateSchema, updateRestaurantShiftSchema, useShiftTemplateSchema } from '../schemas/restaurant-shift.schema';

const router = Router();
const managerRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const staffRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];
router.use(requireAuth);

router.get('/my-shifts', requireRestaurantCompanyContext(staffRoles), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess, Controller.mine);

router.use(requireRestaurantCompanyContext(managerRoles), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess);
router.get('/shifts', (req, res, next) => { const parsed = restaurantShiftQuerySchema.safeParse(req.query); if (!parsed.success) return res.status(400).json({ code: 400, error: true, message: 'Rango de turnos inválido.', errors: parsed.error.flatten() }); (req as any).validatedQuery = parsed.data; return next(); }, Controller.list);
router.get('/shifts/:id', Controller.get);
router.post('/shifts', validate(createRestaurantShiftSchema), Controller.create);
router.patch('/shifts/:id', validate(updateRestaurantShiftSchema), Controller.update);
router.delete('/shifts/:id', Controller.remove);
router.post('/shifts/:id/open', Controller.open);
router.post('/shifts/:id/close', Controller.close);
router.post('/shifts/:id/cancel', Controller.cancel);
router.put('/shifts/:id/members', validate(replaceShiftMembersSchema), Controller.members);
router.put('/shifts/:id/dining-areas', validate(replaceShiftDiningAreasSchema), Controller.areas);
router.put('/shifts/:id/assignments', validate(replaceShiftAssignmentsSchema), Controller.assignments);
router.put('/shifts/:id/setup', validate(replaceShiftSetupSchema), Controller.setup);
router.post('/shifts/:id/copy', validate(copyShiftSchema), Controller.copy);
router.post('/shifts/:id/template', validate(saveShiftTemplateSchema), Controller.saveTemplate);
router.get('/shift-templates', Controller.listTemplates);
router.post('/shift-templates/use', validate(useShiftTemplateSchema), Controller.useTemplate);

export default router;
