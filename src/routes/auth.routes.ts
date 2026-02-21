import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// ── Email registration (signup) ──
router.post('/customer/email/start', AuthController.sendVerificationCodeEmail);
router.post('/customer/email/verify', AuthController.verifyVerificationCodeEmail);
router.post('/customer/complete-email', AuthController.completeCustomerRegistrationEmail);

// ── Email login (OTP) — clients only ──
router.post('/customer/login/email/start', AuthController.sendLoginOtpEmail);
router.post('/customer/login/email/verify', AuthController.verifyLoginOtpEmail);

// ── Phone login (OTP) — clients only ──
router.post('/customer/login/phone/start', AuthController.sendLoginOtpPhone);
router.post('/customer/login/phone/verify', AuthController.verifyLoginOtpPhone);

// ── Complete phone profile (set name after phone OTP registration) ──
router.post('/customer/complete-phone', requireAuth, AuthController.completePhoneProfile);

export default router;
