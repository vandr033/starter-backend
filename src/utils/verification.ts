import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma/client";
import { VerificationChannel, VerificationPurpose } from "@prisma/client";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const PREREG_TTL_MINUTES = 30;

export function generateNumericCode(length = OTP_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}


// ---------- Pre-reg JWT ----------

const preregSecret = process.env.CUSTOMER_PREREG_SECRET!;

export function createPreRegToken(payload: {
  channel: "WHATSAPP" | "EMAIL";
  identifier: string;
}) {
  const now = Date.now();
  const expiresAt = now + PREREG_TTL_MINUTES * 60_000;

  const token = jwt.sign(
    {
      type: "CUSTOMER_PREREG",
      purpose: "CUSTOMER_SIGNUP",
      channel: payload.channel,
      identifier: payload.identifier,
      createdAt: now,
      expiresAt,
    },
    preregSecret,
    { expiresIn: `${PREREG_TTL_MINUTES}m` },
  );

  return token;
}

export function parsePreRegToken(token: string) {
  try {
    const decoded = jwt.verify(token, preregSecret) as any;
    if (decoded.type !== "CUSTOMER_PREREG") return null;
    if (decoded.purpose !== "CUSTOMER_SIGNUP") return null;
    return decoded as {
      type: "CUSTOMER_PREREG";
      purpose: "CUSTOMER_SIGNUP";
      channel: "WHATSAPP" | "EMAIL";
      identifier: string;
      createdAt: number;
      expiresAt: number;
    };
  } catch {
    return null;
  }
}
