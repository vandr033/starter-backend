import { prisma } from "../prisma/client";
import { isWhatsappEnqueueAccepted, queueWhatsappCode } from "../utils/whatsappSender";
import { sendResetPasswordEmail } from "../utils/sendEmail";
import { importEsm } from "../utils/importEsm";
import { webcrypto as nodeWebCrypto } from "crypto";
import bcrypt from "bcryptjs";

let authPromise: Promise<any> | null = null;
const SESSION_USER_AGENT_MAX_LENGTH = 191;
type SessionHookInput = Record<string, unknown> & {
  userAgent?: string | null;
};

function clampSessionUserAgent(
  userAgent: string | null | undefined,
): string | null | undefined {
  if (typeof userAgent !== "string") return userAgent;
  if (userAgent.length <= SESSION_USER_AGENT_MAX_LENGTH) return userAgent;
  return userAgent.slice(0, SESSION_USER_AGENT_MAX_LENGTH);
}

function parseOriginList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function buildTrustedOrigins(): string[] {
  const defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://g0kc8cgg40oso4c800s8ks80.89.167.82.92.sslip.io",
    "http://ow0ggc084gkkk844s4s8gow8.89.167.82.92.sslip.io",
    "https://priconpri.com",
    "https://www.priconpri.com",
  ];

  const configured = [
    process.env.FRONTEND_URL,
    process.env.NEXT_PUBLIC_FRONTEND_URL,
    ...parseOriginList(process.env.TRUSTED_ORIGINS),
    ...parseOriginList(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
  ];

  return Array.from(
    new Set(
      [...defaults, ...configured]
        .map((origin) => origin?.trim())
        .filter((origin): origin is string => Boolean(origin)),
    ),
  );
}

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
    databaseHooks: {
      session: {
        create: {
          before: async (session: SessionHookInput) => ({
            data: {
              ...session,
              userAgent: clampSessionUserAgent(session.userAgent),
            },
          }),
        },
        update: {
          before: async (session: SessionHookInput) => ({
            data: {
              ...session,
              userAgent: clampSessionUserAgent(session.userAgent),
            },
          }),
        },
      },
    },
    baseURL: process.env.BASE_URL || "http://localhost:3001",
    frontendURL:
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_FRONTEND_URL ||
      "http://localhost:3000",
    trustedOrigins: buildTrustedOrigins(),
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
    appName: "PriconPri",
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        sendOTP: async ({ phoneNumber, code }: { phoneNumber: string; code: string }) => {
          const result = await queueWhatsappCode(phoneNumber, code, {
            sourceType: 'BETTER_AUTH_PHONE_OTP',
            sourceId: phoneNumber,
            expiresAt: new Date(Date.now() + 300_000),
          });
          if (!isWhatsappEnqueueAccepted(result)) {
            throw new Error('WhatsApp OTP delivery is unavailable');
          }
        },
        signUpOnVerification: {
          getTempEmail: (phoneNumber: string) => {
            const digits = phoneNumber.replace(/[^\d]/g, "");
            return `${digits}@tmppriconpri.com`;
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
