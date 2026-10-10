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
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.sendEmailChangeOtp = sendEmailChangeOtp;
exports.verifyEmailChange = verifyEmailChange;
exports.sendPhoneChangeOtp = sendPhoneChangeOtp;
exports.verifyPhoneChange = verifyPhoneChange;
const ProfileService = __importStar(require("../services/profile.service"));
async function getProfile(req, res) {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const result = await ProfileService.getProfile(userId);
    return res.status(result.code).json(result);
}
async function updateProfile(req, res) {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const { first_name, last_name, phone_prefix, phonePrefix, country_code, countryCode, phoneNumber } = req.body;
    const result = await ProfileService.updateProfile(userId, {
        first_name,
        last_name,
        country_code: countryCode ?? country_code,
        phone_prefix: phonePrefix ?? phone_prefix,
        phoneNumber,
    });
    return res.status(result.code).json(result);
}
async function sendEmailChangeOtp(req, res) {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const { email } = req.body;
    if (!email)
        return res.status(400).json({ code: 400, message: "Email is required", error: true });
    const result = await ProfileService.sendEmailChangeOtp(userId, email);
    return res.status(result.code).json(result);
}
async function verifyEmailChange(req, res) {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const { email, code } = req.body;
    if (!email || !code)
        return res.status(400).json({ code: 400, message: "Email and code are required", error: true });
    const result = await ProfileService.verifyEmailChange(userId, email, code);
    return res.status(result.code).json(result);
}
async function sendPhoneChangeOtp(req, res) {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const phoneNumber = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber : "";
    const phonePrefix = typeof req.body?.phonePrefix === "string"
        ? req.body.phonePrefix
        : typeof req.body?.phone_prefix === "string"
            ? req.body.phone_prefix
            : "";
    const countryCode = typeof req.body?.countryCode === "string"
        ? req.body.countryCode
        : typeof req.body?.country_code === "string"
            ? req.body.country_code
            : undefined;
    if (!phoneNumber || !phonePrefix) {
        return res.status(400).json({ code: 400, message: "Phone number and prefix are required", error: true });
    }
    const result = await ProfileService.sendPhoneChangeOtp(userId, { phoneNumber, phonePrefix, countryCode });
    return res.status(result.code).json(result);
}
async function verifyPhoneChange(req, res) {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    const phoneNumber = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber : "";
    const phonePrefix = typeof req.body?.phonePrefix === "string"
        ? req.body.phonePrefix
        : typeof req.body?.phone_prefix === "string"
            ? req.body.phone_prefix
            : "";
    const countryCode = typeof req.body?.countryCode === "string"
        ? req.body.countryCode
        : typeof req.body?.country_code === "string"
            ? req.body.country_code
            : undefined;
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!phoneNumber || !phonePrefix || !code) {
        return res.status(400).json({ code: 400, message: "Phone number, prefix and code are required", error: true });
    }
    const result = await ProfileService.verifyPhoneChange(userId, { phoneNumber, phonePrefix, countryCode }, code);
    return res.status(result.code).json(result);
}
