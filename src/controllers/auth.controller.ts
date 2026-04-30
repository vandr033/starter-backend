import { Request, Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as AuthService from '../services/auth.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as UserRepo from '../repositories/user.repo';
import { parsePreRegToken } from '../utils/verification';

let mensaje: MensajeApi;

// ── Email registration (signup) ──

export async function sendVerificationCodeEmail(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ code: 400, message: "Email is required", error: true });
  }
  const result = await AuthService.sendVerificationCodeEmail(email);
  return res.status(result.code).json(result);
}

export async function verifyVerificationCodeEmail(req: Request, res: Response) {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ code: 400, message: "Email and code are required", error: true });
  }
  const result = await AuthService.verifyVerificationCodeEmail(email, code, req.headers);
  return res.status(result.code).json(result);
}

export async function completeCustomerRegistrationEmail(req: Request, res: Response) {
  const { preRegToken, email, first_name, last_name } = req.body as {
    preRegToken?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };

  if (!preRegToken || !first_name || !email) {
    return res.status(400).json({ code: 400, message: "Missing required fields", error: true });
  }

  const prereg = parsePreRegToken(preRegToken);
  if (!prereg || prereg.channel !== "EMAIL") {
    return res.status(400).json({
      code: 400,
      message: "Invalid or expired pre-registration token",
      error: true,
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail !== prereg.identifier) {
    return res.status(400).json({
      code: 400,
      message: "Email does not match the verified one",
      error: true,
    });
  }

  const result = await AuthService.completeCustomerRegistrationEmail(
    preRegToken,
    email,
    first_name,
    last_name,
    req.headers
  );

  return res.status(result.code).json(result);
}

// ── Email login (OTP) — clients only ──

export async function sendLoginOtpEmail(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ code: 400, message: "Email is required", error: true });
  }
  const result = await AuthService.sendLoginOtpEmail(email);
  return res.status(result.code).json(result);
}

export async function verifyLoginOtpEmail(req: Request, res: Response) {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ code: 400, message: "Email and code are required", error: true });
  }
  const result = await AuthService.verifyLoginOtpEmail(email, code, req.headers);
  return res.status(result.code).json(result);
}

// ── Phone login (OTP) — clients only ──

export async function sendLoginOtpPhone(req: Request, res: Response) {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ code: 400, message: "Phone number is required", error: true });
  }
  const result = await AuthService.sendLoginOtpPhone(phoneNumber);
  return res.status(result.code).json(result);
}

export async function verifyLoginOtpPhone(req: Request, res: Response) {
  const { phoneNumber, code } = req.body;
  if (!phoneNumber || !code) {
    return res.status(400).json({ code: 400, message: "Phone number and code are required", error: true });
  }
  const result = await AuthService.verifyLoginOtpPhone(phoneNumber, code, req.headers);
  return res.status(result.code).json(result);
}

// ── Complete phone profile (set name after phone OTP registration) ──

export async function completePhoneProfile(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { first_name, last_name, phone_prefix } = req.body;
  if (!first_name) {
    return res.status(400).json({ code: 400, message: "First name is required", error: true });
  }

  try {
    await UserRepo.updateUserNames(userId, first_name, last_name);
    if (phone_prefix) {
      await UserRepo.updateUserPhone(userId, authReq.authUser.phoneNumber || '', phone_prefix);
    }
    return res.status(200).json({
      code: 200,
      message: "Profile completed successfully",
      error: false,
    });
  } catch (error: any) {
    if (error?.code === 'P2002' || String(error?.message || '').includes('Phone number already in use')) {
      return res.status(400).json({
        code: 400,
        message: "Phone number already in use",
        error: true,
      });
    }

    return res.status(500).json({
      code: 500,
      message: "Error completing profile",
      error: true,
      technicalMessage: error?.message,
    });
  }
}
