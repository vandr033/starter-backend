import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import bcrypt from 'bcryptjs';
import { VerificationChannel, VerificationPurpose } from '@prisma/client';

/**
 * GET /api/staff/invite-info/:token
 * Returns info about the invite (staff name, company name, email)
 */
export async function getInviteInfo(req: Request, res: Response) {
    try {
        const { token } = req.params;

        const staff = await prisma.staffProfile.findFirst({
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
    } catch (error: any) {
        console.error('Error getting invite info:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * POST /api/staff/accept-invite
 * Accepts the invite, sets password, activates staff
 */
export async function acceptInvite(req: Request, res: Response) {
    try {
        const { token, code, password } = req.body;

        if (!token || !code || !password) {
            return res.status(400).json({ error: 'token, code, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Find the staff profile
        const staff = await prisma.staffProfile.findFirst({
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
        const verificationCode = await prisma.verificationCode.findFirst({
            where: {
                identifier: staff.user.email,
                channel: VerificationChannel.EMAIL,
                purpose: VerificationPurpose.STAFF_INVITE,
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
        await prisma.verificationCode.update({
            where: { id: verificationCode.id },
            data: { attempts: { increment: 1 } },
        });

        const isValid = await bcrypt.compare(code, verificationCode.code_hash);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Mark code as consumed
        await prisma.verificationCode.update({
            where: { id: verificationCode.id },
            data: { consumed_at: new Date() },
        });

        // Set password via Account model (credential provider)
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if account exists
        const existingAccount = await prisma.account.findFirst({
            where: {
                userId: staff.user_id,
                providerId: 'credential',
            },
        });

        if (existingAccount) {
            await prisma.account.update({
                where: { id: existingAccount.id },
                data: { password: hashedPassword },
            });
        } else {
            await prisma.account.create({
                data: {
                    userId: staff.user_id,
                    providerId: 'credential',
                    accountId: staff.user_id,
                    password: hashedPassword,
                },
            });
        }

        // Activate staff profile
        await prisma.staffProfile.update({
            where: { id: staff.id },
            data: {
                status: 'ACTIVE',
                is_bookable: true,
                invite_token: null,
            },
        });

        // Mark user as verified
        await prisma.user.update({
            where: { id: staff.user_id },
            data: { emailVerified: true },
        });

        return res.json({ message: 'Invitation accepted successfully. You can now sign in.' });
    } catch (error: any) {
        console.error('Error accepting invite:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
