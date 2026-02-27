import { Router } from 'express';
import * as StaffInviteController from '../controllers/staff-invite.controller';

const router = Router();

// Public routes (no auth required)
router.get('/invite-info/:token', StaffInviteController.getInviteInfo);
router.post('/accept-invite', StaffInviteController.acceptInvite);

export default router;
