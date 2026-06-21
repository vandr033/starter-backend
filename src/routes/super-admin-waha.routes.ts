import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth';
import * as SuperAdminWahaController from '../controllers/super-admin-waha.controller';

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get('/waha/status', SuperAdminWahaController.getWahaStatus);
router.get('/waha/qr', SuperAdminWahaController.getWahaQr);
router.post('/waha/session/start', SuperAdminWahaController.startWahaSession);
router.post('/waha/session/restart', SuperAdminWahaController.restartWahaSession);
router.post('/waha/session/logout', SuperAdminWahaController.logoutWahaSession);

export default router;
