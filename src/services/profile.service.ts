import * as UserRepo from "../repositories/user.repo";
import * as VerificationRepo from "../repositories/verification.repo";
import { MensajeApi } from "../types/MensajeApi";
import {
    generateNumericCode,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_TTL_MINUTES,
} from "../utils/verification";
import { VerificationChannel, VerificationPurpose } from "../types/verification-enums";
import bcrypt from "bcryptjs";
import { sendWhatsappCode } from "../utils/whatsappSender";
import { sendEmailCode } from "../utils/sendEmail";
import { prisma } from "../prisma/client";
import { canonicalizePhoneParts } from "../utils/phoneNormalization";

function getOtpResendCooldownSeconds(): number {
    const safe = Number.isFinite(OTP_RESEND_COOLDOWN_SECONDS) ? OTP_RESEND_COOLDOWN_SECONDS : 60;
    return Math.max(1, Math.trunc(safe));
}

async function ensureProfileOtpResendAllowed(params: {
    channel: VerificationChannel;
    identifier: string;
}): Promise<MensajeApi | null> {
    const latest = await VerificationRepo.getLatestVerification(
        params.channel,
        VerificationPurpose.PROFILE_UPDATE,
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

export async function getProfile(userId: string): Promise<MensajeApi> {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                name: true,
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
    } catch (error: any) {
        return {
            code: 500,
            message: "Error loading profile",
            error: true,
            technicalMessage: error?.message,
        };
    }
}

export async function updateProfile(
    userId: string,
    data: { first_name?: string; last_name?: string; phoneNumber?: string; phone_prefix?: string }
): Promise<MensajeApi> {
    try {
        const existing = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                first_name: true,
                last_name: true,
                name: true,
                phoneNumber: true,
                phone_prefix: true,
            },
        });

        if (!existing) {
            return { code: 404, message: "User not found", error: true };
        }

        const hasAnyUpdate =
            data.first_name !== undefined ||
            data.last_name !== undefined ||
            data.phoneNumber !== undefined ||
            data.phone_prefix !== undefined;

        if (!hasAnyUpdate) {
            return { code: 400, message: "No profile fields provided", error: true };
        }

        const normalizedFirstName =
            data.first_name !== undefined ? data.first_name.trim() : (existing.first_name || "");
        const normalizedLastName =
            data.last_name !== undefined ? data.last_name.trim() : (existing.last_name || "");

        const nextDisplayName =
            `${normalizedFirstName} ${normalizedLastName}`.trim() || existing.name || "User";

        const canonicalPhone = canonicalizePhoneParts({
            phonePrefix: data.phone_prefix !== undefined ? data.phone_prefix : existing.phone_prefix,
            phoneNumber: data.phoneNumber !== undefined ? data.phoneNumber : existing.phoneNumber,
        });
        let nextPhone: string | null =
            data.phoneNumber !== undefined || data.phone_prefix !== undefined
                ? canonicalPhone.phoneNumber
                : (existing.phoneNumber || null);

        let nextPhonePrefix: string | null =
            data.phoneNumber !== undefined || data.phone_prefix !== undefined
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

        const updated = await prisma.user.update({
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
                ...(phoneChanged ? { phoneNumberVerified: false } : {}),
            },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                name: true,
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
    } catch (error: any) {
        return {
            code: 500,
            message: "Error updating profile",
            error: true,
            technicalMessage: error?.message,
        };
    }
}

// ── Email change with OTP verification ──

