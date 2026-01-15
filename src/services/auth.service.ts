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
import { sendWhatsappCode } from "../utils/whatsappSender";
import { sendEmailCode } from "../utils/sendEmail";
import { auth } from "../config/auth";
import { logger } from "../config/logger";

let mensaje: MensajeApi;

// function normalizePhone(phone: string, phonePrefix: string) {
//   return phonePrefix.trim() + phone.trim();
// }
// export async function sendVerificationCodePhone(
//   phone: string,
//   phonePrefix: string
// ) {
//   try {
//     const normalizedPhone = normalizePhone(phone, phonePrefix);

//     const existingUser = await UserRepo.getUserByPhone(phone, phonePrefix);
//     if (existingUser) {
//       throw new Error("User already exists");
//     }
//     const code = generateNumericCode();
//     const code_hash = await bcrypt.hash(code, 10);
//     const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

//     const verification = await VerificationRepo.createVerification({
//       channel: VerificationChannel.WHATSAPP,
//       purpose: VerificationPurpose.CUSTOMER_SIGNUP,
//       identifier: normalizedPhone,
//       code_hash,
//       expires_at,
//     });

//     //enviar codigo de verificacion por whatsapp
//     const result = await sendWhatsappCode(phone, phonePrefix, code);
//     if (result === -1) {
//       throw new Error("Error al enviar el codigo de verificacion");
//     }

//     mensaje = {
//       code: 200,
//       message: "Codigo de verificacion enviado",
//       error: false,
//     };
//   } catch (error: any) {
//     mensaje = {
//       code: 500,
//       message: "Error al enviar el codigo de verificacion",
//       error: true,
//       technicalMessage: error.toString(),
//     };
//   }
//   return mensaje;
// }

// export async function verifyVerificationCodePhone(
//   phone: string,
//   phonePrefix: string,
//   code: string
// ): Promise<MensajeApi> {
//   try {
//     const normalizedPhone = normalizePhone(phone, phonePrefix);
//     const verificationCode = await VerificationRepo.getVerificationCode(
//       VerificationChannel.WHATSAPP,
//       VerificationPurpose.CUSTOMER_SIGNUP,
//       normalizedPhone
//     );
//     if (!verificationCode || verificationCode === null) {
//       throw new Error("Verification code not found");
//     }
//     if (verificationCode.attempts >= verificationCode.max_attempts) {
//       throw new Error("Too many attempts");
//     }
//     const isValid = await bcrypt.compare(code, verificationCode.code_hash);

//     await VerificationRepo.updateVerificationCode(verificationCode.id, {
//       consumed_at: isValid ? new Date() : verificationCode.consumed_at,
//       attempts: verificationCode.attempts + 1,
//     });

//     if (!isValid) {
//       throw new Error("Invalid code");
//     }
//     const preRegToken = createPreRegToken({
//       channel: VerificationChannel.WHATSAPP,
//       identifier: normalizedPhone,
//     });
//     mensaje = {
//       code: 200,
//       message: "Codigo de verificacion validado",
//       error: false,
//       data: {
//         preRegToken,
//       },
//     };
//   } catch (error: any) {
//     mensaje = {
//       code: 500,
//       message: "Error al verificar el codigo de verificacion",
//       error: true,
//       technicalMessage: error.toString(),
//     };
//   }
//   return mensaje;
// }

export async function sendVerificationCodeEmail(email:string){
    try {
        const trimmedEmail = email.trim().toLowerCase();

        const existing = await UserRepo.getUserByEmail(trimmedEmail);
        if (existing) {
            throw new Error("User already exists");
        }
        const code = generateNumericCode();
        const code_hash = await bcrypt.hash(code, 10);
        const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

        const verification = await VerificationRepo.createVerification({
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
    } catch (error:any) {
        mensaje = {
            code: 500,
            message: "Error al enviar el codigo de verificacion",
            error: true,
            technicalMessage: error.toString(),
        };
    }
    return mensaje;
}

export async function verifyVerificationCodeEmail(email:string, code:string){
    try {
        const trimmedEmail = email.trim().toLowerCase();
        console.log("Email: ", trimmedEmail);
        console.log("Code: ", code);
        console.log("current date: ", new Date());
        const verificationCode = await VerificationRepo.getVerificationCode(
            VerificationChannel.EMAIL,
            VerificationPurpose.CUSTOMER_SIGNUP,
            trimmedEmail
        );
        console.log("Verification code: ", verificationCode);
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
    } catch (error:any) {
        console.log("Error al verificar el codigo de verificacion");
        console.log(error);
        mensaje = {
            code: 500,
            message: "Error al verificar el codigo de verificacion",
            error: true,
            technicalMessage: error.toString(),
        };
    }
    return mensaje;
}

export async function completeCustomerRegistrationEmail(
  preRegToken: string,
  email: string,
  password: string,
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

    // Create user via Better Auth
    const result = await auth.api.signUpEmail({
      body: {
        email: normalizedEmail,
        password,
        name: displayName,
      },
      headers: reqHeaders,
    });

    if (!result || !result.user) {
      throw new Error("Error al registrar el usuario (Better Auth)");
    }

    const user = result.user;

    // Update extra fields in your own table after Better Auth creates the user
    // Mark email as verified since we already verified via OTP
    await UserRepo.verifyUserEmail(user.id);

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