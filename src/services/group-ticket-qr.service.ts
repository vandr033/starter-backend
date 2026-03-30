import { createHmac, timingSafeEqual } from 'crypto';

const QR_TOKEN_VERSION = 1;
const QR_TOKEN_PREFIX = 'gr1';

interface TicketQrPayload {
    v: number;
    c: number;
    t: string;
    i: number;
}

type ResolveTicketCodeInput = {
    ticket_code?: string;
    qr_token?: string;
};

export type ResolveTicketCodeResult = {
    ok: boolean;
    ticketCode?: string;
    error?: string;
};

function getSigningSecret(): string {
    const configuredSecret = [
        process.env.GROUP_TICKET_QR_SECRET,
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
        throw new Error('GROUP_TICKET_QR_SECRET (or auth secret) must be configured in production');
    }

    return 'dev-group-ticket-secret-change-me';
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
    const mac = createHmac('sha256', getSigningSecret()).update(payloadB64).digest();
    return base64UrlEncode(mac);
}

function safeCompareSignature(actual: string, expected: string): boolean {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export function buildGroupTicketQrToken(companyId: number, ticketCode: string, issuedAt: Date): string {
    const payload: TicketQrPayload = {
        v: QR_TOKEN_VERSION,
        c: companyId,
        t: ticketCode,
        i: issuedAt.getTime(),
    };

    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signature = signPayload(payloadB64);

    return `${QR_TOKEN_PREFIX}.${payloadB64}.${signature}`;
}

/**
 * Build a publicly-accessible QR image URL for ticket delivery channels.
 * Defaults to QuickChart unless overridden by GROUP_TICKET_QR_IMAGE_BASE_URL.
 *
 * Example custom base: https://quickchart.io/qr?size=420&text=
 */
export function buildGroupTicketQrImageUrl(qrToken: string): string {
    const configuredBase = process.env.GROUP_TICKET_QR_IMAGE_BASE_URL?.trim();
    const fallbackBase = 'https://quickchart.io/qr?size=420&margin=1&ecLevel=M&text=';
    const base = configuredBase && configuredBase.length > 0 ? configuredBase : fallbackBase;
    const separator = base.includes('?') ? '' : '?text=';
    return `${base}${separator}${encodeURIComponent(qrToken)}`;
}

export function resolveTicketCodeFromScanInput(companyId: number, input: ResolveTicketCodeInput): ResolveTicketCodeResult {
    const rawToken = (input.qr_token ?? input.ticket_code ?? '').trim();
    if (!rawToken) {
        return { ok: false, error: 'Ticket code is required' };
    }

    // Backwards compatibility: allow plain ticket_code scans.
    if (!rawToken.startsWith(`${QR_TOKEN_PREFIX}.`)) {
        return { ok: true, ticketCode: rawToken };
    }

    const segments = rawToken.split('.');
    if (segments.length !== 3) {
        return { ok: false, error: 'Invalid QR token format' };
    }

    const [, payloadB64, signature] = segments;
    if (!payloadB64 || !signature) {
        return { ok: false, error: 'Invalid QR token' };
    }

    const expectedSignature = signPayload(payloadB64);
    if (!safeCompareSignature(signature, expectedSignature)) {
        return { ok: false, error: 'Invalid QR token signature' };
    }

    try {
        const payloadRaw = base64UrlDecode(payloadB64).toString('utf8');
        const payload = JSON.parse(payloadRaw) as Partial<TicketQrPayload>;

        if (payload.v !== QR_TOKEN_VERSION) {
            return { ok: false, error: 'Unsupported QR token version' };
        }
        if (typeof payload.c !== 'number' || payload.c !== companyId) {
            return { ok: false, error: 'QR token does not belong to this company' };
        }
        if (typeof payload.t !== 'string' || payload.t.trim().length === 0) {
            return { ok: false, error: 'QR token is missing ticket code' };
        }

        return { ok: true, ticketCode: payload.t.trim() };
    } catch {
        return { ok: false, error: 'QR token payload could not be decoded' };
    }
}
