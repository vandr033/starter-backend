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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const AdminCustomerController = __importStar(require("../controllers/admin-customer.controller"));
const requireAuth_1 = require("../middlewares/requireAuth");
const client_1 = require("@prisma/client");
const requireCompanyCapability_1 = require("../middlewares/requireCompanyCapability");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});
const adminRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN];
router.get('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_BASE'), AdminCustomerController.listCustomers);
router.get('/interest-capture', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_PRO'), AdminCustomerController.listInterestCaptureLeads);
router.get('/history', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_BASE'), AdminCustomerController.getCustomerHistory);
router.get('/group-payments', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_BASE'), AdminCustomerController.getCustomerGroupPayments);
router.get('/export', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_PRO'), AdminCustomerController.exportCustomers);
router.get('/import/template', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_PRO'), AdminCustomerController.downloadImportTemplate);
router.post('/import', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_PRO'), upload.single('file'), AdminCustomerController.importCustomers);
router.post('/mass-message', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_PRO'), (0, requireCompanyCapability_1.requireCompanyCapability)('MENSAJERIA_PRO'), AdminCustomerController.sendMassMessage);
router.get('/:customerKey', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_BASE'), AdminCustomerController.getCustomerByKey);
router.put('/:customerKey', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(adminRoles), (0, requireCompanyCapability_1.requireCompanyCapability)('CRM_BASE'), AdminCustomerController.updateCustomerByKey);
exports.default = router;
