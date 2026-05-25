import * as UserRepo from "../repositories/user.repo";
import * as VerificationRepo from "../repositories/verification.repo";
import { MensajeApi } from "../types/MensajeApi";
import {
  createPreRegToken,
  generateNumericCode,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  parsePreRegToken,
} from "../utils/verification";
import { VerificationChannel, VerificationPurpose } from "../types/verification-enums";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendWhatsappCode } from "../utils/whatsappSender";
import { canonicalizePhoneParts } from "../utils/phoneNormalization";
import { sendEmailCode } from "../utils/sendEmail";
import { getAuth } from "../config/auth";
import { prisma } from "../prisma/client";
import { logger } from "../config/logger";

let mensaje: MensajeApi;

function getOtpResendCooldownSeconds(): number {
  const safe = Number.isFinite(OTP_RESEND_COOLDOWN_SECONDS) ? OTP_RESEND_COOLDOWN_SECONDS : 60;
  return Math.max(1, Math.trunc(safe));
}

async function ensureOtpResendAllowed(params: {
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  identifier: string;
}): Promise<MensajeApi | null> {
  const latest = await VerificationRepo.getLatestVerification(
    params.channel,
    params.purpose,
    params.identifier,
  );

  if (!latest) return null;

  const cooldownSeconds = getOtpResendCooldownSeconds();
  const elapsedSeconds = Math.floor((Date.now() - latest.created_at.getTime()) / 1000);

  if (elapsedSeconds >= cooldownSeconds) return null;

  const retryAfter = Math.max(1, cooldownSeconds - elapsedSeconds);
  return {
    code: 429,
    message: `Debes esperar ${retryAfter} segundos para reenviar el código`,
    error: true,
    data: {
      retry_after_seconds: retryAfter,
      resend_cooldown_seconds: cooldownSeconds,
    },
  };
}

async function signInExistingEmailUser(
  user: { id: string; email: string },
  reqHeaders: any,
): Promise<{ user: unknown; token: unknown; cookies: string[] }> {
  const auth = await getAuth();
  const sessionResponse = await auth.api.signInEmail({
    body: {
      email: user.email,
      password: "__otp_login__",
    },
    headers: reqHeaders,
    asResponse: true,
  }).catch(() => null);

  if (sessionResponse?.ok) {
    const payload = await sessionResponse.json() as { user?: unknown; token?: unknown };
    const cookies = sessionResponse.headers.getSetCookie?.() || [];
    if (cookies.length === 0) {
      const singleCookie = sessionResponse.headers.get("set-cookie");
      if (singleCookie) cookies.push(singleCookie);
    }

    return {
      user: payload.user ?? null,
      token: payload.token ?? null,
      cookies,
    };
  }

  const tempPassword = crypto.randomBytes(32).toString("hex");
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  const credentialAccount = await prisma.account.findFirst({
    where: {
      userId: user.id,
      providerId: { in: ["credential", "credentials"] },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (credentialAccount) {
    await prisma.account.update({
      where: { id: credentialAccount.id },
      data: {
        providerId: "credential",
        accountId: user.email,
        password: hashedPassword,
      },
    });
  } else {
    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.email,
        password: hashedPassword,
      },
    });
  }

  const fallbackResponse = await auth.api.signInEmail({
    body: {
      email: user.email,
      password: tempPassword,
    },
    headers: reqHeaders,
    asResponse: true,
  });

  if (!fallbackResponse.ok) {
    let message = "Could not sign in existing user";
    try {
      const payload = await fallbackResponse.json();
      if (typeof payload?.message === "string" && payload.message.trim().length > 0) {
        message = payload.message;
      }
    } catch {
      // Keep default message.
    }
    throw new Error(message);
  }

  const payload = await fallbackResponse.json() as { user?: unknown; token?: unknown };
  const cookies = fallbackResponse.headers.getSetCookie?.() || [];
  if (cookies.length === 0) {
    const singleCookie = fallbackResponse.headers.get("set-cookie");
    if (singleCookie) cookies.push(singleCookie);
  }

  return {
    user: payload.user ?? null,
    token: payload.token ?? null,
    cookies,
  };
}

function extractResponseCookies(response: Response): string[] {
  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length > 0) {
    return cookies;
  }

  const singleCookie = response.headers.get("set-cookie");
  return singleCookie ? [singleCookie] : [];
}

async function getSessionFromResponseCookies(
  reqHeaders: HeadersInit | undefined,
  cookies: string[],
) {
  const auth = await getAuth();
  const sessionHeaders = new Headers(reqHeaders);
  if (cookies.length > 0) {
    sessionHeaders.set("cookie", cookies.join("; "));
  }

  return auth.api.getSession({ headers: sessionHeaders });
}

