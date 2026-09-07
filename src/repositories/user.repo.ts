import { prisma } from '../prisma/client';
import { canonicalizePhoneParts, normalizePhoneDigits } from '../utils/phoneNormalization';
import { BETTER_AUTH_CREDENTIAL_PROVIDER_ID } from '../config/auth-constants';

export function buildPhoneLookupCandidates(phoneNumber: string, phonePrefix?: string) {
  const canonicalPhone = canonicalizePhoneParts({ phonePrefix, phoneNumber });
  const rawDigits = normalizePhoneDigits(phoneNumber);

  return Array.from(
    new Set(
      [canonicalPhone.phoneNumber, canonicalPhone.fullPhone, rawDigits]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export const findActiveUserByPhone = async (params: {
  phoneNumber: string;
  phonePrefix?: string;
  excludeUserId?: string;
}) => {
  const phoneCandidates = buildPhoneLookupCandidates(params.phoneNumber, params.phonePrefix);
  if (phoneCandidates.length === 0) {
    return null;
  }

  return prisma.user.findFirst({
    where: {
      deleted_at: null,
      ...(params.excludeUserId ? { id: { not: params.excludeUserId } } : {}),
      phoneNumber: { in: phoneCandidates },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getUserByPhone = (phoneNumber: string, phonePrefix?: string) => {
  return findActiveUserByPhone({ phoneNumber, phonePrefix });
};

export const getUserByEmail = (email: string) =>
  prisma.user.findUnique({
    where: { email },
  });


export const getUserByPhoneOrEmail = (identifier: string) => {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  return prisma.user.findFirst({
    where: {
      OR: [
        { phoneNumber: normalizedIdentifier },
        { email: normalizedIdentifier },
      ],
    },
  });
}

export const verifyUserEmail = (id: string) => {
  return prisma.user.update({
    where: { id },
    data: { emailVerified: true },
  });
}

export const createUser = (
  name: string,
  email: string,
  first_name: string,
  last_name: string,
  phoneNumber: string,
  phone_prefix: string,
  country_code?: string,
) => {
  const canonicalPhone = canonicalizePhoneParts({ phonePrefix: phone_prefix, phoneNumber });
  return prisma.user.create({
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
}

export const getUserById = (id: string) => {
  return prisma.user.findUnique({
    where: { id },
  });
}

export const updateUserNames = (id: string, first_name: string, last_name?: string) => {
  const displayName = `${first_name ?? ""} ${last_name ?? ""}`.trim();
  return prisma.user.update({
    where: { id },
    data: {
      first_name,
      last_name: last_name ?? null,
      name: displayName || first_name,
    },
  });
}

export const updateUserPassword = async (userId: string, hashedPassword: string) => {
  // Update the password in Better Auth's account table
  return prisma.account.updateMany({
    where: {
      userId,
      providerId: BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
    },
    data: {
      password: hashedPassword,
    },
  });
}

export const updateUserEmail = (id: string, email: string) => {
  return prisma.user.update({
    where: { id },
    data: { email, emailVerified: true },
  });
}

export const updateUserPhone = async (
  id: string,
  phoneNumber: string,
  phone_prefix?: string,
  country_code?: string,
) => {
  const canonicalPhone = canonicalizePhoneParts({ phonePrefix: phone_prefix, phoneNumber });
  const nextPhone = canonicalPhone.phoneNumber || normalizePhoneDigits(phoneNumber) || null;
  const normalizedCountryCode = country_code?.trim().toUpperCase() || null;

  if (nextPhone) {
    const existingUser = await findActiveUserByPhone({
      phoneNumber,
      phonePrefix: phone_prefix,
      excludeUserId: id,
    });

    if (existingUser) {
      throw new Error('Phone number already in use');
    }
  }

  return prisma.user.update({
    where: { id },
    data: {
      phoneNumber: nextPhone,
      phoneNumberVerified: true,
      ...(canonicalPhone.phonePrefix ? { phone_prefix: canonicalPhone.phonePrefix } : {}),
      ...(normalizedCountryCode !== null ? { country_code: normalizedCountryCode } : {}),
    },
  });
}
