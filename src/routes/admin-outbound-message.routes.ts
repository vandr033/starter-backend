import { Router } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import * as Controller from '../controllers/admin-outbound-message.controller';

const router = Router();
const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];
const admin = [requireAuth, requireCompanyRole(adminRoles)];

router.get('/batches/:batchId', ...admin, Controller.getBatch);
router.post('/batches/:batchId/retry', ...admin, Controller.retryBatch);
router.post('/batches/:batchId/cancel', ...admin, Controller.cancelBatch);
router.post('/jobs/:jobId/retry', ...admin, Controller.retryJob);
router.post('/jobs/:jobId/cancel', ...admin, Controller.cancelJob);

export default router;

