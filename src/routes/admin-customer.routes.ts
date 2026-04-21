import { Router } from 'express';
import multer from 'multer';
import * as AdminCustomerController from '../controllers/admin-customer.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import { requirePlanFeature } from '../middlewares/requirePlanFeature';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

router.get('/', requireAuth, requireCompanyRole(adminRoles), AdminCustomerController.listCustomers);
router.get('/interest-capture', requireAuth, requireCompanyRole(adminRoles), AdminCustomerController.listInterestCaptureLeads);
router.get('/history', requireAuth, requireCompanyRole(adminRoles), AdminCustomerController.getCustomerHistory);
router.get('/group-payments', requireAuth, requireCompanyRole(adminRoles), AdminCustomerController.getCustomerGroupPayments);
router.get(
    '/export',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('CUSTOMER_IMPORT_EXPORT'),
    AdminCustomerController.exportCustomers,
);
router.get(
    '/import/template',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('CUSTOMER_IMPORT_EXPORT'),
    AdminCustomerController.downloadImportTemplate,
);
router.post(
    '/import',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('CUSTOMER_IMPORT_EXPORT'),
    upload.single('file'),
    AdminCustomerController.importCustomers,
);
router.post(
    '/mass-message',
    requireAuth,
    requireCompanyRole(adminRoles),
    requirePlanFeature('BULK_WHATSAPP_MESSAGING'),
    AdminCustomerController.sendMassMessage,
);

export default router;
