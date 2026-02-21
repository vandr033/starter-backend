import * as UserRepo from "../repositories/user.repo";
import * as VerificationRepo from "../repositories/verification.repo";
import { MensajeApi } from "../types/MensajeApi";
import {
  createPreRegToken,
  generateNumericCode,
  OTP_TTL_MINUTES,
  parsePreRegToken,
} from "../utils/verification";
import { VerificationChannel, VerificationPurpose } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendWhatsappCode } from "../utils/whatsappSender";
import { sendEmailCode } from "../utils/sendEmail";
import { auth } from "../config/auth";
import { logger } from "../config/logger";

let mensaje: MensajeApi;

// ────────────────────────────────────────────
// REGISTRATION — Email OTP flow (no password)
// ────────────────────────────────────────────

export async function sendVerificationCodeEmail(email: string) {
  try {
    const trimmedEmail = email.trim().toLowerCase();

    const existing = await UserRepo.getUserByEmail(trimmedEmail);
    if (existing) {
      throw new Error("User already exists");
    }
    const code = generateNumericCode();
    const code_hash = await bcrypt.hash(code, 10);
    const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    await VerificationRepo.createVerification({
      channel: VerificationChannel.EMAIL,
      purpose: VerificationPurpose.CUSTOMER_SIGNUP,
      identifier: trimmedEmail,
      code_hash,
      expires_at,
    });

    const result = await sendEmailCode(trimmedEmail, code.toString());
    if (result === -1) {
      throw new Error("Error al enviar el codigo de verificacion");
    }
    mensaje = {
      code: 200,
      message: "Codigo de verificacion enviado",
      error: false,
    };
  } catch (error: any) {
    mensaje = {
      code: 500,
      message: "Error al enviar el codigo de verificacion",
      error: true,
      technicalMessage: error.toString(),
    };
  }
  return mensaje;
}

export async function verifyVerificationCodeEmail(email: string, code: string) {
  try {
    const trimmedEmail = email.trim().toLowerCase();
    const verificationCode = await VerificationRepo.getVerificationCode(
      VerificationChannel.EMAIL,
      VerificationPurpose.CUSTOMER_SIGNUP,
      trimmedEmail
    );
    if (!verificationCode || verificationCode === null) {
      throw new Error("Verification code not found");
    }
    if (verificationCode.attempts >= verificationCode.max_attempts) {
      throw new Error("Too many attempts");
    }
    const isValid = await bcrypt.compare(code, verificationCode.code_hash);

    await VerificationRepo.updateVerificationCode(verificationCode.id, {
      consumed_at: isValid ? new Date() : verificationCode.consumed_at,
      attempts: verificationCode.attempts + 1,
    });
    if (!isValid) {
      throw new Error("Invalid code");
    }
    const preRegToken = createPreRegToken({
      channel: VerificationChannel.EMAIL,
      identifier: trimmedEmail,
    });
    mensaje = {
      code: 200,
      message: "Codigo de verificacion validado",
      error: false,
      data: {
        preRegToken,
      },
    };
  } catch (error: any) {
    mensaje = {
      code: 500,
      message: "Error al verificar el codigo de verificacion",
      error: true,
      technicalMessage: error.toString(),
    };
  }
  return mensaje;
}

/**
 * Complete customer email registration — NO PASSWORD required.
 * A random password is generated internally for Better Auth compatibility.
 */
export async function completeCustomerRegistrationEmail(
  preRegToken: string,
  email: string,
  first_name: string,
  last_name: string | undefined,
  reqHeaders: any
): Promise<MensajeApi> {
  let mensaje: MensajeApi;

  try {
    const prereg = parsePreRegToken(preRegToken);
    if (!prereg || prereg.channel !== "EMAIL") {
      mensaje = {
        code: 400,
        message: "Token de preregistro inválido o expirado",
        error: true,
      };
      return mensaje;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== prereg.identifier) {
      mensaje = {
        code: 400,
        message: "El correo no coincide con el verificado",
        error: true,
      };
      return mensaje;
    }

    const displayName =
      `${first_name ?? ""} ${last_name ?? ""}`.trim() || normalizedEmail;

    // Generate a random password — not exposed to the user, purely for Better Auth internals
    const randomPassword = crypto.randomBytes(32).toString("hex");

    // Create user via Better Auth
    const result = await auth.api.signUpEmail({
      body: {
        email: normalizedEmail,
        password: randomPassword,
        name: displayName,
      },
      headers: reqHeaders,
    });

    if (!result || !result.user) {
      throw new Error("Error al registrar el usuario (Better Auth)");
    }

    const user = result.user;

    // Mark email as verified since we already verified via OTP
    await UserRepo.verifyUserEmail(user.id);

    // Update first_name / last_name
    await UserRepo.updateUserNames(user.id, first_name, last_name);

    mensaje = {
      code: 201,
      message: "Registro de cliente completado correctamente",
      error: false,
      data: {
        user,
      },
    };
  } catch (error: any) {
    mensaje = {
      code: 500,
      message: "Error al completar el registro",
      error: true,
      technicalMessage: error?.message || error?.toString(),
    };
  }

  return mensaje;
}

