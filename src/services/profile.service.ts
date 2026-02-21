import * as UserRepo from "../repositories/user.repo";
import * as VerificationRepo from "../repositories/verification.repo";
import { MensajeApi } from "../types/MensajeApi";
import { generateNumericCode, OTP_TTL_MINUTES } from "../utils/verification";
import { VerificationChannel, VerificationPurpose } from "@prisma/client";
import bcrypt from "bcryptjs";
import { sendWhatsappCode } from "../utils/whatsappSender";
import { sendEmailCode } from "../utils/sendEmail";
import { prisma } from "../prisma/client";

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
    data: { first_name?: string; last_name?: string }
): Promise<MensajeApi> {
    try {
        if (!data.first_name) {
            return { code: 400, message: "First name is required", error: true };
        }

        const updated = await UserRepo.updateUserNames(userId, data.first_name, data.last_name);

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
            identifier: `${userId}:${trimmedEmail}`,
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
        // Check if phone is already taken
        const existing = await prisma.user.findUnique({
            where: { phoneNumber: newPhone },
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
            identifier: `${userId}:${newPhone}`,
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
