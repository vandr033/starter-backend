import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import * as ProfileController from "../controllers/profile.controller";

const router = Router();

// All profile routes require authentication
router.use(requireAuth);

router.get("/me", ProfileController.getProfile);
router.put("/me", ProfileController.updateProfile);

// Email change with OTP
router.post("/me/email/start", ProfileController.sendEmailChangeOtp);
router.post("/me/email/verify", ProfileController.verifyEmailChange);

// Phone change with OTP
router.post("/me/phone/start", ProfileController.sendPhoneChangeOtp);
router.post("/me/phone/verify", ProfileController.verifyPhoneChange);

export default router;
