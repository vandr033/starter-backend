import { Router } from 'express';
import * as Controller from '../controllers/public-restaurant.controller';
import * as MenuController from '../controllers/public-restaurant-menu.controller';
import { requireAuth } from '../middlewares/requireAuth';
import { demoCompanySlugWriteGuard } from '../middlewares/demo-session.middleware';
import { demoRestaurantReservationWriteGuard } from '../middlewares/demo-session.middleware';

const router = Router();
router.use('/:slug', demoCompanySlugWriteGuard);
router.get('/:slug', Controller.configuration);
router.get('/:slug/menu', MenuController.menu);
router.get('/:slug/availability', Controller.availability);
router.post('/:slug/reservations/:code/deposit-proof', Controller.restaurantDepositProofUpload, Controller.uploadReservationDepositProof);
router.post('/:slug/reservations', Controller.create);
router.get('/:slug/my-reservations', requireAuth, Controller.mine);
router.get('/reservations/:code', Controller.detail);
router.post('/reservations/:code/cancel', demoRestaurantReservationWriteGuard, Controller.cancel);
export default router;