// ────────────────────────────────────────────
// REGISTRATION — Phone OTP flow
// ────────────────────────────────────────────

function normalizePhone(phone: string, phonePrefix: string) {
  return phonePrefix.trim() + phone.trim();
}

export async function sendVerificationCodePhone(
  phone: string,
  phonePrefix: string
) {
  try {
    const normalizedPhone = normalizePhone(phone, phonePrefix);

    const existingUser = await UserRepo.getUserByPhone(phone, phonePrefix);
    if (existingUser) {
      throw new Error("User already exists");
    }
    const code = generateNumericCode();
    const code_hash = await bcrypt.hash(code, 10);
    const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    await VerificationRepo.createVerification({
      channel: VerificationChannel.WHATSAPP,
      purpose: VerificationPurpose.CUSTOMER_SIGNUP,
      identifier: normalizedPhone,
      code_hash,
      expires_at,
    });

    // Send code via WhatsApp
    const result = await sendWhatsappCode(normalizedPhone, code);
    if (result === -1) {
      throw new Error("Error al enviar el codigo de verificacion");
    }

    mensaje = {
      code: 200,
      message: "Codigo de verificacion enviado",
      error: false,
    };
  } catch (error: any) {
    mensaje = {
      code: 500,
      message: "Error al enviar el codigo de verificacion",
      error: true,
      technicalMessage: error.toString(),
    };
  }
  return mensaje;
}

export async function verifyVerificationCodePhone(
  phone: string,
  phonePrefix: string,
  code: string
): Promise<MensajeApi> {
  try {
    const normalizedPhone = normalizePhone(phone, phonePrefix);
    const verificationCode = await VerificationRepo.getVerificationCode(
      VerificationChannel.WHATSAPP,
      VerificationPurpose.CUSTOMER_SIGNUP,
      normalizedPhone
    );
    if (!verificationCode || verificationCode === null) {
      throw new Error("Verification code not found");
    }
    if (verificationCode.attempts >= verificationCode.max_attempts) {
      throw new Error("Too many attempts");
    }
    const isValid = await bcrypt.compare(code, verificationCode.code_hash);

    await VerificationRepo.updateVerificationCode(verificationCode.id, {
      consumed_at: isValid ? new Date() : verificationCode.consumed_at,
      attempts: verificationCode.attempts + 1,
    });

    if (!isValid) {
      throw new Error("Invalid code");
    }
    const preRegToken = createPreRegToken({
      channel: VerificationChannel.WHATSAPP,
      identifier: normalizedPhone,
    });
    mensaje = {
      code: 200,
      message: "Codigo de verificacion validado",
      error: false,
      data: {
        preRegToken,
      },
    };
  } catch (error: any) {
    mensaje = {
      code: 500,
      message: "Error al verificar el codigo de verificacion",
      error: true,
      technicalMessage: error.toString(),
    };
  }
  return mensaje;
}

// ────────────────────────────────────────────
// LOGIN — Email OTP (clients only)
// ────────────────────────────────────────────

export async function sendLoginOtpEmail(email: string): Promise<MensajeApi> {
  try {
    const trimmedEmail = email.trim().toLowerCase();

    const user = await UserRepo.getUserByEmail(trimmedEmail);
    if (!user) {
      // Don't reveal whether account exists — still return success
      return {
        code: 200,
        message: "Si la cuenta existe, recibirás un código de verificación",
        error: false,
      };
    }

    const code = generateNumericCode();
    const code_hash = await bcrypt.hash(code, 10);
    const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    await VerificationRepo.createVerification({
      channel: VerificationChannel.EMAIL,
      purpose: VerificationPurpose.LOGIN,
      identifier: trimmedEmail,
      code_hash,
      expires_at,
    });

    const result = await sendEmailCode(trimmedEmail, code.toString());
    if (result === -1) {
      throw new Error("Error al enviar el código de verificación");
    }

    return {
      code: 200,
      message: "Código de verificación enviado",
      error: false,
    };
  } catch (error: any) {
    return {
      code: 500,
      message: "Error al enviar el código de verificación",
      error: true,
      technicalMessage: error.toString(),
    };
  }
}

