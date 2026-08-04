import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRestaurantCompanyContext } from '../middlewares/requireRestaurantCompanyContext';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { requireRestaurantAccess } from '../middlewares/requireRestaurantAccess';
import { validate } from '../middlewares/validate';
import * as Controller from '../controllers/admin-restaurant-floor.controller';
import { restaurantFloorQuerySchema, relocateRestaurantReservationSchema, tableCombinationSchema, tableStateSchema } from '../schemas/restaurant-shift.schema';

const router = Router();
router.use(requireAuth, requireRestaurantCompanyContext([CompanyUserRole.OWNER, CompanyUserRole.ADMIN]), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess);
const query = (req: any, res: any, next: any) => { const parsed = restaurantFloorQuerySchema.safeParse(req.query); if (!parsed.success) return res.status(400).json({ code: 400, error: true, message: 'Consulta de piso inválida.', errors: parsed.error.flatten() }); req.validatedQuery = parsed.data; return next(); };
router.get('/floor', query, Controller.floor);
router.get('/floor/at-risk', query, Controller.floor);
router.get('/floor/reservations/:id/alternatives', query, Controller.alternatives);
router.post('/floor/reservations/:id/relocate', validate(relocateRestaurantReservationSchema), Controller.relocate);
router.post('/floor/tables/:id/status', validate(tableStateSchema), Controller.tableStatus);
router.get('/combinations', Controller.listCombinations);
router.post('/combinations', validate(tableCombinationSchema), Controller.createCombination);
router.delete('/combinations/:id', Controller.deleteCombination);
router.post('/combination-sessions/:id/release', Controller.releaseCombination);

export default router;
