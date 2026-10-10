"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerificationCodeEmail = sendVerificationCodeEmail;
exports.verifyVerificationCodeEmail = verifyVerificationCodeEmail;
exports.completeCustomerRegistrationEmail = completeCustomerRegistrationEmail;
exports.sendVerificationCodePhone = sendVerificationCodePhone;
exports.verifyVerificationCodePhone = verifyVerificationCodePhone;
exports.sendLoginOtpEmail = sendLoginOtpEmail;
exports.verifyLoginOtpEmail = verifyLoginOtpEmail;
exports.sendLoginOtpPhone = sendLoginOtpPhone;
exports.verifyLoginOtpPhone = verifyLoginOtpPhone;
const UserRepo = __importStar(require("../repositories/user.repo"));
const VerificationRepo = __importStar(require("../repositories/verification.repo"));
const verification_1 = require("../utils/verification");
const verification_enums_1 = require("../types/verification-enums");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const whatsappSender_1 = require("../utils/whatsappSender");
const phoneNormalization_1 = require("../utils/phoneNormalization");
const sendEmail_1 = require("../utils/sendEmail");
const auth_1 = require("../config/auth");
const auth_constants_1 = require("../config/auth-constants");
const client_1 = require("../prisma/client");
let mensaje;
function getOtpResendCooldownSeconds() {
    const safe = Number.isFinite(verification_1.OTP_RESEND_COOLDOWN_SECONDS) ? verification_1.OTP_RESEND_COOLDOWN_SECONDS : 60;
    return Math.max(1, Math.trunc(safe));
}
async function ensureOtpResendAllowed(params) {
    const latest = await VerificationRepo.getLatestVerification(params.channel, params.purpose, params.identifier);
    if (!latest)
        return null;
    const cooldownSeconds = getOtpResendCooldownSeconds();
    const elapsedSeconds = Math.floor((Date.now() - latest.created_at.getTime()) / 1000);
    if (elapsedSeconds >= cooldownSeconds)
        return null;
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
async function signInExistingEmailUser(user, reqHeaders) {
    const auth = await (0, auth_1.getAuth)();
    const sessionResponse = await auth.api.signInEmail({
        body: {
            email: user.email,
            password: "__otp_login__",
        },
        headers: reqHeaders,
        asResponse: true,
    }).catch(() => null);
    if (sessionResponse?.ok) {
        const payload = await sessionResponse.json();
        const cookies = sessionResponse.headers.getSetCookie?.() || [];
        if (cookies.length === 0) {
            const singleCookie = sessionResponse.headers.get("set-cookie");
            if (singleCookie)
                cookies.push(singleCookie);
        }
        return {
            user: payload.user ?? null,
            token: payload.token ?? null,
            cookies,
        };
    }
    const tempPassword = crypto_1.default.randomBytes(32).toString("hex");
    const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 10);
    const credentialAccount = await client_1.prisma.account.findFirst({
        where: {
            userId: user.id,
            providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
        },
        orderBy: {
            createdAt: "asc",
        },
    });
    if (credentialAccount) {
        await client_1.prisma.account.update({
            where: { id: credentialAccount.id },
            data: {
                providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                accountId: user.email,
                password: hashedPassword,
            },
        });
    }
    else {
        await client_1.prisma.account.create({
            data: {
                userId: user.id,
                providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
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
        }
        catch {
            // Keep default message.
        }
        throw new Error(message);
    }
    const payload = await fallbackResponse.json();
    const cookies = fallbackResponse.headers.getSetCookie?.() || [];
    if (cookies.length === 0) {
        const singleCookie = fallbackResponse.headers.get("set-cookie");
        if (singleCookie)
            cookies.push(singleCookie);
    }
    return {
        user: payload.user ?? null,
        token: payload.token ?? null,
        cookies,
    };
}
function extractResponseCookies(response) {
    const cookies = response.headers.getSetCookie?.() || [];
    if (cookies.length > 0) {
        return cookies;
    }
    const singleCookie = response.headers.get("set-cookie");
    return singleCookie ? [singleCookie] : [];
}
async function getSessionFromResponseCookies(reqHeaders, cookies) {
    const auth = await (0, auth_1.getAuth)();
    const sessionHeaders = new Headers(reqHeaders);
    if (cookies.length > 0) {
        sessionHeaders.set("cookie", cookies.join("; "));
    }
    return auth.api.getSession({ headers: sessionHeaders });
}
// ────────────────────────────────────────────
// REGISTRATION — Email OTP flow (no password)
// ────────────────────────────────────────────
async function sendVerificationCodeEmail(email) {
    try {
        const trimmedEmail = email.trim().toLowerCase();
        const resendGuard = await ensureOtpResendAllowed({
            channel: verification_enums_1.VerificationChannel.EMAIL,
            purpose: verification_enums_1.VerificationPurpose.CUSTOMER_SIGNUP,
            identifier: trimmedEmail,
        });
        if (resendGuard) {
            return resendGuard;
        }
        const code = (0, verification_1.generateNumericCode)();
        const code_hash = await bcryptjs_1.default.hash(code, 10);
        const expires_at = new Date(Date.now() + verification_1.OTP_TTL_MINUTES * 60000);
        await VerificationRepo.createVerification({
            channel: verification_enums_1.VerificationChannel.EMAIL,
            purpose: verification_enums_1.VerificationPurpose.CUSTOMER_SIGNUP,
            identifier: trimmedEmail,
            code_hash,
            expires_at,
        });
        const result = await (0, sendEmail_1.sendEmailCode)(trimmedEmail, code.toString());
        if (result === -1) {
            throw new Error("Error al enviar el codigo de verificacion");
        }
        mensaje = {
            code: 200,
            message: "Codigo de verificacion enviado",
            error: false,
        };
    }
    catch (error) {
        mensaje = {
            code: 500,
            message: "Error al enviar el codigo de verificacion",
            error: true,
            technicalMessage: error.toString(),
        };
    }
    return mensaje;
}
async function verifyVerificationCodeEmail(email, code, reqHeaders) {
    try {
        const trimmedEmail = email.trim().toLowerCase();
        const verificationCode = await VerificationRepo.getVerificationCode(verification_enums_1.VerificationChannel.EMAIL, verification_enums_1.VerificationPurpose.CUSTOMER_SIGNUP, trimmedEmail);
        if (!verificationCode || verificationCode === null) {
            throw new Error("Verification code not found");
        }
        if (verificationCode.attempts >= verificationCode.max_attempts) {
            throw new Error("Too many attempts");
        }
        const isValid = await bcryptjs_1.default.compare(code, verificationCode.code_hash);
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
        }
        else {
            const preRegToken = (0, verification_1.createPreRegToken)({
                channel: verification_enums_1.VerificationChannel.EMAIL,
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
    }
    catch (error) {
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
async function completeCustomerRegistrationEmail(preRegToken, email, first_name, last_name, reqHeaders) {
    let mensaje;
    try {
        const prereg = (0, verification_1.parsePreRegToken)(preRegToken);
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
        const displayName = `${first_name ?? ""} ${last_name ?? ""}`.trim() || normalizedEmail;
        // Generate a random password — not exposed to the user, purely for Better Auth internals
        const randomPassword = crypto_1.default.randomBytes(32).toString("hex");
        // Create user via Better Auth
        const auth = await (0, auth_1.getAuth)();
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
            throw new Error(typeof payload?.message === "string" && payload.message.trim().length > 0
                ? payload.message
                : "Error al registrar el usuario (Better Auth)");
        }
        const signUpPayload = await signUpResponse.json().catch(() => null);
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
                throw new Error(typeof payload?.message === "string" && payload.message.trim().length > 0
                    ? payload.message
                    : "No pudimos iniciar la sesión del cliente");
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
    }
    catch (error) {
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
function normalizePhone(phone, phonePrefix) {
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
        phonePrefix,
        phoneNumber: phone,
    });
    return canonicalPhone.fullPhone || `${phonePrefix.trim()}${phone.trim()}`;
}
function buildTempPhoneEmail(phoneNumber) {
    const digits = phoneNumber.replace(/[^\d]/g, "");
    return `${digits}@tmppriconpri.com`;
}
async function sendVerificationCodePhone(phone, phonePrefix) {
    try {
        const normalizedPhone = normalizePhone(phone, phonePrefix);
        const resendGuard = await ensureOtpResendAllowed({
            channel: verification_enums_1.VerificationChannel.WHATSAPP,
            purpose: verification_enums_1.VerificationPurpose.CUSTOMER_SIGNUP,
            identifier: normalizedPhone,
        });
        if (resendGuard) {
            return resendGuard;
        }
        const existingUser = await UserRepo.getUserByPhone(phone, phonePrefix);
        if (existingUser) {
            throw new Error("User already exists");
        }
        const code = (0, verification_1.generateNumericCode)();
        const code_hash = await bcryptjs_1.default.hash(code, 10);
        const expires_at = new Date(Date.now() + verification_1.OTP_TTL_MINUTES * 60000);
        const verification = await VerificationRepo.createVerification({
            channel: verification_enums_1.VerificationChannel.WHATSAPP,
            purpose: verification_enums_1.VerificationPurpose.CUSTOMER_SIGNUP,
            identifier: normalizedPhone,
            code_hash,
            expires_at,
        });
        // Send code via WhatsApp
        const result = await (0, whatsappSender_1.queueWhatsappCode)(normalizedPhone, code, {
            sourceType: 'AUTH_SIGNUP_OTP',
            sourceId: String(verification.id),
            expiresAt: expires_at,
        });
        if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
            throw new Error("Error al enviar el codigo de verificacion");
        }
        const deliveryStatus = (0, whatsappSender_1.getWhatsappEnqueueLifecycleStatus)(result);
        mensaje = {
            code: 200,
            message: deliveryStatus === 'SENT'
                ? "Codigo de verificacion ya enviado"
                : "Codigo de verificacion en cola",
            error: false,
            data: {
                status: deliveryStatus,
                queued: deliveryStatus === 'PENDING' || deliveryStatus === 'PROCESSING',
                job_id: result.jobId ?? null,
            },
        };
    }
    catch (error) {
        mensaje = {
            code: 500,
            message: "Error al enviar el codigo de verificacion",
            error: true,
            technicalMessage: error.toString(),
        };
    }
    return mensaje;
}
async function verifyVerificationCodePhone(phone, phonePrefix, code) {
    try {
        const normalizedPhone = normalizePhone(phone, phonePrefix);
        const verificationCode = await VerificationRepo.getVerificationCode(verification_enums_1.VerificationChannel.WHATSAPP, verification_enums_1.VerificationPurpose.CUSTOMER_SIGNUP, normalizedPhone);
        if (!verificationCode || verificationCode === null) {
            throw new Error("Verification code not found");
        }
        if (verificationCode.attempts >= verificationCode.max_attempts) {
            throw new Error("Too many attempts");
        }
        const isValid = await bcryptjs_1.default.compare(code, verificationCode.code_hash);
        await VerificationRepo.updateVerificationCode(verificationCode.id, {
            consumed_at: isValid ? new Date() : verificationCode.consumed_at,
            attempts: verificationCode.attempts + 1,
        });
        if (!isValid) {
            throw new Error("Invalid code");
        }
        const preRegToken = (0, verification_1.createPreRegToken)({
            channel: verification_enums_1.VerificationChannel.WHATSAPP,
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
    }
    catch (error) {
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
async function sendLoginOtpEmail(email) {
    try {
        const trimmedEmail = email.trim().toLowerCase();
        const resendGuard = await ensureOtpResendAllowed({
            channel: verification_enums_1.VerificationChannel.EMAIL,
            purpose: verification_enums_1.VerificationPurpose.LOGIN,
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
        const code = (0, verification_1.generateNumericCode)();
        const code_hash = await bcryptjs_1.default.hash(code, 10);
        const expires_at = new Date(Date.now() + verification_1.OTP_TTL_MINUTES * 60000);
        await VerificationRepo.createVerification({
            channel: verification_enums_1.VerificationChannel.EMAIL,
            purpose: verification_enums_1.VerificationPurpose.LOGIN,
            identifier: trimmedEmail,
            code_hash,
            expires_at,
        });
        const result = await (0, sendEmail_1.sendEmailCode)(trimmedEmail, code.toString());
        if (result === -1) {
            throw new Error("Error al enviar el código de verificación");
        }
        return {
            code: 200,
            message: "Código de verificación enviado",
            error: false,
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error al enviar el código de verificación",
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
async function verifyLoginOtpEmail(email, code, reqHeaders) {
    try {
        const trimmedEmail = email.trim().toLowerCase();
        // Verify OTP
        const verificationCode = await VerificationRepo.getVerificationCode(verification_enums_1.VerificationChannel.EMAIL, verification_enums_1.VerificationPurpose.LOGIN, trimmedEmail);
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
        const isValid = await bcryptjs_1.default.compare(code, verificationCode.code_hash);
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
            const preRegToken = (0, verification_1.createPreRegToken)({
                channel: verification_enums_1.VerificationChannel.EMAIL,
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
    }
    catch (error) {
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
async function sendLoginOtpPhone(params) {
    try {
        const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
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
        const auth = await (0, auth_1.getAuth)();
        // Better Auth's phone number plugin handles OTP send + storage
        await auth.api.sendPhoneNumberOTP({
            body: { phoneNumber: fullPhone },
        });
        return {
            code: 200,
            message: "Código de verificación en proceso de entrega por WhatsApp",
            error: false,
            data: {
                status: 'PENDING',
                queued: true,
            },
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error al enviar el código",
            error: true,
            technicalMessage: error?.message || error?.toString(),
        };
    }
}
async function verifyLoginOtpPhone(phone, code, reqHeaders) {
    try {
        const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
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
        const existingUser = await UserRepo.findActiveUserByPhone({
            phoneNumber: canonicalPhone.phoneNumber,
            phonePrefix: canonicalPhone.phonePrefix,
        }) ??
            await UserRepo.getUserByEmail(buildTempPhoneEmail(fullPhone));
        if (existingUser && !existingUser.deleted_at) {
            const verification = await client_1.prisma.verification.findFirst({
                where: {
                    identifier: fullPhone,
                },
                orderBy: {
                    createdAt: "desc",
                },
            });
            if (!verification || verification.expiresAt < new Date()) {
                if (verification && verification.expiresAt < new Date()) {
                    await client_1.prisma.verification.delete({
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
                await client_1.prisma.verification.delete({
                    where: { id: verification.id },
                }).catch(() => null);
                return {
                    code: 403,
                    message: "Demasiados intentos",
                    error: true,
                };
            }
            if (otpValue !== code) {
                await client_1.prisma.verification.update({
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
            await client_1.prisma.verification.delete({
                where: { id: verification.id },
            });
            await client_1.prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    phoneNumberVerified: true,
                },
            });
            const session = await signInExistingEmailUser({ id: existingUser.id, email: existingUser.email }, reqHeaders);
            return {
                code: 200,
                message: "Inicio de sesión exitoso",
                error: false,
                data: session,
            };
        }
        const auth = await (0, auth_1.getAuth)();
        const verificationResponse = await auth.api.verifyPhoneNumber({
            body: { phoneNumber: fullPhone, code },
            headers: reqHeaders,
            asResponse: true,
        });
        if (!verificationResponse.ok) {
            const payload = await verificationResponse.json().catch(() => null);
            const message = typeof payload?.message === "string" && payload.message.trim().length > 0
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
    }
    catch (error) {
        return {
            code: 500,
            message: "Error al verificar el código",
            error: true,
            technicalMessage: error?.message || error?.toString(),
        };
    }
}
