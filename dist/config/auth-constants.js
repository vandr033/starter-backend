"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS = exports.BETTER_AUTH_CREDENTIAL_PROVIDER_ID = void 0;
/**
 * Better Auth's email/password adapter stores credential accounts under the
 * singular provider id. Keep the legacy plural value readable so existing
 * accounts can be normalized during ordinary account flows.
 */
exports.BETTER_AUTH_CREDENTIAL_PROVIDER_ID = 'credential';
exports.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS = [
    exports.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
    'credentials',
];
