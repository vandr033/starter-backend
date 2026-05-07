import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const STORAGE_DELETE_TOKEN_VERSION = 1;
const STORAGE_DELETE_TOKEN_PREFIX = 'sdt1';

type StorageDeleteTokenPayload = {
    v: number;
    p: string;
    iat: number;
    nonce: string;
};

function getStorageDeleteTokenSecret(): string {
    const configuredSecret = [
        process.env.STORAGE_DELETE_TOKEN_SECRET,
        process.env.BETTER_AUTH_SECRET,
        process.env.JWT_SECRET,
        process.env.AUTH_SECRET,
        process.env.SESSION_SECRET,
    ]
        .map((value) => value?.trim())
        .find((value) => Boolean(value));

    if (configuredSecret) {
        return configuredSecret;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('STORAGE_DELETE_TOKEN_SECRET (or auth secret) must be configured in production');
    }

    return 'dev-storage-delete-token-secret-change-me';
}

function base64UrlEncode(input: string | Buffer): string {
    const source = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return source.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const remainder = padded.length % 4;
    const withPadding = remainder === 0 ? padded : `${padded}${'='.repeat(4 - remainder)}`;
    return Buffer.from(withPadding, 'base64');
}

function signPayload(payloadB64: string): string {
    const mac = createHmac('sha256', getStorageDeleteTokenSecret()).update(payloadB64).digest();
    return base64UrlEncode(mac);
}

function safeCompareSignature(actual: string, expected: string): boolean {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export function buildStorageDeleteToken(relativePath: string): string {
    const payload: StorageDeleteTokenPayload = {
        v: STORAGE_DELETE_TOKEN_VERSION,
        p: relativePath,
        iat: Date.now(),
        nonce: randomBytes(10).toString('base64url'),
    };

    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    return `${STORAGE_DELETE_TOKEN_PREFIX}.${payloadB64}.${signPayload(payloadB64)}`;
}

export function verifyStorageDeleteToken(token: string, relativePath: string): boolean {
    const rawToken = token.trim();
    if (!rawToken.startsWith(`${STORAGE_DELETE_TOKEN_PREFIX}.`)) {
        return false;
    }

    const segments = rawToken.split('.');
    if (segments.length !== 3) {
        return false;
    }

    const [, payloadB64, signature] = segments;
    if (!payloadB64 || !signature) {
        return false;
    }

    const expectedSignature = signPayload(payloadB64);
    if (!safeCompareSignature(signature, expectedSignature)) {
        return false;
    }

    try {
        const payloadRaw = base64UrlDecode(payloadB64).toString('utf8');
        const payload = JSON.parse(payloadRaw) as Partial<StorageDeleteTokenPayload>;

        return (
            payload.v === STORAGE_DELETE_TOKEN_VERSION &&
            typeof payload.p === 'string' &&
            payload.p === relativePath
        );
    } catch {
        return false;
    }
}