export async function sendEmailChangeOtp(
    userId: string,
    newEmail: string
): Promise<MensajeApi> {
    try {
        const trimmedEmail = newEmail.trim().toLowerCase();
        const identifier = `${userId}:${trimmedEmail}`;

        const resendGuard = await ensureProfileOtpResendAllowed({
            channel: VerificationChannel.EMAIL,
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

        const code = generateNumericCode();
        const code_hash = await bcrypt.hash(code, 10);
        const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

        await VerificationRepo.createVerification({
            channel: VerificationChannel.EMAIL,
            purpose: VerificationPurpose.PROFILE_UPDATE,
            identifier,
            code_hash,
            expires_at,
        });

        const result = await sendEmailCode(trimmedEmail, code.toString());
        if (result === -1) {
            throw new Error("Failed to send verification email");
        }

        return {
            code: 200,
            message: "Verification code sent to new email",
            error: false,
        };
    } catch (error: any) {
        return {
            code: 500,
            message: "Error sending verification code",
            error: true,
            technicalMessage: error?.message,
        };
    }
}

export async function verifyEmailChange(
    userId: string,
    newEmail: string,
    code: string
): Promise<MensajeApi> {
    try {
        const trimmedEmail = newEmail.trim().toLowerCase();
        const identifier = `${userId}:${trimmedEmail}`;

        const verificationCode = await VerificationRepo.getVerificationCode(
            VerificationChannel.EMAIL,
            VerificationPurpose.PROFILE_UPDATE,
            identifier
        );

        if (!verificationCode) {
            return { code: 400, message: "Verification code not found or expired", error: true };
        }

        if (verificationCode.attempts >= verificationCode.max_attempts) {
            return { code: 400, message: "Too many attempts", error: true };
        }

        const isValid = await bcrypt.compare(code, verificationCode.code_hash);

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
    } catch (error: any) {
        return {
            code: 500,
            message: "Error verifying code",
            error: true,
            technicalMessage: error?.message,
        };
    }
}

// ── Phone change with OTP verification ──

export async function sendPhoneChangeOtp(
    userId: string,
    newPhone: string
): Promise<MensajeApi> {
    try {
        const identifier = `${userId}:${newPhone}`;

        const resendGuard = await ensureProfileOtpResendAllowed({
            channel: VerificationChannel.WHATSAPP,
            identifier,
        });
        if (resendGuard) {
            return resendGuard;
        }

        // Check if phone is already taken
        const existing = await UserRepo.findActiveUserByPhone({
            phoneNumber: newPhone,
            excludeUserId: userId,
        });
        if (existing && existing.id !== userId) {
            return { code: 400, message: "Phone number already in use", error: true };
        }

        const code = generateNumericCode();
        const code_hash = await bcrypt.hash(code, 10);
        const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

        await VerificationRepo.createVerification({
            channel: VerificationChannel.WHATSAPP,
            purpose: VerificationPurpose.PROFILE_UPDATE,
            identifier,
            code_hash,
            expires_at,
        });

        const result = await sendWhatsappCode(newPhone, code);
        if (result === -1) {
            throw new Error("Failed to send WhatsApp verification");
        }

        return {
            code: 200,
            message: "Verification code sent via WhatsApp",
            error: false,
        };
    } catch (error: any) {
        return {
            code: 500,
            message: "Error sending verification code",
            error: true,
            technicalMessage: error?.message,
        };
    }
}

export async function verifyPhoneChange(
    userId: string,
    newPhone: string,
    code: string,
    phone_prefix?: string
): Promise<MensajeApi> {
    try {
        const identifier = `${userId}:${newPhone}`;

        const verificationCode = await VerificationRepo.getVerificationCode(
            VerificationChannel.WHATSAPP,
            VerificationPurpose.PROFILE_UPDATE,
            identifier
        );

        if (!verificationCode) {
            return { code: 400, message: "Verification code not found or expired", error: true };
        }

        if (verificationCode.attempts >= verificationCode.max_attempts) {
            return { code: 400, message: "Too many attempts", error: true };
        }

        const isValid = await bcrypt.compare(code, verificationCode.code_hash);

        await VerificationRepo.updateVerificationCode(verificationCode.id, {
            consumed_at: isValid ? new Date() : verificationCode.consumed_at,
            attempts: verificationCode.attempts + 1,
        });

        if (!isValid) {
            return { code: 400, message: "Invalid code", error: true };
        }

        const updated = await UserRepo.updateUserPhone(userId, newPhone, phone_prefix);

        return {
            code: 200,
            message: "Phone number updated successfully",
            error: false,
            data: { user: updated },
        };
    } catch (error: any) {
        return {
            code: 500,
            message: "Error verifying code",
            error: true,
            technicalMessage: error?.message,
        };
    }
}
