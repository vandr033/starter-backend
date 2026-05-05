import crypto from 'crypto';
import { CompanyUserRole } from '@prisma/client';
import { prisma } from '../prisma/client';
import { hash } from '../utils/password';
import { canonicalizePhoneParts } from '../utils/phoneNormalization';
import { isTemporaryEmailAddress, sendCustomerPortalAccessEmail } from '../utils/sendEmail';

type ServiceFailure = {
    error: true;
    code: number;
    message: string;
};

export type CustomerAccountInviteContext =
    | {
        mode: 'TEMP_PASSWORD';
        email: string;
        companyName: string;
        temporaryPassword: string;
    }
    | {
        mode: 'EXISTING_ACCOUNT';
        email: string;
        companyName: string;
    };

export type EnsuredCustomerProfile = {
    error?: false;
    customerProfileId: number;
    userId: string;
    userName: string;
    userEmail: string | null;
    userCountryCode: string | null;
    userPhonePrefix: string | null;
    userPhoneNumber: string | null;
    inviteContext: CustomerAccountInviteContext | null;
};

function normalizeEmail(email?: string | null): string | null {
    const value = (email ?? '').trim().toLowerCase();
    return value || null;
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitFullName(fullName: string): { firstName: string | null; lastName: string | null; displayName: string } {
    const cleaned = fullName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
        return {
            firstName: null,
            lastName: null,
            displayName: '',
        };
    }

    const parts = cleaned.split(' ');
    return {
        firstName: parts[0] || null,
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
        displayName: cleaned,
    };
}

function buildPhoneCandidates(phonePrefix?: string | null, phoneNumber?: string | null): string[] {
    const canonical = canonicalizePhoneParts({ phonePrefix, phoneNumber });
    if (!canonical.phoneNumber) return [];

    const values = new Set<string>();
    values.add(canonical.phoneNumber);
    if (canonical.phonePrefix) {
        values.add(`${canonical.phonePrefix}${canonical.phoneNumber}`);
        values.add(`+${canonical.phonePrefix}${canonical.phoneNumber}`);
    }

    return Array.from(values);
}

async function ensureCustomerRole(companyId: number, userId: string): Promise<void> {
    const existingCompanyUser = await prisma.companyUser.findFirst({
        where: {
            company_id: companyId,
            user_id: userId,
            role: CompanyUserRole.CUSTOMER,
        },
        select: {
            id: true,
            deleted_at: true,
        },
    });

    if (!existingCompanyUser) {
        await prisma.companyUser.create({
            data: {
                company_id: companyId,
                user_id: userId,
                role: CompanyUserRole.CUSTOMER,
            },
        });
        return;
    }

    if (existingCompanyUser.deleted_at) {
        await prisma.companyUser.update({
            where: { id: existingCompanyUser.id },
            data: { deleted_at: null },
        });
    }
}

async function ensureCustomerProfile(companyId: number, userId: string): Promise<number> {
    const existingProfile = await prisma.customerProfile.findFirst({
        where: {
            company_id: companyId,
            user_id: userId,
        },
        select: {
            id: true,
            deleted_at: true,
        },
    });

    if (!existingProfile) {
        const profile = await prisma.customerProfile.create({
            data: {
                company_id: companyId,
                user_id: userId,
            },
            select: { id: true },
        });
        return profile.id;
    }

    if (existingProfile.deleted_at) {
        await prisma.customerProfile.update({
            where: { id: existingProfile.id },
            data: { deleted_at: null },
        });
    }

    return existingProfile.id;
}

