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
const validate_1 = require("../middlewares/validate");
const Controller = __importStar(require("../controllers/admin-restaurant-shifts.controller"));
const restaurant_shift_schema_1 = require("../schemas/restaurant-shift.schema");
const router = (0, express_1.Router)();
const managerRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
const staffRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN, client_1.CompanyUserRole.STAFF];
router.use(requireAuth_1.requireAuth);
router.get('/my-shifts', (0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(staffRoles), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess, Controller.mine);
router.use((0, requireRestaurantCompanyContext_1.requireRestaurantCompanyContext)(managerRoles), (0, requirePlanFeature_1.requirePlanFeature)('RESTAURANT_MODULE'), requireRestaurantAccess_1.requireRestaurantAccess);
router.get('/shifts', (req, res, next) => { const parsed = restaurant_shift_schema_1.restaurantShiftQuerySchema.safeParse(req.query); if (!parsed.success)
    return res.status(400).json({ code: 400, error: true, message: 'Rango de turnos inválido.', errors: parsed.error.flatten() }); req.validatedQuery = parsed.data; return next(); }, Controller.list);
router.get('/shifts/:id', Controller.get);
router.post('/shifts', (0, validate_1.validate)(restaurant_shift_schema_1.createRestaurantShiftSchema), Controller.create);
router.patch('/shifts/:id', (0, validate_1.validate)(restaurant_shift_schema_1.updateRestaurantShiftSchema), Controller.update);
router.delete('/shifts/:id', Controller.remove);
router.post('/shifts/:id/open', Controller.open);
router.post('/shifts/:id/close', Controller.close);
router.post('/shifts/:id/cancel', Controller.cancel);
router.put('/shifts/:id/members', (0, validate_1.validate)(restaurant_shift_schema_1.replaceShiftMembersSchema), Controller.members);
router.put('/shifts/:id/dining-areas', (0, validate_1.validate)(restaurant_shift_schema_1.replaceShiftDiningAreasSchema), Controller.areas);
router.put('/shifts/:id/assignments', (0, validate_1.validate)(restaurant_shift_schema_1.replaceShiftAssignmentsSchema), Controller.assignments);
router.put('/shifts/:id/setup', (0, validate_1.validate)(restaurant_shift_schema_1.replaceShiftSetupSchema), Controller.setup);
router.post('/shifts/:id/copy', (0, validate_1.validate)(restaurant_shift_schema_1.copyShiftSchema), Controller.copy);
router.post('/shifts/:id/template', (0, validate_1.validate)(restaurant_shift_schema_1.saveShiftTemplateSchema), Controller.saveTemplate);
router.get('/shift-templates', Controller.listTemplates);
router.post('/shift-templates/use', (0, validate_1.validate)(restaurant_shift_schema_1.useShiftTemplateSchema), Controller.useTemplate);
exports.default = router;
