import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { phoneNumber } from "better-auth/plugins";
import { prisma } from "../prisma/client";
import { sendWhatsappCode } from "../utils/whatsappSender";
import { profileEnd } from "console";
import { sendResetPasswordEmail } from "../utils/sendEmail";


export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "mysql" }),
  baseURL: process.env.BASE_URL || "http://localhost:3001",
  frontendURL: process.env.BASE_URL || "http://localhost:3000",
  trustedOrigins:[
    "http://localhost:3000",
    "http://localhost:3001",
    "https://bookinsite.com",
    "https://www.bookinsite.com",
    "https://bookinsite.com.ar",
    "https://www.bookinsite.com.ar",
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // We handle email verification ourselves via OTP flow
    sendResetPassword: async ({ user, url, token }, request) => {
      await sendResetPasswordEmail(user, url);
    },
    onPasswordReset: async ({user}, request) => {
      console.log(`password for ${user.email} reset `)
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
