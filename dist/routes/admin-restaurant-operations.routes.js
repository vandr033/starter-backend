"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const requireAuth_1 = require("../middlewares/requireAuth");
const requireRestaurantCompanyContext_1 = require("../middlewares/requireRestaurantCompanyContext");
const requirePlanFeature_1 = require("../middlewares/requirePlanFeature");
const requireRestaurantAccess_1 = require("../middlewares/requireRestaurantAccess");
const requireRestaurantShiftRole_1 = require("../middlewares/requireRestaurantShiftRole");
const validate_1 = require("../middlewares/validate");
const Controller = __importStar(require("../controllers/admin-restaurant-operations.controller"));
const restaurant_operations_schema_1 = require("../schemas/restaurant-operations.schema");
const router = (0, express_1.Router)();
const managers = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
const query = (schema) => (req, res, next) => { const parsed = schema.safeParse(req.query); if (!parsed.success)
    return res.status(400).json({ code: 400, error: true, message: 'Parámetros inválidos.', errors: parsed.error.flatten() }); req.validatedQuery = parsed.data; return next(); };
router.use(requireAuth_1.requireAuth);
const waitlistCompanyRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN, client_1.CompanyUserRole.STAFF];
const waitlistShiftRoles = [client_1.RestaurantShiftMemberRole.HOST, client_1.RestaurantShiftMemberRole.MANAGER];
router.get('/waitlist/recommendations', (0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(waitlistCompanyRoles), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess, (0, requireRestaurantShiftRole_1.requireRestaurantShiftRole)(waitlistShiftRoles), query(restaurant_operations_schema_1.waitlistRecommendationSchema), Controller.waitlistRecommendations);
router.get('/waitlist', (0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(waitlistCompanyRoles), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess, (0, requireRestaurantShiftRole_1.requireRestaurantShiftRole)(waitlistShiftRoles), query(restaurant_operations_schema_1.waitlistQuerySchema), Controller.listWaitlist);
router.post('/waitlist', (0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(waitlistCompanyRoles), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess, (0, requireRestaurantShiftRole_1.requireRestaurantShiftRole)(waitlistShiftRoles), (0, validate_1.validate)(restaurant_operations_schema_1.waitlistSchema), Controller.addWaitlist);
router.patch('/waitlist/:id', (0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(waitlistCompanyRoles), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess, (0, requireRestaurantShiftRole_1.requireRestaurantShiftRole)(waitlistShiftRoles), (0, validate_1.validate)(restaurant_operations_schema_1.waitlistUpdateSchema), Controller.updateWaitlist);
router.post('/waitlist/:id/seat', (0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(waitlistCompanyRoles), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess, (0, requireRestaurantShiftRole_1.requireRestaurantShiftRole)(waitlistShiftRoles), (0, validate_1.validate)(restaurant_operations_schema_1.seatWaitlistSchema), Controller.seatWaitlist);
router.use((0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(managers), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess);
router.get('/visits', query(restaurant_operations_schema_1.visitQuerySchema), Controller.listVisits);
router.post('/visits', (0, validate_1.validate)(restaurant_operations_schema_1.restaurantVisitSchema), Controller.saveVisit);
router.get('/visits/:id', Controller.getVisit);
router.post('/visits/:id/reopen', (0, validate_1.validate)(restaurant_operations_schema_1.reopenVisitSchema), Controller.reopenVisit);
router.get('/financial-metrics', query(restaurant_operations_schema_1.visitQuerySchema.pick({ dateFrom: true, dateTo: true })), Controller.financialMetrics);
router.get('/deposits', query(restaurant_operations_schema_1.depositQuerySchema), Controller.listDeposits);
router.get('/deposits/:id/proof', Controller.depositProof);
router.get('/deposits/:id', Controller.getDeposit);
router.post('/deposits/:id/review', (0, validate_1.validate)(restaurant_operations_schema_1.depositReviewSchema), Controller.reviewDeposit);
router.post('/deposits/:id/reminder', Controller.remindDeposit);
router.get('/crm/profiles', query(restaurant_operations_schema_1.crmQuerySchema), Controller.listCrm);
router.get('/crm/profiles/:customerProfileId', Controller.getCrm);
router.patch('/crm/profiles/:customerProfileId', (0, validate_1.validate)(restaurant_operations_schema_1.crmProfileSchema), Controller.updateCrm);
router.post('/crm/profiles/:customerProfileId/recalculate', Controller.recalculateCrm);
router.get('/closeouts', query(restaurant_operations_schema_1.closeoutQuerySchema), Controller.listCloseouts);
router.get('/shifts/:shiftId/closeout', Controller.getCloseout);
router.get('/shifts/:shiftId/closeout/preview', Controller.previewCloseout);
router.get('/shifts/:shiftId/closeout/export', Controller.exportCloseout);
router.post('/shifts/:shiftId/closeout', (0, validate_1.validate)(restaurant_operations_schema_1.closeoutSchema), Controller.closeCloseout);
router.post('/shifts/:shiftId/closeout/finalize', Controller.finalizeCloseout);
router.post('/shifts/:shiftId/closeout/reopen', (0, validate_1.validate)(restaurant_operations_schema_1.closeoutReopenSchema), Controller.reopenCloseout);
router.post('/shifts/:shiftId/closeout/adjust', (0, validate_1.validate)(restaurant_operations_schema_1.closeoutAdjustmentSchema), Controller.adjustCloseout);
exports.default = router;
