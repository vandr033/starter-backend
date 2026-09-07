/**
 * Better Auth's email/password adapter stores credential accounts under the
 * singular provider id. Keep the legacy plural value readable so existing
 * accounts can be normalized during ordinary account flows.
 */
export const BETTER_AUTH_CREDENTIAL_PROVIDER_ID = 'credential' as const;

export const BETTER_AUTH_CREDENTIAL_PROVIDER_IDS = [
    BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
    'credentials',
] as const;
