import { Router } from 'express';
import { CompanyUserRole, RestaurantShiftMemberRole } from '@prisma/client';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRestaurantCompanyContext } from '../middlewares/requireRestaurantCompanyContext';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';
import { requireRestaurantAccess } from '../middlewares/requireRestaurantAccess';
import { requireRestaurantShiftRole } from '../middlewares/requireRestaurantShiftRole';
import { validate } from '../middlewares/validate';
import * as Controller from '../controllers/admin-restaurant-operations.controller';
import { closeoutAdjustmentSchema, closeoutQuerySchema, closeoutReopenSchema, closeoutSchema, crmProfileSchema, crmQuerySchema, depositQuerySchema, depositReviewSchema, restaurantVisitSchema, reopenVisitSchema, seatWaitlistSchema, visitQuerySchema, waitlistQuerySchema, waitlistRecommendationSchema, waitlistSchema, waitlistUpdateSchema } from '../schemas/restaurant-operations.schema';

const router = Router();
const managers = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const query = (schema: any) => (req: any, res: any, next: any) => { const parsed = schema.safeParse(req.query); if (!parsed.success) return res.status(400).json({ code: 400, error: true, message: 'Parámetros inválidos.', errors: parsed.error.flatten() }); req.validatedQuery = parsed.data; return next(); };

router.use(requireAuth);

const waitlistCompanyRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];
const waitlistShiftRoles = [RestaurantShiftMemberRole.HOST, RestaurantShiftMemberRole.MANAGER];
router.get('/waitlist/recommendations', requireRestaurantCompanyContext(waitlistCompanyRoles), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess, requireRestaurantShiftRole(waitlistShiftRoles), query(waitlistRecommendationSchema), Controller.waitlistRecommendations);
router.get('/waitlist', requireRestaurantCompanyContext(waitlistCompanyRoles), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess, requireRestaurantShiftRole(waitlistShiftRoles), query(waitlistQuerySchema), Controller.listWaitlist);
router.post('/waitlist', requireRestaurantCompanyContext(waitlistCompanyRoles), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess, requireRestaurantShiftRole(waitlistShiftRoles), validate(waitlistSchema), Controller.addWaitlist);
router.patch('/waitlist/:id', requireRestaurantCompanyContext(waitlistCompanyRoles), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess, requireRestaurantShiftRole(waitlistShiftRoles), validate(waitlistUpdateSchema), Controller.updateWaitlist);
router.post('/waitlist/:id/seat', requireRestaurantCompanyContext(waitlistCompanyRoles), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess, requireRestaurantShiftRole(waitlistShiftRoles), validate(seatWaitlistSchema), Controller.seatWaitlist);

router.use(requireRestaurantCompanyContext(managers), requirePlanFeature('RESTAURANT_MODULE'), requireRestaurantAccess);
router.get('/visits', query(visitQuerySchema), Controller.listVisits);
router.post('/visits', validate(restaurantVisitSchema), Controller.saveVisit);
router.get('/visits/:id', Controller.getVisit);
router.post('/visits/:id/reopen', validate(reopenVisitSchema), Controller.reopenVisit);
router.get('/financial-metrics', query(visitQuerySchema.pick({ dateFrom: true, dateTo: true })), Controller.financialMetrics);

router.get('/deposits', query(depositQuerySchema), Controller.listDeposits);
router.get('/deposits/:id/proof', Controller.depositProof);
router.get('/deposits/:id', Controller.getDeposit);
router.post('/deposits/:id/review', validate(depositReviewSchema), Controller.reviewDeposit);
router.post('/deposits/:id/reminder', Controller.remindDeposit);

router.get('/crm/profiles', query(crmQuerySchema), Controller.listCrm);
router.get('/crm/profiles/:customerProfileId', Controller.getCrm);
router.patch('/crm/profiles/:customerProfileId', validate(crmProfileSchema), Controller.updateCrm);
router.post('/crm/profiles/:customerProfileId/recalculate', Controller.recalculateCrm);

router.get('/closeouts', query(closeoutQuerySchema), Controller.listCloseouts);
router.get('/shifts/:shiftId/closeout', Controller.getCloseout);
router.get('/shifts/:shiftId/closeout/preview', Controller.previewCloseout);
router.get('/shifts/:shiftId/closeout/export', Controller.exportCloseout);
router.post('/shifts/:shiftId/closeout', validate(closeoutSchema), Controller.closeCloseout);
router.post('/shifts/:shiftId/closeout/finalize', Controller.finalizeCloseout);
router.post('/shifts/:shiftId/closeout/reopen', validate(closeoutReopenSchema), Controller.reopenCloseout);
router.post('/shifts/:shiftId/closeout/adjust', validate(closeoutAdjustmentSchema), Controller.adjustCloseout);

export default router;