export async function ensureCustomerProfileWithAccount(params: {
    companyId: number;
    fullName: string;
    email: string;
    phone?: string | null;
    phonePrefix?: string | null;
    countryCode?: string | null;
}): Promise<EnsuredCustomerProfile | ServiceFailure> {
    const company = await prisma.company.findFirst({
        where: { id: params.companyId, deleted_at: null },
        select: {
            id: true,
            name: true,
            phone_prefix: true,
        },
    });

    if (!company) {
        return { error: true, code: 404, message: 'Company not found' };
    }

    const normalizedEmail = normalizeEmail(params.email);
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
        return { error: true, code: 400, message: 'A valid email is required to create a member account' };
    }

    const nameParts = splitFullName(params.fullName);
    if (!nameParts.displayName) {
        return { error: true, code: 400, message: 'Member name is required' };
    }

    const canonicalPhone = canonicalizePhoneParts({
        phonePrefix: params.phonePrefix,
        phoneNumber: params.phone,
        defaultPrefix: company.phone_prefix || '591',
    });

    const phoneCandidates = buildPhoneCandidates(canonicalPhone.phonePrefix, canonicalPhone.phoneNumber);

    const [emailUser, phoneUser] = await Promise.all([
        prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: {
                id: true,
                email: true,
                name: true,
                first_name: true,
                last_name: true,
                country_code: true,
                phone_prefix: true,
                phoneNumber: true,
            },
        }),
        phoneCandidates.length
            ? prisma.user.findFirst({
                where: {
                    phoneNumber: {
                        in: phoneCandidates,
                    },
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    first_name: true,
                    last_name: true,
                    country_code: true,
                    phone_prefix: true,
                    phoneNumber: true,
                },
            })
            : Promise.resolve(null),
    ]);

    if (emailUser && phoneUser && emailUser.id !== phoneUser.id) {
        return {
            error: true,
            code: 409,
            message: 'Email and phone belong to different accounts. Review the member details before continuing.',
        };
    }

    let user = emailUser ?? phoneUser;
    let inviteContext: CustomerAccountInviteContext | null = null;

    if (!user) {
        const temporaryPassword = crypto.randomBytes(9).toString('base64url');
        const passwordHash = await hash(temporaryPassword);
        const normalizedCountryCode = params.countryCode?.trim().toUpperCase() || null;

        user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                name: nameParts.displayName,
                first_name: nameParts.firstName ?? undefined,
                last_name: nameParts.lastName ?? undefined,
                ...(normalizedCountryCode ? { country_code: normalizedCountryCode } : {}),
                phone_prefix: canonicalPhone.phoneNumber ? canonicalPhone.phonePrefix : undefined,
                phoneNumber: canonicalPhone.phoneNumber ?? undefined,
                must_change_password: true,
            },
            select: {
                id: true,
                email: true,
                name: true,
                first_name: true,
                last_name: true,
                country_code: true,
                phone_prefix: true,
                phoneNumber: true,
            },
        });

        await prisma.account.create({
            data: {
                userId: user.id,
                providerId: 'credential',
                accountId: normalizedEmail,
                password: passwordHash,
            },
        });

        inviteContext = {
            mode: 'TEMP_PASSWORD',
            email: normalizedEmail,
            companyName: company.name,
            temporaryPassword,
        };
    } else {
        const updateData: Record<string, string | null> = {};
        const normalizedCountryCode = params.countryCode?.trim().toUpperCase() || null;

        if ((!user.name || isTemporaryEmailAddress(user.name)) && nameParts.displayName) {
            updateData.name = nameParts.displayName;
        }
        if (!user.first_name && nameParts.firstName) {
            updateData.first_name = nameParts.firstName;
        }
        if (!user.last_name && nameParts.lastName) {
            updateData.last_name = nameParts.lastName;
        }
        if (!user.phoneNumber && canonicalPhone.phoneNumber) {
            updateData.phoneNumber = canonicalPhone.phoneNumber;
            updateData.phone_prefix = canonicalPhone.phonePrefix;
        }
        if (!user.country_code && normalizedCountryCode) {
            updateData.country_code = normalizedCountryCode;
        }
        if (isTemporaryEmailAddress(user.email) && user.email !== normalizedEmail) {
            updateData.email = normalizedEmail;
        }

        if (Object.keys(updateData).length > 0) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: updateData,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    first_name: true,
                    last_name: true,
                    country_code: true,
                    phone_prefix: true,
                    phoneNumber: true,
                },
            });
        }

        let credentialAccount = await prisma.account.findFirst({
            where: {
                userId: user.id,
                providerId: { in: ['credential', 'credentials'] },
            },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                accountId: true,
            },
        });

        const currentEmail = normalizeEmail(user.email);
        if (credentialAccount && currentEmail && credentialAccount.accountId !== currentEmail) {
            credentialAccount = await prisma.account.update({
                where: { id: credentialAccount.id },
                data: {
                    providerId: 'credential',
                    accountId: currentEmail,
                },
                select: {
                    id: true,
                    accountId: true,
                },
            });
        }

        if (!credentialAccount) {
            const temporaryPassword = crypto.randomBytes(9).toString('base64url');
            const passwordHash = await hash(temporaryPassword);

            await prisma.account.create({
                data: {
                    userId: user.id,
                    providerId: 'credential',
                    accountId: currentEmail || normalizedEmail,
                    password: passwordHash,
                },
            });

            await prisma.user.update({
                where: { id: user.id },
                data: {
                    must_change_password: true,
                },
            });

            inviteContext = {
                mode: 'TEMP_PASSWORD',
                email: currentEmail || normalizedEmail,
                companyName: company.name,
                temporaryPassword,
            };
        } else if (currentEmail && !isTemporaryEmailAddress(currentEmail)) {
            inviteContext = {
                mode: 'EXISTING_ACCOUNT',
                email: currentEmail,
                companyName: company.name,
            };
        }
    }

    await ensureCustomerRole(company.id, user.id);
    const customerProfileId = await ensureCustomerProfile(company.id, user.id);

    return {
        customerProfileId,
        userId: user.id,
        userName: user.name,
        userEmail: normalizeEmail(user.email),
        userCountryCode: user.country_code || null,
        userPhonePrefix: user.phone_prefix || null,
        userPhoneNumber: user.phoneNumber || null,
        inviteContext,
    };
}

export async function sendCustomerPortalInvite(inviteContext: CustomerAccountInviteContext): Promise<number> {
    if (inviteContext.mode === 'TEMP_PASSWORD') {
        return sendCustomerPortalAccessEmail({
            email: inviteContext.email,
            companyName: inviteContext.companyName,
            temporaryPassword: inviteContext.temporaryPassword,
        });
    }

    return sendCustomerPortalAccessEmail({
        email: inviteContext.email,
        companyName: inviteContext.companyName,
    });
}
