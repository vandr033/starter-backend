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
const AdminGroupClassController = __importStar(require("../controllers/admin-group-class.controller"));
const group_schema_1 = require("../schemas/group.schema");
const router = (0, express_1.Router)();
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
router.use(requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requirePlanFeature_1.requirePlanFeature)('GROUP_CLASSES'));
router.get('/', AdminGroupClassController.listClasses);
router.post('/', (0, validate_1.validate)(group_schema_1.createGroupClassSchema), AdminGroupClassController.createClass);
router.get('/:classId', AdminGroupClassController.getClassById);
router.put('/:classId', (0, validate_1.validate)(group_schema_1.updateGroupClassSchema), AdminGroupClassController.updateClass);
router.post('/:classId/status', (0, validate_1.validate)(group_schema_1.setGroupItemStatusSchema), AdminGroupClassController.setClassStatus);
router.delete('/:classId', AdminGroupClassController.deleteClass);
router.post('/:classId/sessions/generate', AdminGroupClassController.generateClassSessions);
router.get('/:classId/sessions', AdminGroupClassController.listClassSessions);
router.get('/sessions/:sessionId', AdminGroupClassController.getSessionDetail);
router.post('/sessions/:sessionId/cancel', AdminGroupClassController.cancelSession);
router.get('/sessions/:sessionId/attendance', AdminGroupClassController.listClassSessionAttendance);
router.get('/sessions/:sessionId/public-attendance', AdminGroupClassController.getSessionPublicAttendance);
router.put('/sessions/:sessionId/public-attendance', (0, validate_1.validate)(group_schema_1.updateSessionPublicAttendanceSchema), AdminGroupClassController.updateSessionPublicAttendance);
router.post('/sessions/:sessionId/public-attendance/rotate', AdminGroupClassController.rotateSessionPublicAttendance);
router.get('/:classId/enrollments', AdminGroupClassController.listClassEnrollments);
router.post('/:classId/enrollments', AdminGroupClassController.createClassEnrollmentAdmin);
exports.default = router;
