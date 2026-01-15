import { prisma } from '../prisma/client';

export const getUserByPhone = (phoneNumber: string, phonePrefix: string) =>
  prisma.user.findUnique({
    where: { phoneNumber, phone_prefix: phonePrefix },
  });

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

  export const createUser = (name:string, email:string, first_name:string, last_name:string, phoneNumber:string, phone_prefix:string) => {
    return prisma.user.create({
      data: {
        name,
        email,
        first_name,
        last_name,
        phoneNumber,
        phone_prefix,
      },
    });
  }