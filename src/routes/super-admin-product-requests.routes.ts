import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth';
import { validate } from '../middlewares/validate';
import {
    approveRequest,
    cancelRequest,
    getProductAccessRequests,
    rejectRequest,
} from '../controllers/super-admin-product-requests.controller';
import { resolveProductAccessRequestSchema } from '../schemas/product-access-requests.schema';

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get('/product-requests', getProductAccessRequests);
router.post('/product-requests/:id/approve', validate(resolveProductAccessRequestSchema), approveRequest);
router.post('/product-requests/:id/reject', validate(resolveProductAccessRequestSchema), rejectRequest);
router.post('/product-requests/:id/cancel', validate(resolveProductAccessRequestSchema), cancelRequest);

export default router;
