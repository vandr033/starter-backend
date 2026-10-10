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
const requirePlanFeature_1 = require("../middlewares/requirePlanFeature");
const validate_1 = require("../middlewares/validate");
const AdminGroupEventController = __importStar(require("../controllers/admin-group-event.controller"));
const group_schema_1 = require("../schemas/group.schema");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
router.use(requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_EVENTS'));
router.get('/', AdminGroupEventController.listEvents);
router.post('/', (0, validate_1.validate)(group_schema_1.createGroupEventSchema), AdminGroupEventController.createEvent);
router.get('/:eventId', AdminGroupEventController.getEventById);
router.put('/:eventId', (0, validate_1.validate)(group_schema_1.updateGroupEventSchema), AdminGroupEventController.updateEvent);
router.post('/:eventId/status', (0, validate_1.validate)(group_schema_1.setGroupItemStatusSchema), AdminGroupEventController.setEventStatus);
router.delete('/:eventId', AdminGroupEventController.deleteEvent);
router.get('/:eventId/bookings', AdminGroupEventController.listEventBookings);
router.get('/:eventId/interests', AdminGroupEventController.listEventInterests);
router.get('/:eventId/attendance', AdminGroupEventController.listEventAttendance);
router.get('/:eventId/whatsapp-groups', AdminGroupEventController.listWhatsappGroups);
router.post('/:eventId/whatsapp-groups', (0, requirePlanFeature_1.requirePlanFeature)('BULK_WHATSAPP_MESSAGING'), AdminGroupEventController.createEventWhatsappGroup);
router.post('/:eventId/whatsapp-groups/:groupId/message', (0, requirePlanFeature_1.requirePlanFeature)('BULK_WHATSAPP_MESSAGING'), AdminGroupEventController.sendMessageToWhatsappGroup);
exports.default = router;
