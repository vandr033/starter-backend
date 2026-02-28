export const VerificationChannel = {
  EMAIL: "EMAIL",
  WHATSAPP: "WHATSAPP",
} as const;

export type VerificationChannel =
  (typeof VerificationChannel)[keyof typeof VerificationChannel];

export const VerificationPurpose = {
  CUSTOMER_SIGNUP: "CUSTOMER_SIGNUP",
  LOGIN: "LOGIN",
  PROFILE_UPDATE: "PROFILE_UPDATE",
  STAFF_INVITE: "STAFF_INVITE",
} as const;

export type VerificationPurpose =
  (typeof VerificationPurpose)[keyof typeof VerificationPurpose];
