import { Router } from 'express';
import * as DemoController from '../controllers/demo.controller';

const router = Router();

router.get('/profiles', DemoController.listDemoProfiles);
router.get('/public/:slug', DemoController.getPublicDemoProfile);
router.get('/session', DemoController.getDemoSession);
router.post('/launch', DemoController.launchDemo);
router.post('/logout', DemoController.logoutDemo);

export default router;
