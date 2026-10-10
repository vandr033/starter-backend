"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureCustomerProfileWithAccount = ensureCustomerProfileWithAccount;
exports.sendCustomerPortalInvite = sendCustomerPortalInvite;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const password_1 = require("../utils/password");
const phoneNormalization_1 = require("../utils/phoneNormalization");
const demo_operator_membership_service_1 = require("./demo-operator-membership.service");
const sendEmail_1 = require("../utils/sendEmail");
const auth_constants_1 = require("../config/auth-constants");
function normalizeEmail(email) {
    const value = (email ?? '').trim().toLowerCase();
    return value || null;
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
async function ensureUniqueTempEmail(basePhone) {
    let attempt = 0;
    while (attempt < 1000) {
        const suffix = attempt === 0 ? '' : `.${attempt}`;
        const email = `${basePhone}${suffix}@tmppriconpri.com`;
        const existing = await client_2.prisma.user.findFirst({
            where: { email, deleted_at: null },
            select: { id: true },
        });
        if (!existing)
            return email;
        attempt += 1;
    }
    return `${basePhone}.${Date.now()}@tmppriconpri.com`;
}
function splitFullName(fullName) {
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
function buildPhoneCandidates(phonePrefix, phoneNumber) {
    const canonical = (0, phoneNormalization_1.canonicalizePhoneParts)({ phonePrefix, phoneNumber });
    if (!canonical.phoneNumber)
        return [];
    const values = new Set();
    values.add(canonical.phoneNumber);
    if (canonical.phonePrefix) {
        values.add(`${canonical.phonePrefix}${canonical.phoneNumber}`);
        values.add(`+${canonical.phonePrefix}${canonical.phoneNumber}`);
    }
    return Array.from(values);
}
async function ensureCustomerRole(companyId, userId) {
    await (0, demo_operator_membership_service_1.assertDemoOperatorMayJoinCompany)(client_2.prisma, userId, companyId);
    const existingCompanyUser = await client_2.prisma.companyUser.findFirst({
        where: {
            company_id: companyId,
            user_id: userId,
            role: client_1.CompanyUserRole.CUSTOMER,
        },
        select: {
            id: true,
            deleted_at: true,
        },
    });
    if (!existingCompanyUser) {
        await client_2.prisma.companyUser.create({
            data: {
                company_id: companyId,
                user_id: userId,
                role: client_1.CompanyUserRole.CUSTOMER,
            },
        });
        return;
    }
    if (existingCompanyUser.deleted_at) {
        await client_2.prisma.companyUser.update({
            where: { id: existingCompanyUser.id },
            data: { deleted_at: null },
        });
    }
}
async function ensureCustomerProfile(companyId, userId) {
    const existingProfile = await client_2.prisma.customerProfile.findFirst({
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
        const profile = await client_2.prisma.customerProfile.create({
            data: {
                company_id: companyId,
                user_id: userId,
            },
            select: { id: true },
        });
        return profile.id;
    }
    if (existingProfile.deleted_at) {
        await client_2.prisma.customerProfile.update({
            where: { id: existingProfile.id },
            data: { deleted_at: null },
        });
    }
    return existingProfile.id;
}
async function ensureCustomerProfileWithAccount(params) {
    const company = await client_2.prisma.company.findFirst({
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
    const nameParts = splitFullName(params.fullName);
    if (!nameParts.displayName) {
        return { error: true, code: 400, message: 'Member name is required' };
    }
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
        phonePrefix: params.phonePrefix,
        phoneNumber: params.phone,
        defaultPrefix: company.phone_prefix || '591',
    });
    const normalizedEmail = normalizeEmail(params.email);
    const hasEmail = Boolean(normalizedEmail);
    const hasPhone = Boolean(canonicalPhone.phoneNumber);
    if (!hasEmail && !hasPhone) {
        return {
            error: true,
            code: 400,
            message: 'Provide at least an email or phone number to create a member account',
        };
    }
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
        return { error: true, code: 400, message: 'Provide a valid email address' };
    }
    const phoneCandidates = buildPhoneCandidates(canonicalPhone.phonePrefix, canonicalPhone.phoneNumber);
    const [emailUser, phoneUser] = await Promise.all([
        normalizedEmail
            ? client_2.prisma.user.findUnique({
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
            })
            : Promise.resolve(null),
        phoneCandidates.length
            ? client_2.prisma.user.findFirst({
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
    let inviteContext = null;
    if (!user) {
        const temporaryPassword = crypto_1.default.randomBytes(9).toString('base64url');
        const passwordHash = await (0, password_1.hash)(temporaryPassword);
        const normalizedCountryCode = params.countryCode?.trim().toUpperCase() || null;
        const resolvedEmail = normalizedEmail || await ensureUniqueTempEmail(canonicalPhone.phoneNumber || 'member');
        user = await client_2.prisma.user.create({
            data: {
                email: resolvedEmail,
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
        await client_2.prisma.account.create({
            data: {
                userId: user.id,
                providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                accountId: resolvedEmail,
                password: passwordHash,
            },
        });
        if (normalizedEmail && !(0, sendEmail_1.isTemporaryEmailAddress)(resolvedEmail)) {
            inviteContext = {
                mode: 'TEMP_PASSWORD',
                email: normalizedEmail,
                companyName: company.name,
                companyId: company.id,
                temporaryPassword,
            };
        }
    }
    else {
        const updateData = {};
        const normalizedCountryCode = params.countryCode?.trim().toUpperCase() || null;
        if ((!user.name || (0, sendEmail_1.isTemporaryEmailAddress)(user.name)) && nameParts.displayName) {
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
        if (normalizedEmail && (0, sendEmail_1.isTemporaryEmailAddress)(user.email) && user.email !== normalizedEmail) {
            updateData.email = normalizedEmail;
        }
        if (Object.keys(updateData).length > 0) {
            user = await client_2.prisma.user.update({
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
        let credentialAccount = await client_2.prisma.account.findFirst({
            where: {
                userId: user.id,
                providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
            },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                accountId: true,
            },
        });
        const currentEmail = normalizeEmail(user.email);
        if (credentialAccount && currentEmail && credentialAccount.accountId !== currentEmail) {
            credentialAccount = await client_2.prisma.account.update({
                where: { id: credentialAccount.id },
                data: {
                    providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                    accountId: currentEmail,
                },
                select: {
                    id: true,
                    accountId: true,
                },
            });
        }
        if (!credentialAccount) {
            const temporaryPassword = crypto_1.default.randomBytes(9).toString('base64url');
            const passwordHash = await (0, password_1.hash)(temporaryPassword);
            await client_2.prisma.account.create({
                data: {
                    userId: user.id,
                    providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                    accountId: currentEmail || normalizedEmail || user.email,
                    password: passwordHash,
                },
            });
            await client_2.prisma.user.update({
                where: { id: user.id },
                data: {
                    must_change_password: true,
                },
            });
            if (currentEmail && !(0, sendEmail_1.isTemporaryEmailAddress)(currentEmail)) {
                inviteContext = {
                    mode: 'TEMP_PASSWORD',
                    email: currentEmail,
                    companyName: company.name,
                    companyId: company.id,
                    temporaryPassword,
                };
            }
        }
        else if (currentEmail && !(0, sendEmail_1.isTemporaryEmailAddress)(currentEmail)) {
            inviteContext = {
                mode: 'EXISTING_ACCOUNT',
                email: currentEmail,
                companyName: company.name,
                companyId: company.id,
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
async function sendCustomerPortalInvite(inviteContext) {
    if (inviteContext.mode === 'TEMP_PASSWORD') {
        return (0, sendEmail_1.sendCustomerPortalAccessEmail)({
            email: inviteContext.email,
            companyName: inviteContext.companyName,
            companyId: inviteContext.companyId,
            temporaryPassword: inviteContext.temporaryPassword,
        });
    }
    return (0, sendEmail_1.sendCustomerPortalAccessEmail)({
        email: inviteContext.email,
        companyName: inviteContext.companyName,
        companyId: inviteContext.companyId,
    });
}
