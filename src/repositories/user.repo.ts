import { prisma } from '../prisma/client';
import { canonicalizePhoneParts } from '../utils/phoneNormalization';

export const getUserByPhone = (phoneNumber: string, phonePrefix: string) =>
  {
    const canonicalPhone = canonicalizePhoneParts({ phonePrefix, phoneNumber });
    return prisma.user.findUnique({
      where: {
        phoneNumber: canonicalPhone.phoneNumber || '',
        phone_prefix: canonicalPhone.phonePrefix || '',
      },
    });
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

export const createUser = (name: string, email: string, first_name: string, last_name: string, phoneNumber: string, phone_prefix: string) => {
  const canonicalPhone = canonicalizePhoneParts({ phonePrefix: phone_prefix, phoneNumber });
  return prisma.user.create({
    data: {
      name,
      email,
      first_name,
      last_name,
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
      providerId: "credential",
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

export const updateUserPhone = (id: string, phoneNumber: string, phone_prefix?: string) => {
  const canonicalPhone = canonicalizePhoneParts({ phonePrefix: phone_prefix, phoneNumber });
  return prisma.user.update({
    where: { id },
    data: {
      phoneNumber: canonicalPhone.phoneNumber || phoneNumber,
      phoneNumberVerified: true,
      ...(canonicalPhone.phonePrefix ? { phone_prefix: canonicalPhone.phonePrefix } : {}),
    },
  });
}
