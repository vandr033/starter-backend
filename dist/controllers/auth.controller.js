"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerificationCodeEmail = sendVerificationCodeEmail;
exports.verifyVerificationCodeEmail = verifyVerificationCodeEmail;
exports.completeCustomerRegistrationEmail = completeCustomerRegistrationEmail;
exports.sendLoginOtpEmail = sendLoginOtpEmail;
exports.verifyLoginOtpEmail = verifyLoginOtpEmail;
exports.sendLoginOtpPhone = sendLoginOtpPhone;
exports.verifyLoginOtpPhone = verifyLoginOtpPhone;
exports.completePhoneProfile = completePhoneProfile;
const AuthService = __importStar(require("../services/auth.service"));
const UserRepo = __importStar(require("../repositories/user.repo"));
const verification_1 = require("../utils/verification");
let mensaje;
// ── Email registration (signup) ──
async function sendVerificationCodeEmail(req, res) {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ code: 400, message: "Email is required", error: true });
    }
    const result = await AuthService.sendVerificationCodeEmail(email);
    return res.status(result.code).json(result);
}
async function verifyVerificationCodeEmail(req, res) {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ code: 400, message: "Email and code are required", error: true });
    }
    const result = await AuthService.verifyVerificationCodeEmail(email, code, req.headers);
    if (Array.isArray(result?.data?.cookies) && result.data.cookies.length > 0) {
        res.setHeader("set-cookie", result.data.cookies);
        delete result.data.cookies;
    }
    return res.status(result.code).json(result);
}
async function completeCustomerRegistrationEmail(req, res) {
    const { preRegToken, email, first_name, last_name } = req.body;
    if (!preRegToken || !first_name || !email) {
        return res.status(400).json({ code: 400, message: "Missing required fields", error: true });
    }
    const prereg = (0, verification_1.parsePreRegToken)(preRegToken);
    if (!prereg || prereg.channel !== "EMAIL") {
        return res.status(400).json({
            code: 400,
            message: "Invalid or expired pre-registration token",
            error: true,
        });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== prereg.identifier) {
        return res.status(400).json({
            code: 400,
            message: "Email does not match the verified one",
            error: true,
        });
    }
    const result = await AuthService.completeCustomerRegistrationEmail(preRegToken, email, first_name, last_name, req.headers);
    if (Array.isArray(result?.data?.cookies) && result.data.cookies.length > 0) {
        res.setHeader("set-cookie", result.data.cookies);
        delete result.data.cookies;
    }
    return res.status(result.code).json(result);
}
// ── Email login (OTP) — clients only ──
async function sendLoginOtpEmail(req, res) {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ code: 400, message: "Email is required", error: true });
    }
    const result = await AuthService.sendLoginOtpEmail(email);
    return res.status(result.code).json(result);
}
async function verifyLoginOtpEmail(req, res) {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ code: 400, message: "Email and code are required", error: true });
    }
    const result = await AuthService.verifyLoginOtpEmail(email, code, req.headers);
    if (Array.isArray(result?.data?.cookies) && result.data.cookies.length > 0) {
        res.setHeader("set-cookie", result.data.cookies);
        delete result.data.cookies;
    }
    return res.status(result.code).json(result);
}
// ── Phone login (OTP) — clients only ──
async function sendLoginOtpPhone(req, res) {
    const { phoneNumber, phonePrefix, countryCode } = req.body;
    if (!phoneNumber || !phonePrefix) {
        return res.status(400).json({ code: 400, message: "Phone number and prefix are required", error: true });
    }
    const result = await AuthService.sendLoginOtpPhone({ phoneNumber, phonePrefix, countryCode });
    return res.status(result.code).json(result);
}
async function verifyLoginOtpPhone(req, res) {
    const { phoneNumber, phonePrefix, countryCode, code } = req.body;
    if (!phoneNumber || !phonePrefix || !code) {
        return res.status(400).json({ code: 400, message: "Phone number, prefix and code are required", error: true });
    }
    const result = await AuthService.verifyLoginOtpPhone({ phoneNumber, phonePrefix, countryCode }, code, req.headers);
    if (Array.isArray(result?.data?.cookies) && result.data.cookies.length > 0) {
        res.setHeader("set-cookie", result.data.cookies);
        delete result.data.cookies;
    }
    return res.status(result.code).json(result);
}
// ── Complete phone profile (set name after phone OTP registration) ──
async function completePhoneProfile(req, res) {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const { first_name, last_name, phoneNumber, phonePrefix, phone_prefix, countryCode, country_code, } = req.body;
    if (!first_name) {
        return res.status(400).json({ code: 400, message: "First name is required", error: true });
    }
    try {
        await UserRepo.updateUserNames(userId, first_name, last_name);
        const resolvedPhonePrefix = typeof phonePrefix === "string"
            ? phonePrefix
            : typeof phone_prefix === "string"
                ? phone_prefix
                : "";
        const resolvedCountryCode = typeof countryCode === "string"
            ? countryCode
            : typeof country_code === "string"
                ? country_code
                : undefined;
        if (resolvedPhonePrefix) {
            await UserRepo.updateUserPhone(userId, typeof phoneNumber === 'string' ? phoneNumber : (authReq.authUser.phoneNumber || ''), resolvedPhonePrefix, resolvedCountryCode);
        }
        return res.status(200).json({
            code: 200,
            message: "Profile completed successfully",
            error: false,
        });
    }
    catch (error) {
        if (error?.code === 'P2002' || String(error?.message || '').includes('Phone number already in use')) {
            return res.status(400).json({
                code: 400,
                message: "Phone number already in use",
                error: true,
            });
        }
        return res.status(500).json({
            code: 500,
            message: "Error completing profile",
            error: true,
            technicalMessage: error?.message,
        });
    }
}
