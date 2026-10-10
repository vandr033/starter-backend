"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OTP_RESEND_COOLDOWN_SECONDS = exports.PREREG_TTL_MINUTES = exports.OTP_TTL_MINUTES = exports.OTP_LENGTH = void 0;
exports.generateNumericCode = generateNumericCode;
exports.createPreRegToken = createPreRegToken;
exports.parsePreRegToken = parsePreRegToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
exports.OTP_LENGTH = 6;
exports.OTP_TTL_MINUTES = 5;
exports.PREREG_TTL_MINUTES = 30;
exports.OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || process.env.NEXT_PUBLIC_OTP_RESEND_COOLDOWN_SECONDS || '60');
function generateNumericCode(length = exports.OTP_LENGTH) {
    let code = "";
    for (let i = 0; i < length; i++) {
        code += Math.floor(Math.random() * 10).toString();
    }
    return code;
}
// ---------- Pre-reg JWT ----------
const preregSecret = process.env.CUSTOMER_PREREG_SECRET;
function createPreRegToken(payload) {
    const now = Date.now();
    const expiresAt = now + exports.PREREG_TTL_MINUTES * 60000;
    const token = jsonwebtoken_1.default.sign({
        type: "CUSTOMER_PREREG",
        purpose: "CUSTOMER_SIGNUP",
        channel: payload.channel,
        identifier: payload.identifier,
        createdAt: now,
        expiresAt,
    }, preregSecret, { expiresIn: `${exports.PREREG_TTL_MINUTES}m` });
    return token;
}
function parsePreRegToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, preregSecret);
        if (decoded.type !== "CUSTOMER_PREREG")
            return null;
        if (decoded.purpose !== "CUSTOMER_SIGNUP")
            return null;
        return decoded;
    }
    catch {
        return null;
    }
}
