"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuth = getAuth;
const client_1 = require("../prisma/client");
const whatsappSender_1 = require("../utils/whatsappSender");
const sendEmail_1 = require("../utils/sendEmail");
const importEsm_1 = require("../utils/importEsm");
const crypto_1 = require("crypto");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
let authPromise = null;
const SESSION_USER_AGENT_MAX_LENGTH = 191;
function clampSessionUserAgent(userAgent) {
    if (typeof userAgent !== "string")
        return userAgent;
    if (userAgent.length <= SESSION_USER_AGENT_MAX_LENGTH)
        return userAgent;
    return userAgent.slice(0, SESSION_USER_AGENT_MAX_LENGTH);
}
function parseOriginList(value) {
    if (!value)
        return [];
    return value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
}
function buildTrustedOrigins() {
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
    return Array.from(new Set([...defaults, ...configured]
        .map((origin) => origin?.trim())
        .filter((origin) => Boolean(origin))));
}
async function createAuth() {
    const globalAny = globalThis;
    if (!globalAny.crypto && crypto_1.webcrypto) {
        globalAny.crypto = crypto_1.webcrypto;
    }
    const [{ betterAuth }, { prismaAdapter }, { phoneNumber }] = await Promise.all([
        (0, importEsm_1.importEsm)("better-auth"),
        (0, importEsm_1.importEsm)("better-auth/adapters/prisma"),
        (0, importEsm_1.importEsm)("better-auth/plugins"),
    ]);
    return betterAuth({
        database: prismaAdapter(client_1.prisma, { provider: "mysql" }),
        databaseHooks: {
            session: {
                create: {
                    before: async (session) => ({
                        data: {
                            ...session,
                            userAgent: clampSessionUserAgent(session.userAgent),
                        },
                    }),
                },
                update: {
                    before: async (session) => ({
                        data: {
                            ...session,
                            userAgent: clampSessionUserAgent(session.userAgent),
                        },
                    }),
                },
            },
        },
        baseURL: process.env.BASE_URL || "http://localhost:3001",
        frontendURL: process.env.FRONTEND_URL ||
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
                hash: async (password) => {
                    return bcryptjs_1.default.hash(password, 10);
                },
                verify: async ({ hash, password }) => {
                    return bcryptjs_1.default.compare(password, hash);
                },
            },
            sendResetPassword: async ({ user, url }) => {
                await (0, sendEmail_1.sendResetPasswordEmail)(user, url);
            },
            onPasswordReset: async () => { },
        },
        appName: "PriconPri",
        plugins: [
            phoneNumber({
                otpLength: 6,
                expiresIn: 300,
                allowedAttempts: 3,
                sendOTP: async ({ phoneNumber, code }) => {
                    const result = await (0, whatsappSender_1.queueWhatsappCode)(phoneNumber, code, {
                        sourceType: 'BETTER_AUTH_PHONE_OTP',
                        sourceId: phoneNumber,
                        expiresAt: new Date(Date.now() + 300000),
                    });
                    if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
                        throw new Error('WhatsApp OTP delivery is unavailable');
                    }
                },
                signUpOnVerification: {
                    getTempEmail: (phoneNumber) => {
                        const digits = phoneNumber.replace(/[^\d]/g, "");
                        return `${digits}@tmppriconpri.com`;
                    },
                    getTempName: (phoneNumber) => phoneNumber,
                },
                requireVerification: true,
            }),
        ],
    });
}
async function getAuth() {
    if (!authPromise) {
        authPromise = createAuth();
    }
    return authPromise;
}
