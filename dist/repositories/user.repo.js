"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserPhone = exports.updateUserEmail = exports.updateUserPassword = exports.updateUserNames = exports.getUserById = exports.createUser = exports.verifyUserEmail = exports.getUserByPhoneOrEmail = exports.getUserByEmail = exports.getUserByPhone = exports.findActiveUserByPhone = void 0;
exports.buildPhoneLookupCandidates = buildPhoneLookupCandidates;
const client_1 = require("../prisma/client");
const phoneNormalization_1 = require("../utils/phoneNormalization");
const auth_constants_1 = require("../config/auth-constants");
function buildPhoneLookupCandidates(phoneNumber, phonePrefix) {
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({ phonePrefix, phoneNumber });
    const rawDigits = (0, phoneNormalization_1.normalizePhoneDigits)(phoneNumber);
    return Array.from(new Set([canonicalPhone.phoneNumber, canonicalPhone.fullPhone, rawDigits]
        .map((value) => value?.trim())
        .filter((value) => Boolean(value))));
}
const findActiveUserByPhone = async (params) => {
    const phoneCandidates = buildPhoneLookupCandidates(params.phoneNumber, params.phonePrefix);
    if (phoneCandidates.length === 0) {
        return null;
    }
    return client_1.prisma.user.findFirst({
        where: {
            deleted_at: null,
            ...(params.excludeUserId ? { id: { not: params.excludeUserId } } : {}),
            phoneNumber: { in: phoneCandidates },
        },
        orderBy: { createdAt: 'desc' },
    });
};
exports.findActiveUserByPhone = findActiveUserByPhone;
const getUserByPhone = (phoneNumber, phonePrefix) => {
    return (0, exports.findActiveUserByPhone)({ phoneNumber, phonePrefix });
};
exports.getUserByPhone = getUserByPhone;
const getUserByEmail = (email) => client_1.prisma.user.findUnique({
    where: { email },
});
exports.getUserByEmail = getUserByEmail;
const getUserByPhoneOrEmail = (identifier) => {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    return client_1.prisma.user.findFirst({
        where: {
            OR: [
                { phoneNumber: normalizedIdentifier },
                { email: normalizedIdentifier },
            ],
        },
    });
};
exports.getUserByPhoneOrEmail = getUserByPhoneOrEmail;
const verifyUserEmail = (id) => {
    return client_1.prisma.user.update({
        where: { id },
        data: { emailVerified: true },
    });
};
exports.verifyUserEmail = verifyUserEmail;
const createUser = (name, email, first_name, last_name, phoneNumber, phone_prefix, country_code) => {
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({ phonePrefix: phone_prefix, phoneNumber });
    return client_1.prisma.user.create({
        data: {
            name,
            email,
            first_name,
            last_name,
            ...(country_code?.trim() ? { country_code: country_code.trim().toUpperCase() } : {}),
            phoneNumber: canonicalPhone.phoneNumber || phoneNumber,
            phone_prefix: canonicalPhone.phonePrefix || phone_prefix,
        },
    });
};
exports.createUser = createUser;
const getUserById = (id) => {
    return client_1.prisma.user.findUnique({
        where: { id },
    });
};
exports.getUserById = getUserById;
const updateUserNames = (id, first_name, last_name) => {
    const displayName = `${first_name ?? ""} ${last_name ?? ""}`.trim();
    return client_1.prisma.user.update({
        where: { id },
        data: {
            first_name,
            last_name: last_name ?? null,
            name: displayName || first_name,
        },
    });
};
exports.updateUserNames = updateUserNames;
const updateUserPassword = async (userId, hashedPassword) => {
    // Update the password in Better Auth's account table
    return client_1.prisma.account.updateMany({
        where: {
            userId,
            providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
        },
        data: {
            password: hashedPassword,
        },
    });
};
exports.updateUserPassword = updateUserPassword;
const updateUserEmail = (id, email) => {
    return client_1.prisma.user.update({
        where: { id },
        data: { email, emailVerified: true },
    });
};
exports.updateUserEmail = updateUserEmail;
const updateUserPhone = async (id, phoneNumber, phone_prefix, country_code) => {
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({ phonePrefix: phone_prefix, phoneNumber });
    const nextPhone = canonicalPhone.phoneNumber || (0, phoneNormalization_1.normalizePhoneDigits)(phoneNumber) || null;
    const normalizedCountryCode = country_code?.trim().toUpperCase() || null;
    if (nextPhone) {
        const existingUser = await (0, exports.findActiveUserByPhone)({
            phoneNumber,
            phonePrefix: phone_prefix,
            excludeUserId: id,
        });
        if (existingUser) {
            throw new Error('Phone number already in use');
        }
    }
    return client_1.prisma.user.update({
        where: { id },
        data: {
            phoneNumber: nextPhone,
            phoneNumberVerified: true,
            ...(canonicalPhone.phonePrefix ? { phone_prefix: canonicalPhone.phonePrefix } : {}),
            ...(normalizedCountryCode !== null ? { country_code: normalizedCountryCode } : {}),
        },
    });
};
exports.updateUserPhone = updateUserPhone;