// ────────────────────────────────────────────
// REGISTRATION — Email OTP flow (no password)
// ────────────────────────────────────────────

export async function sendVerificationCodeEmail(email: string) {
  try {
    const trimmedEmail = email.trim().toLowerCase();

    const resendGuard = await ensureOtpResendAllowed({
      channel: VerificationChannel.EMAIL,
      purpose: VerificationPurpose.CUSTOMER_SIGNUP,
      identifier: trimmedEmail,
    });
    if (resendGuard) {
      return resendGuard;
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

export async function verifyVerificationCodeEmail(email: string, code: string, reqHeaders: any) {
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
    const existingUser = await UserRepo.getUserByEmail(trimmedEmail);
    if (existingUser) {
      const session = await signInExistingEmailUser(existingUser, reqHeaders);

      mensaje = {
        code: 200,
        message: "Cuenta existente autenticada correctamente",
        error: false,
        data: {
          existingAccount: true,
          user: session.user,
          token: session.token,
        },
      };
    } else {
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
    }
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
    const auth = await getAuth();
    const signUpResponse = await auth.api.signUpEmail({
      body: {
        email: normalizedEmail,
        password: randomPassword,
        name: displayName,
      },
      headers: reqHeaders,
      asResponse: true,
    });

    if (!signUpResponse.ok) {
      const payload = await signUpResponse.json().catch(() => null);
      throw new Error(
        typeof payload?.message === "string" && payload.message.trim().length > 0
          ? payload.message
          : "Error al registrar el usuario (Better Auth)",
      );
    }

    const signUpPayload = await signUpResponse.json().catch(() => null) as { user?: { id?: string } } | null;
    const user = signUpPayload?.user;
    if (!user?.id) {
      throw new Error("Error al registrar el usuario (Better Auth)");
    }

    // Mark email as verified since we already verified via OTP
    await UserRepo.verifyUserEmail(user.id);

    // Update first_name / last_name
    const updatedUser = await UserRepo.updateUserNames(user.id, first_name, last_name);

    let cookies = extractResponseCookies(signUpResponse);
    let session = cookies.length > 0
      ? await getSessionFromResponseCookies(reqHeaders, cookies)
      : null;

    if (!session?.user) {
      const signInResponse = await auth.api.signInEmail({
        body: {
          email: normalizedEmail,
          password: randomPassword,
        },
        headers: reqHeaders,
        asResponse: true,
      });

      if (!signInResponse.ok) {
        const payload = await signInResponse.json().catch(() => null);
        throw new Error(
          typeof payload?.message === "string" && payload.message.trim().length > 0
            ? payload.message
            : "No pudimos iniciar la sesión del cliente",
        );
      }

      cookies = extractResponseCookies(signInResponse);
      session = await getSessionFromResponseCookies(reqHeaders, cookies);
    }

    mensaje = {
      code: 201,
      message: "Registro de cliente completado correctamente",
      error: false,
      data: {
        user: session?.user ?? updatedUser,
        cookies,
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
  const canonicalPhone = canonicalizePhoneParts({
    phonePrefix,
    phoneNumber: phone,
  });
  return canonicalPhone.fullPhone || `${phonePrefix.trim()}${phone.trim()}`;
}

function buildTempPhoneEmail(phoneNumber: string) {
  const digits = phoneNumber.replace(/[^\d]/g, "");
  return `${digits}@tmppriconpri.com`;
}

export async function sendVerificationCodePhone(
  phone: string,
  phonePrefix: string
) {
  try {
    const normalizedPhone = normalizePhone(phone, phonePrefix);

    const resendGuard = await ensureOtpResendAllowed({
      channel: VerificationChannel.WHATSAPP,
      purpose: VerificationPurpose.CUSTOMER_SIGNUP,
      identifier: normalizedPhone,
    });
    if (resendGuard) {
      return resendGuard;
    }

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

    const resendGuard = await ensureOtpResendAllowed({
      channel: VerificationChannel.EMAIL,
      purpose: VerificationPurpose.LOGIN,
      identifier: trimmedEmail,
    });
    if (resendGuard) {
      return {
        code: 200,
        message: "Si la cuenta existe, recibirás un código de verificación",
        error: false,
        data: resendGuard.data,
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

    const user = await UserRepo.getUserByEmail(trimmedEmail);
    if (!user) {
      const preRegToken = createPreRegToken({
        channel: VerificationChannel.EMAIL,
        identifier: trimmedEmail,
      });

      return {
        code: 200,
        message: "Perfil pendiente de completar",
        error: false,
        data: {
          requiresProfileCompletion: true,
          preRegToken,
        },
      };
    }

    const session = await signInExistingEmailUser(user, reqHeaders);

    return {
      code: 200,
      message: "Inicio de sesión exitoso",
      error: false,
      data: {
        user: session.user,
        token: session.token,
        cookies: session.cookies,
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

export async function sendLoginOtpPhone(params: {
  phoneNumber: string;
  phonePrefix: string;
  countryCode?: string;
}): Promise<MensajeApi> {
  try {
    const canonicalPhone = canonicalizePhoneParts({
      phonePrefix: params.phonePrefix,
      phoneNumber: params.phoneNumber,
    });

    if (!canonicalPhone.phoneNumber || !canonicalPhone.phonePrefix) {
      return {
        code: 400,
        message: "Phone number and prefix are required",
        error: true,
      };
    }

    const fullPhone = `+${canonicalPhone.phonePrefix}${canonicalPhone.phoneNumber}`;
    const auth = await getAuth();
    // Better Auth's phone number plugin handles OTP send + storage
    await auth.api.sendPhoneNumberOTP({
      body: { phoneNumber: fullPhone },
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
  phone: {
    phoneNumber: string;
    phonePrefix: string;
    countryCode?: string;
  },
  code: string,
  reqHeaders: any
): Promise<MensajeApi> {
  try {
    const canonicalPhone = canonicalizePhoneParts({
      phonePrefix: phone.phonePrefix,
      phoneNumber: phone.phoneNumber,
    });

    if (!canonicalPhone.phoneNumber || !canonicalPhone.phonePrefix) {
      return {
        code: 400,
        message: "Phone number and prefix are required",
        error: true,
      };
    }

    const fullPhone = `+${canonicalPhone.phonePrefix}${canonicalPhone.phoneNumber}`;
    const existingUser =
      await UserRepo.findActiveUserByPhone({
        phoneNumber: canonicalPhone.phoneNumber,
        phonePrefix: canonicalPhone.phonePrefix,
      }) ??
      await UserRepo.getUserByEmail(buildTempPhoneEmail(fullPhone));

    if (existingUser && !existingUser.deleted_at) {
      const verification = await prisma.verification.findFirst({
        where: {
          identifier: fullPhone,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!verification || verification.expiresAt < new Date()) {
        if (verification && verification.expiresAt < new Date()) {
          await prisma.verification.delete({
            where: { id: verification.id },
          }).catch(() => null);
        }

        return {
          code: 400,
          message: "Código expirado o no encontrado",
          error: true,
        };
      }

      const [otpValue, attemptsRaw] = verification.value.split(":");
      const attempts = Number.parseInt(attemptsRaw || "0", 10) || 0;
      const allowedAttempts = 3;

      if (attempts >= allowedAttempts) {
        await prisma.verification.delete({
          where: { id: verification.id },
        }).catch(() => null);

        return {
          code: 403,
          message: "Demasiados intentos",
          error: true,
        };
      }

      if (otpValue !== code) {
        await prisma.verification.update({
          where: { id: verification.id },
          data: {
            value: `${otpValue}:${attempts + 1}`,
          },
        });

        return {
          code: 400,
          message: "Código inválido",
          error: true,
        };
      }

      await prisma.verification.delete({
        where: { id: verification.id },
      });

      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          phoneNumberVerified: true,
        },
      });

      const session = await signInExistingEmailUser(
        { id: existingUser.id, email: existingUser.email },
        reqHeaders,
      );

      return {
        code: 200,
        message: "Inicio de sesión exitoso",
        error: false,
        data: session,
      };
    }

    const auth = await getAuth();
    const verificationResponse = await auth.api.verifyPhoneNumber({
      body: { phoneNumber: fullPhone, code },
      headers: reqHeaders,
      asResponse: true,
    });

    if (!verificationResponse.ok) {
      const payload = await verificationResponse.json().catch(() => null);
      const message =
        typeof payload?.message === "string" && payload.message.trim().length > 0
          ? payload.message
          : "Error al verificar el código";

      return {
        code: verificationResponse.status || 400,
        message,
        error: true,
      };
    }

    const payload = await verificationResponse.json().catch(() => null);
    const cookies = extractResponseCookies(verificationResponse);
    const session = await getSessionFromResponseCookies(reqHeaders, cookies);

    if (!session?.user) {
      throw new Error("No pudimos recuperar la sesión del usuario");
    }

    return {
      code: 200,
      message: "Inicio de sesión exitoso",
      error: false,
      data: {
        ...(payload && typeof payload === "object" ? payload : {}),
        user: session.user,
        cookies,
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
