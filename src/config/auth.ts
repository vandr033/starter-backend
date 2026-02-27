import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { phoneNumber } from "better-auth/plugins";
import { prisma } from "../prisma/client";
import { sendWhatsappCode } from "../utils/whatsappSender";
import { sendResetPasswordEmail } from "../utils/sendEmail";
import bcrypt from "bcryptjs";


export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "mysql" }),
  baseURL: process.env.BASE_URL || "http://localhost:3001",
  frontendURL: process.env.BASE_URL || "http://localhost:3000",
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://bookinsite.com",
    "https://www.bookinsite.com",
    "https://bookinsite.com.ar",
    "https://www.bookinsite.com.ar",
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60, // 1 hour
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // We handle email verification ourselves via OTP flow
    // Use bcrypt for password hashing to match seed file
    password: {
      hash: async (password: string) => {
        return bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        return bcrypt.compare(password, hash);
      },
    },
    sendResetPassword: async ({ user, url, token }, request) => {
      await sendResetPasswordEmail(user, url);
    },
    onPasswordReset: async ({ user }, request) => {
    }
  },
  appName: "BookInSite",
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300, // 5 min
      allowedAttempts: 3,
      sendOTP: async ({ phoneNumber, code }, ctx) => {
        await sendWhatsappCode(phoneNumber, code);
      },
      // Let phone-only customers sign up purely by verifying OTP.
      signUpOnVerification: {
        getTempEmail: (phoneNumber) => {
          const digits = phoneNumber.replace(/[^\d]/g, "");
          return `${digits}@temp.bookinsite.com`;
        },
        getTempName: (phoneNumber) => phoneNumber,
      },
      requireVerification: true,
    }),
  ],
});
