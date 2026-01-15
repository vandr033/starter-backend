import { Router } from 'express';
import { validate } from '../middlewares/validate';
import * as AuthController from '../controllers/auth.controller';
import {
  loginSchema,
  refreshSchema,
  checkRefreshSchema,
  logoutSchema,
  logoutAllSchema,
} from '../schemas/auth.schema';

const router = Router();

//email verification
router.post('/customer/email/start', AuthController.sendVerificationCodeEmail)
router.post('/customer/email/verify', AuthController.verifyVerificationCodeEmail)

router.post('/customer/test', (req, res) => {
  res.json({ message: 'Customer test route' });
})

router.post('/customer/complete-email', AuthController.completeCustomerRegistrationEmail)
export default router;
