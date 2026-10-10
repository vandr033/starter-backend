"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInviteInfo = getInviteInfo;
exports.acceptInvite = acceptInvite;
const client_1 = require("../prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const verification_enums_1 = require("../types/verification-enums");
const auth_constants_1 = require("../config/auth-constants");
/**
 * GET /api/staff/invite-info/:token
 * Returns info about the invite (staff name, company name, email)
 */
async function getInviteInfo(req, res) {
    try {
        const rawToken = req.params.token;
        const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken);
        const staff = await client_1.prisma.staffProfile.findFirst({
            where: {
                invite_token: token,
                status: 'PENDING',
                deleted_at: null,
            },
            select: {
                display_name: true,
                user: {
                    select: { email: true },
                },
                company: {
                    select: { name: true },
                },
            },
        });
        if (!staff) {
            return res.status(404).json({ error: 'Invalid or expired invitation' });
        }
        return res.json({
            data: {
                display_name: staff.display_name,
                company_name: staff.company.name,
                email: staff.user.email,
            },
        });
    }
    catch (error) {
        console.error('Error getting invite info:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
/**
 * POST /api/staff/accept-invite
 * Accepts the invite, sets password, activates staff
 */
async function acceptInvite(req, res) {
    try {
        const { token, code, password } = req.body;
        if (!token || !code || !password) {
            return res.status(400).json({ error: 'token, code, and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        // Find the staff profile
        const staff = await client_1.prisma.staffProfile.findFirst({
            where: {
                invite_token: token,
                status: 'PENDING',
                deleted_at: null,
            },
            select: {
                id: true,
                company_id: true,
                user_id: true,
                user: {
                    select: { email: true },
                },
            },
        });
        if (!staff) {
            return res.status(404).json({ error: 'Invalid or expired invitation' });
        }
        // Verify OTP
        const verificationCode = await client_1.prisma.verificationCode.findFirst({
            where: {
                identifier: staff.user.email,
                channel: verification_enums_1.VerificationChannel.EMAIL,
                purpose: verification_enums_1.VerificationPurpose.STAFF_INVITE,
                consumed_at: null,
                expires_at: { gte: new Date() },
            },
            orderBy: { created_at: 'desc' },
        });
        if (!verificationCode) {
            return res.status(400).json({ error: 'Verification code expired. Please ask admin to resend the invite.' });
        }
        if (verificationCode.attempts >= verificationCode.max_attempts) {
            return res.status(400).json({ error: 'Too many attempts. Please ask admin to resend the invite.' });
        }
        // Increment attempts
        await client_1.prisma.verificationCode.update({
            where: { id: verificationCode.id },
            data: { attempts: { increment: 1 } },
        });
        const isValid = await bcryptjs_1.default.compare(code, verificationCode.code_hash);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }
        // Mark code as consumed
        await client_1.prisma.verificationCode.update({
            where: { id: verificationCode.id },
            data: { consumed_at: new Date() },
        });
        // Set password via Account model (credential provider)
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        // Check if account exists
        const existingAccount = await client_1.prisma.account.findFirst({
            where: {
                userId: staff.user_id,
                providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
            },
        });
        if (existingAccount) {
            await client_1.prisma.account.update({
                where: { id: existingAccount.id },
                data: { password: hashedPassword },
            });
        }
        else {
            await client_1.prisma.account.create({
                data: {
                    userId: staff.user_id,
                    providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                    accountId: staff.user_id,
                    password: hashedPassword,
                },
            });
        }
        // Activate staff profile
        await client_1.prisma.staffProfile.update({
            where: { id: staff.id },
            data: {
                status: 'ACTIVE',
                is_bookable: true,
                invite_token: null,
            },
        });
        // Mark user as verified
        await client_1.prisma.user.update({
            where: { id: staff.user_id },
            data: { emailVerified: true },
        });
        return res.json({ message: 'Invitation accepted successfully. You can now sign in.' });
    }
    catch (error) {
        console.error('Error accepting invite:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
