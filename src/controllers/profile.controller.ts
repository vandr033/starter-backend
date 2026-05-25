import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middlewares/requireAuth";
import * as ProfileService from "../services/profile.service";

export async function getProfile(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await ProfileService.getProfile(userId);
    return res.status(result.code).json(result);
}

export async function updateProfile(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

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

export async function sendEmailChangeOtp(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { email } = req.body;
    if (!email) return res.status(400).json({ code: 400, message: "Email is required", error: true });

    const result = await ProfileService.sendEmailChangeOtp(userId, email);
    return res.status(result.code).json(result);
}

export async function verifyEmailChange(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ code: 400, message: "Email and code are required", error: true });

    const result = await ProfileService.verifyEmailChange(userId, email, code);
    return res.status(result.code).json(result);
}

export async function sendPhoneChangeOtp(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const phoneNumber = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber : "";
    const phonePrefix =
        typeof req.body?.phonePrefix === "string"
            ? req.body.phonePrefix
            : typeof req.body?.phone_prefix === "string"
                ? req.body.phone_prefix
                : "";
    const countryCode =
        typeof req.body?.countryCode === "string"
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

export async function verifyPhoneChange(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const phoneNumber = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber : "";
    const phonePrefix =
        typeof req.body?.phonePrefix === "string"
            ? req.body.phonePrefix
            : typeof req.body?.phone_prefix === "string"
                ? req.body.phone_prefix
                : "";
    const countryCode =
        typeof req.body?.countryCode === "string"
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
