import { Router } from 'express';
import multer from 'multer';
import * as AdminCustomerController from '../controllers/admin-customer.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import { requireCompanyCapability } from '../middlewares/requireCompanyCapability';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

router.get(
    '/',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_BASE'),
    AdminCustomerController.listCustomers,
);
router.get(
    '/interest-capture',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_PRO'),
    AdminCustomerController.listInterestCaptureLeads,
);
router.get(
    '/history',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_BASE'),
    AdminCustomerController.getCustomerHistory,
);
router.get(
    '/group-payments',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_BASE'),
    AdminCustomerController.getCustomerGroupPayments,
);
router.get(
    '/export',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_PRO'),
    AdminCustomerController.exportCustomers,
);
router.get(
    '/import/template',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_PRO'),
    AdminCustomerController.downloadImportTemplate,
);
router.post(
    '/import',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_PRO'),
    upload.single('file'),
    AdminCustomerController.importCustomers,
);
router.post(
    '/mass-message',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_PRO'),
    requireCompanyCapability('MENSAJERIA_PRO'),
    AdminCustomerController.sendMassMessage,
);
router.get(
    '/:customerKey',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_BASE'),
    AdminCustomerController.getCustomerByKey,
);
router.put(
    '/:customerKey',
    requireAuth,
    requireCompanyRole(adminRoles),
    requireCompanyCapability('CRM_BASE'),
    AdminCustomerController.updateCustomerByKey,
);

export default router;