export async function verifyLoginOtpEmail(
  email: string,
  code: string,
  reqHeaders: any
): Promise<MensajeApi> {
  try {
    const trimmedEmail = email.trim().toLowerCase();

    // Verify OTP
    const verificationCode = await VerificationRepo.getVerificationCode(
      VerificationChannel.EMAIL,
      VerificationPurpose.LOGIN,
      trimmedEmail
    );

    if (!verificationCode) {
      return {
        code: 400,
        message: "Código de verificación no encontrado o expirado",
        error: true,
      };
    }

    if (verificationCode.attempts >= verificationCode.max_attempts) {
      return {
        code: 400,
        message: "Demasiados intentos. Solicita un nuevo código.",
        error: true,
      };
    }

    const isValid = await bcrypt.compare(code, verificationCode.code_hash);

    await VerificationRepo.updateVerificationCode(verificationCode.id, {
      consumed_at: isValid ? new Date() : verificationCode.consumed_at,
      attempts: verificationCode.attempts + 1,
    });

    if (!isValid) {
      return {
        code: 400,
        message: "Código inválido",
        error: true,
      };
    }

    // OTP verified — look up the user
    const user = await UserRepo.getUserByEmail(trimmedEmail);
    if (!user) {
      return {
        code: 400,
        message: "Usuario no encontrado",
        error: true,
      };
    }

    // Sign in via Better Auth using internal password
    // We need to get the user's account to read the stored password.
    // Instead, we'll use Better Auth's internal session creation.
    const session = await auth.api.signInEmail({
      body: {
        email: trimmedEmail,
        // Use a trick: we don't know the password, so we create a fresh one
        // Actually, let's just set a new password and sign in with it
        password: "__otp_login__", // This won't work with the stored hash
      },
      headers: reqHeaders,
    }).catch(() => null);

    // If Better Auth signIn fails (because we don't know the password),
    // we need to reset the password to a known value and sign in again
    if (!session) {
      // Generate a temporary password, set it, then sign in
      const tempPassword = crypto.randomBytes(32).toString("hex");

      // Update the account password directly in the DB
      await UserRepo.updateUserPassword(user.id, await bcrypt.hash(tempPassword, 10));

      const retryResult = await auth.api.signInEmail({
        body: {
          email: trimmedEmail,
          password: tempPassword,
        },
        headers: reqHeaders,
      });

      if (!retryResult || !retryResult.user) {
        throw new Error("Error al iniciar sesión");
      }

      return {
        code: 200,
        message: "Inicio de sesión exitoso",
        error: false,
        data: {
          user: retryResult.user,
          token: retryResult.token,
        },
      };
    }

    return {
      code: 200,
      message: "Inicio de sesión exitoso",
      error: false,
      data: {
        user: session.user,
        token: session.token,
      },
    };
  } catch (error: any) {
    return {
      code: 500,
      message: "Error al verificar el código",
      error: true,
      technicalMessage: error?.message || error?.toString(),
    };
  }
}

// ────────────────────────────────────────────
// LOGIN — Phone OTP (clients only)
// These delegate to Better Auth's phoneNumber plugin
// which is already configured in auth.ts
// ────────────────────────────────────────────

export async function sendLoginOtpPhone(phoneNumber: string): Promise<MensajeApi> {
  try {
    // Better Auth's phone number plugin handles OTP send + storage
    await auth.api.sendPhoneNumberOTP({
      body: { phoneNumber },
    });

    return {
      code: 200,
      message: "Código de verificación enviado por WhatsApp",
      error: false,
    };
  } catch (error: any) {
    return {
      code: 500,
      message: "Error al enviar el código",
      error: true,
      technicalMessage: error?.message || error?.toString(),
    };
  }
}

export async function verifyLoginOtpPhone(
  phoneNumber: string,
  code: string,
  reqHeaders: any
): Promise<MensajeApi> {
  try {
    const result = await auth.api.verifyPhoneNumber({
      body: { phoneNumber, code },
      headers: reqHeaders,
    });

    return {
      code: 200,
      message: "Inicio de sesión exitoso",
      error: false,
      data: result,
    };
  } catch (error: any) {
    return {
      code: 500,
      message: "Error al verificar el código",
      error: true,
      technicalMessage: error?.message || error?.toString(),
    };
  }
}