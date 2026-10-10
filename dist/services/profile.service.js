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
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.sendEmailChangeOtp = sendEmailChangeOtp;
exports.verifyEmailChange = verifyEmailChange;
exports.sendPhoneChangeOtp = sendPhoneChangeOtp;
exports.verifyPhoneChange = verifyPhoneChange;
const UserRepo = __importStar(require("../repositories/user.repo"));
const VerificationRepo = __importStar(require("../repositories/verification.repo"));
const verification_1 = require("../utils/verification");
const verification_enums_1 = require("../types/verification-enums");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const whatsappSender_1 = require("../utils/whatsappSender");
const sendEmail_1 = require("../utils/sendEmail");
const client_1 = require("../prisma/client");
const phoneNormalization_1 = require("../utils/phoneNormalization");
function getOtpResendCooldownSeconds() {
    const safe = Number.isFinite(verification_1.OTP_RESEND_COOLDOWN_SECONDS) ? verification_1.OTP_RESEND_COOLDOWN_SECONDS : 60;
    return Math.max(1, Math.trunc(safe));
}
async function ensureProfileOtpResendAllowed(params) {
    const latest = await VerificationRepo.getLatestVerification(params.channel, verification_enums_1.VerificationPurpose.PROFILE_UPDATE, params.identifier);
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
async function getProfile(userId) {
    try {
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                name: true,
                country_code: true,
                phoneNumber: true,
                phone_prefix: true,
                phoneNumberVerified: true,
                emailVerified: true,
                image: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!user) {
            return { code: 404, message: "User not found", error: true };
        }
        return {
            code: 200,
            message: "Profile loaded",
            error: false,
            data: { user },
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error loading profile",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
async function updateProfile(userId, data) {
    try {
        const existing = await client_1.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                first_name: true,
                last_name: true,
                name: true,
                country_code: true,
                phoneNumber: true,
                phone_prefix: true,
            },
        });
        if (!existing) {
            return { code: 404, message: "User not found", error: true };
        }
        const hasAnyUpdate = data.first_name !== undefined ||
            data.last_name !== undefined ||
            data.phoneNumber !== undefined ||
            data.phone_prefix !== undefined ||
            data.country_code !== undefined;
        if (!hasAnyUpdate) {
            return { code: 400, message: "No profile fields provided", error: true };
        }
        const normalizedFirstName = data.first_name !== undefined ? data.first_name.trim() : (existing.first_name || "");
        const normalizedLastName = data.last_name !== undefined ? data.last_name.trim() : (existing.last_name || "");
        const nextDisplayName = `${normalizedFirstName} ${normalizedLastName}`.trim() || existing.name || "User";
        const normalizedCountryCode = data.country_code !== undefined
            ? (data.country_code.trim().toUpperCase() || null)
            : (existing.country_code || null);
        const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
            phonePrefix: data.phone_prefix !== undefined ? data.phone_prefix : existing.phone_prefix,
            phoneNumber: data.phoneNumber !== undefined ? data.phoneNumber : existing.phoneNumber,
        });
        let nextPhone = data.phoneNumber !== undefined || data.phone_prefix !== undefined
            ? canonicalPhone.phoneNumber
            : (existing.phoneNumber || null);
        let nextPhonePrefix = data.phoneNumber !== undefined || data.phone_prefix !== undefined
            ? canonicalPhone.phonePrefix
            : (existing.phone_prefix || null);
        if (nextPhone) {
            const userWithPhone = await UserRepo.findActiveUserByPhone({
                phoneNumber: nextPhone,
                phonePrefix: nextPhonePrefix || undefined,
                excludeUserId: userId,
            });
            if (userWithPhone && userWithPhone.id !== userId) {
                return { code: 400, message: "Phone number already in use", error: true };
            }
        }
        const phoneChanged = nextPhone !== (existing.phoneNumber || null);
        const updated = await client_1.prisma.user.update({
            where: { id: userId },
            data: {
                ...(data.first_name !== undefined ? { first_name: normalizedFirstName || null } : {}),
                ...(data.last_name !== undefined ? { last_name: normalizedLastName || null } : {}),
                ...(data.first_name !== undefined || data.last_name !== undefined
                    ? { name: nextDisplayName }
                    : {}),
                ...(data.phoneNumber !== undefined ? { phoneNumber: nextPhone } : {}),
                ...(data.phone_prefix !== undefined || data.phoneNumber !== undefined
                    ? { phone_prefix: nextPhonePrefix }
                    : {}),
                ...(data.country_code !== undefined ? { country_code: normalizedCountryCode } : {}),
                ...(phoneChanged ? { phoneNumberVerified: false } : {}),
            },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                name: true,
                country_code: true,
                phoneNumber: true,
                phone_prefix: true,
                phoneNumberVerified: true,
                emailVerified: true,
                image: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return {
            code: 200,
            message: "Profile updated",
            error: false,
            data: { user: updated },
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error updating profile",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
// ── Email change with OTP verification ──
async function sendEmailChangeOtp(userId, newEmail) {
    try {
        const trimmedEmail = newEmail.trim().toLowerCase();
        const identifier = `${userId}:${trimmedEmail}`;
        const resendGuard = await ensureProfileOtpResendAllowed({
            channel: verification_enums_1.VerificationChannel.EMAIL,
            identifier,
        });
        if (resendGuard) {
            return resendGuard;
        }
        // Check if email is already taken
        const existing = await UserRepo.getUserByEmail(trimmedEmail);
        if (existing && existing.id !== userId) {
            return { code: 400, message: "Email already in use", error: true };
        }
        const code = (0, verification_1.generateNumericCode)();
        const code_hash = await bcryptjs_1.default.hash(code, 10);
        const expires_at = new Date(Date.now() + verification_1.OTP_TTL_MINUTES * 60000);
        await VerificationRepo.createVerification({
            channel: verification_enums_1.VerificationChannel.EMAIL,
            purpose: verification_enums_1.VerificationPurpose.PROFILE_UPDATE,
            identifier,
            code_hash,
            expires_at,
        });
        const result = await (0, sendEmail_1.sendEmailCode)(trimmedEmail, code.toString());
        if (result === -1) {
            throw new Error("Failed to send verification email");
        }
        return {
            code: 200,
            message: "Verification code sent to new email",
            error: false,
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error sending verification code",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
async function verifyEmailChange(userId, newEmail, code) {
    try {
        const trimmedEmail = newEmail.trim().toLowerCase();
        const identifier = `${userId}:${trimmedEmail}`;
        const verificationCode = await VerificationRepo.getVerificationCode(verification_enums_1.VerificationChannel.EMAIL, verification_enums_1.VerificationPurpose.PROFILE_UPDATE, identifier);
        if (!verificationCode) {
            return { code: 400, message: "Verification code not found or expired", error: true };
        }
        if (verificationCode.attempts >= verificationCode.max_attempts) {
            return { code: 400, message: "Too many attempts", error: true };
        }
        const isValid = await bcryptjs_1.default.compare(code, verificationCode.code_hash);
        await VerificationRepo.updateVerificationCode(verificationCode.id, {
            consumed_at: isValid ? new Date() : verificationCode.consumed_at,
            attempts: verificationCode.attempts + 1,
        });
        if (!isValid) {
            return { code: 400, message: "Invalid code", error: true };
        }
        // Update user email
        const updated = await UserRepo.updateUserEmail(userId, trimmedEmail);
        return {
            code: 200,
            message: "Email updated successfully",
            error: false,
            data: { user: updated },
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error verifying code",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
// ── Phone change with OTP verification ──
async function sendPhoneChangeOtp(userId, phone) {
    try {
        const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
            phonePrefix: phone.phonePrefix,
            phoneNumber: phone.phoneNumber,
        });
        if (!canonicalPhone.phoneNumber || !canonicalPhone.phonePrefix) {
            return { code: 400, message: "Phone number and prefix are required", error: true };
        }
        const fullPhone = `+${canonicalPhone.phonePrefix}${canonicalPhone.phoneNumber}`;
        const identifier = `${userId}:${fullPhone}`;
        const resendGuard = await ensureProfileOtpResendAllowed({
            channel: verification_enums_1.VerificationChannel.WHATSAPP,
            identifier,
        });
        if (resendGuard) {
            return resendGuard;
        }
        // Check if phone is already taken
        const existing = await UserRepo.findActiveUserByPhone({
            phoneNumber: canonicalPhone.phoneNumber,
            phonePrefix: canonicalPhone.phonePrefix,
            excludeUserId: userId,
        });
        if (existing && existing.id !== userId) {
            return { code: 400, message: "Phone number already in use", error: true };
        }
        const code = (0, verification_1.generateNumericCode)();
        const code_hash = await bcryptjs_1.default.hash(code, 10);
        const expires_at = new Date(Date.now() + verification_1.OTP_TTL_MINUTES * 60000);
        const verification = await VerificationRepo.createVerification({
            channel: verification_enums_1.VerificationChannel.WHATSAPP,
            purpose: verification_enums_1.VerificationPurpose.PROFILE_UPDATE,
            identifier,
            code_hash,
            expires_at,
        });
        const result = await (0, whatsappSender_1.queueWhatsappCode)(fullPhone, code, {
            sourceType: 'PROFILE_PHONE_OTP',
            sourceId: String(verification.id),
            expiresAt: expires_at,
        });
        if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
            throw new Error("Failed to send WhatsApp verification");
        }
        const deliveryStatus = (0, whatsappSender_1.getWhatsappEnqueueLifecycleStatus)(result);
        return {
            code: 200,
            message: deliveryStatus === 'SENT'
                ? "Verification code already sent via WhatsApp"
                : "Verification code queued for WhatsApp",
            error: false,
            data: {
                status: deliveryStatus,
                queued: deliveryStatus === 'PENDING' || deliveryStatus === 'PROCESSING',
                job_id: result.jobId ?? null,
            },
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error sending verification code",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
async function verifyPhoneChange(userId, phone, code) {
    try {
        const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
            phonePrefix: phone.phonePrefix,
            phoneNumber: phone.phoneNumber,
        });
        if (!canonicalPhone.phoneNumber || !canonicalPhone.phonePrefix) {
            return { code: 400, message: "Phone number and prefix are required", error: true };
        }
        const fullPhone = `+${canonicalPhone.phonePrefix}${canonicalPhone.phoneNumber}`;
        const identifier = `${userId}:${fullPhone}`;
        const verificationCode = await VerificationRepo.getVerificationCode(verification_enums_1.VerificationChannel.WHATSAPP, verification_enums_1.VerificationPurpose.PROFILE_UPDATE, identifier);
        if (!verificationCode) {
            return { code: 400, message: "Verification code not found or expired", error: true };
        }
        if (verificationCode.attempts >= verificationCode.max_attempts) {
            return { code: 400, message: "Too many attempts", error: true };
        }
        const isValid = await bcryptjs_1.default.compare(code, verificationCode.code_hash);
        await VerificationRepo.updateVerificationCode(verificationCode.id, {
            consumed_at: isValid ? new Date() : verificationCode.consumed_at,
            attempts: verificationCode.attempts + 1,
        });
        if (!isValid) {
            return { code: 400, message: "Invalid code", error: true };
        }
        const updated = await UserRepo.updateUserPhone(userId, canonicalPhone.phoneNumber, canonicalPhone.phonePrefix, phone.countryCode);
        return {
            code: 200,
            message: "Phone number updated successfully",
            error: false,
            data: { user: updated },
        };
    }
    catch (error) {
        return {
            code: 500,
            message: "Error verifying code",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
