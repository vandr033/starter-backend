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

    const { first_name, last_name } = req.body;
    const result = await ProfileService.updateProfile(userId, { first_name, last_name });
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

    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ code: 400, message: "Phone number is required", error: true });

    const result = await ProfileService.sendPhoneChangeOtp(userId, phoneNumber);
    return res.status(result.code).json(result);
}

export async function verifyPhoneChange(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { phoneNumber, code, phone_prefix } = req.body;
    if (!phoneNumber || !code) return res.status(400).json({ code: 400, message: "Phone number and code are required", error: true });

    const result = await ProfileService.verifyPhoneChange(userId, phoneNumber, code, phone_prefix);
    return res.status(result.code).json(result);
}
