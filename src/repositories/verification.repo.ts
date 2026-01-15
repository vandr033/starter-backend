import { prisma, Prisma } from "../prisma/client";
import { VerificationChannel, VerificationPurpose } from "@prisma/client";
export const createVerification = (data: Prisma.VerificationCodeCreateInput) => {
    return prisma.verificationCode.create({
        data,
    })
}

export const getVerificationCode = (channel: VerificationChannel, purpose: VerificationPurpose, identifier: string) => {
    return prisma.verificationCode.findFirst({
        where: {
            channel,
            purpose,
            identifier,
            consumed_at: null,
            expires_at: { gt: new Date() },
        },
        orderBy: { created_at: "desc" },
    })
}

export const updateVerificationCode = (id: number, data: Prisma.VerificationCodeUpdateInput) => {
    return prisma.verificationCode.update({
        where: { id },
        data,
    })
}