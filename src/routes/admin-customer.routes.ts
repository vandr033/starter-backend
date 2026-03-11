import { Router } from 'express';
import multer from 'multer';
import * as AdminCustomerController from '../controllers/admin-customer.controller';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

router.get('/', requireAuth, requireCompanyRole(adminRoles), AdminCustomerController.listCustomers);
router.get('/history', requireAuth, requireCompanyRole(adminRoles), AdminCustomerController.getCustomerHistory);
router.get('/export', requireAuth, requireCompanyRole(adminRoles), AdminCustomerController.exportCustomers);
router.get(
    '/import/template',
    requireAuth,
    requireCompanyRole(adminRoles),
    AdminCustomerController.downloadImportTemplate,
);
router.post(
    '/import',
    requireAuth,
    requireCompanyRole(adminRoles),
    upload.single('file'),
    AdminCustomerController.importCustomers,
);
router.post(
    '/mass-message',
    requireAuth,
    requireCompanyRole(adminRoles),
    AdminCustomerController.sendMassMessage,
);

export default router;
