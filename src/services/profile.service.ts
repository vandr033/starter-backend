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
import { getWhatsappEnqueueLifecycleStatus, isWhatsappEnqueueAccepted, queueWhatsappCode } from "../utils/whatsappSender";
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
    data: {
        first_name?: string;
        last_name?: string;
        phoneNumber?: string;
        phone_prefix?: string;
        country_code?: string;
    }
): Promise<MensajeApi> {
    try {
        const existing = await prisma.user.findUnique({
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

        const hasAnyUpdate =
            data.first_name !== undefined ||
            data.last_name !== undefined ||
            data.phoneNumber !== undefined ||
            data.phone_prefix !== undefined ||
            data.country_code !== undefined;

        if (!hasAnyUpdate) {
            return { code: 400, message: "No profile fields provided", error: true };
        }

        const normalizedFirstName =
            data.first_name !== undefined ? data.first_name.trim() : (existing.first_name || "");
        const normalizedLastName =
            data.last_name !== undefined ? data.last_name.trim() : (existing.last_name || "");

        const nextDisplayName =
            `${normalizedFirstName} ${normalizedLastName}`.trim() || existing.name || "User";
        const normalizedCountryCode =
            data.country_code !== undefined
                ? (data.country_code.trim().toUpperCase() || null)
                : (existing.country_code || null);

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
    phone: {
        phoneNumber: string;
        phonePrefix: string;
        countryCode?: string;
    }
): Promise<MensajeApi> {
    try {
        const canonicalPhone = canonicalizePhoneParts({
            phonePrefix: phone.phonePrefix,
            phoneNumber: phone.phoneNumber,
        });
        if (!canonicalPhone.phoneNumber || !canonicalPhone.phonePrefix) {
            return { code: 400, message: "Phone number and prefix are required", error: true };
        }

        const fullPhone = `+${canonicalPhone.phonePrefix}${canonicalPhone.phoneNumber}`;
        const identifier = `${userId}:${fullPhone}`;

        const resendGuard = await ensureProfileOtpResendAllowed({
            channel: VerificationChannel.WHATSAPP,
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

        const code = generateNumericCode();
        const code_hash = await bcrypt.hash(code, 10);
        const expires_at = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

        const verification = await VerificationRepo.createVerification({
            channel: VerificationChannel.WHATSAPP,
            purpose: VerificationPurpose.PROFILE_UPDATE,
            identifier,
            code_hash,
            expires_at,
        });

        const result = await queueWhatsappCode(fullPhone, code, {
            sourceType: 'PROFILE_PHONE_OTP',
            sourceId: String(verification.id),
            expiresAt: expires_at,
        });
        if (!isWhatsappEnqueueAccepted(result)) {
            throw new Error("Failed to send WhatsApp verification");
        }

        const deliveryStatus = getWhatsappEnqueueLifecycleStatus(result);

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
    phone: {
        phoneNumber: string;
        phonePrefix: string;
        countryCode?: string;
    },
    code: string
): Promise<MensajeApi> {
    try {
        const canonicalPhone = canonicalizePhoneParts({
            phonePrefix: phone.phonePrefix,
            phoneNumber: phone.phoneNumber,
        });
        if (!canonicalPhone.phoneNumber || !canonicalPhone.phonePrefix) {
            return { code: 400, message: "Phone number and prefix are required", error: true };
        }

        const fullPhone = `+${canonicalPhone.phonePrefix}${canonicalPhone.phoneNumber}`;
        const identifier = `${userId}:${fullPhone}`;

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

        const updated = await UserRepo.updateUserPhone(
            userId,
            canonicalPhone.phoneNumber,
            canonicalPhone.phonePrefix,
            phone.countryCode,
        );

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
