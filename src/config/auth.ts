import { prisma } from "../prisma/client";
import { sendWhatsappCode } from "../utils/whatsappSender";
import { sendResetPasswordEmail } from "../utils/sendEmail";
import { importEsm } from "../utils/importEsm";
import { webcrypto as nodeWebCrypto } from "crypto";
import bcrypt from "bcryptjs";

let authPromise: Promise<any> | null = null;

async function createAuth() {
  const globalAny = globalThis as any;
  if (!globalAny.crypto && nodeWebCrypto) {
    globalAny.crypto = nodeWebCrypto;
  }

  const [{ betterAuth }, { prismaAdapter }, { phoneNumber }] = await Promise.all([
    importEsm<any>("better-auth"),
    importEsm<any>("better-auth/adapters/prisma"),
    importEsm<any>("better-auth/plugins"),
  ]);

  return betterAuth({
    database: prismaAdapter(prisma, { provider: "mysql" }),
    baseURL: process.env.BASE_URL || "http://localhost:3001",
    frontendURL: process.env.BASE_URL || "http://localhost:3000",
    trustedOrigins: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://g0kc8cgg40oso4c800s8ks80.89.167.82.92.sslip.io",
      "http://ow0ggc084gkkk844s4s8gow8.89.167.82.92.sslip.io",
      "https://bookinsite.com",
      "https://www.bookinsite.com",
      "https://bookinsite.com.ar",
      "https://www.bookinsite.com.ar",
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      password: {
        hash: async (password: string) => {
          return bcrypt.hash(password, 10);
        },
        verify: async ({ hash, password }: { hash: string; password: string }) => {
          return bcrypt.compare(password, hash);
        },
      },
      sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
        await sendResetPasswordEmail(user, url);
      },
      onPasswordReset: async () => {},
    },
    appName: "BookInSite",
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        sendOTP: async ({ phoneNumber, code }: { phoneNumber: string; code: string }) => {
          await sendWhatsappCode(phoneNumber, code);
        },
        signUpOnVerification: {
          getTempEmail: (phoneNumber: string) => {
            const digits = phoneNumber.replace(/[^\d]/g, "");
            return `${digits}@temp.bookinsite.com`;
          },
          getTempName: (phoneNumber: string) => phoneNumber,
        },
        requireVerification: true,
      }),
    ],
  });
}

export async function getAuth() {
  if (!authPromise) {
    authPromise = createAuth();
  }
  return authPromise;
}
