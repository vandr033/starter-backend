import { prisma } from '../prisma/client';

export const PRICONPRI_BRAND = {
    name: 'Priconpri',
    primary: '#9f145b',
    primaryDark: '#6f0d40',
    accent: '#ec4899',
    ink: '#111827',
    muted: '#64748b',
    surface: '#fff7fb',
};

export interface NotificationBranding {
    companyId?: number;
    companyName?: string | null;
    companyLogoUrl?: string | null;
    companyPhonePrefix?: string | null;
    companyPhone?: string | null;
}

function getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getBackendBaseUrl(): string {
    return (
        process.env.API_PUBLIC_URL ||
        process.env.BACKEND_URL ||
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        getFrontendBaseUrl()
    ).replace(/\/$/, '');
}

function toAbsoluteUrl(url?: string | null): string | null {
    const clean = (url || '').trim();
    if (!clean) return null;
    if (/^https?:\/\//i.test(clean)) return clean;
    if (clean.startsWith('/')) return `${getBackendBaseUrl()}${clean}`;
    return `${getBackendBaseUrl()}/api/storage/${clean.replace(/^\/+/, '')}`;
}

export function getPriconpriLogoUrl(): string {
    return (
        process.env.PRICONPRI_LOGO_URL ||
        `${getFrontendBaseUrl()}/assets/priconpri/logo-horizontal-pink-outline.webp`
    );
}

export function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) return null;
    const cleanPrefix = (prefix || '591').replace(/\D/g, '');
    return `${cleanPrefix}${cleanPhone}`;
}

export function buildCompanyContactLine(branding?: NotificationBranding | null): string | null {
    const fullPhone = buildFullPhone(branding?.companyPhonePrefix, branding?.companyPhone);
    if (!fullPhone || !branding?.companyName) return null;
    return `Para mas informacion contactate con ${branding.companyName} aqui: wa.me/${fullPhone}`;
}

export function appendCompanyContactLine(text: string, branding?: NotificationBranding | null): string {
    const contactLine = buildCompanyContactLine(branding);
    if (!contactLine || text.includes(contactLine)) return text;
    return `${text.trim()}\n\n${contactLine}`;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export async function getCompanyNotificationBranding(companyId?: number | null): Promise<NotificationBranding | null> {
    if (!companyId) return null;

    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
            id: true,
            name: true,
            logo_url: true,
            phone_prefix: true,
            phone: true,
        },
    });

    if (!company) return null;

    return {
        companyId: company.id,
        companyName: company.name,
        companyLogoUrl: toAbsoluteUrl(company.logo_url),
        companyPhonePrefix: company.phone_prefix,
        companyPhone: company.phone,
    };
}

export function mergeBranding(base?: NotificationBranding | null, override?: NotificationBranding | null): NotificationBranding | null {
    if (!base && !override) return null;
    return {
        ...base,
        ...override,
        companyName: override?.companyName ?? base?.companyName,
        companyLogoUrl: toAbsoluteUrl(override?.companyLogoUrl ?? base?.companyLogoUrl),
        companyPhonePrefix: override?.companyPhonePrefix ?? base?.companyPhonePrefix,
        companyPhone: override?.companyPhone ?? base?.companyPhone,
    };
}

export function renderBrandedEmail(params: {
    title: string;
    bodyHtml: string;
    branding?: NotificationBranding | null;
    preheader?: string;
}): string {
    const priconpriLogo = getPriconpriLogoUrl();
    const companyLogo = toAbsoluteUrl(params.branding?.companyLogoUrl);
    const companyName = params.branding?.companyName || 'tu empresa';
    const contactLine = buildCompanyContactLine(params.branding);

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(params.title)}</title>
        </head>
        <body style="margin:0;padding:0;background:${PRICONPRI_BRAND.surface};font-family:Arial,sans-serif;color:${PRICONPRI_BRAND.ink};">
            ${params.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(params.preheader)}</div>` : ''}
            <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
                <div style="background:#ffffff;border:1px solid #f6c4dc;border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(159,20,91,0.10);">
                    <div style="padding:20px 24px;background:${PRICONPRI_BRAND.primary};">
                        <table role="presentation" style="width:100%;border-collapse:collapse;">
                            <tr>
                                <td style="vertical-align:middle;">
                                    <img src="${priconpriLogo}" alt="Priconpri" style="max-height:34px;max-width:160px;display:block;">
                                </td>
                                <td style="vertical-align:middle;text-align:right;color:#ffffff;font-size:13px;font-weight:700;">
                                    ${escapeHtml(companyName)}
                                </td>
                            </tr>
                        </table>
                    </div>
                    <div style="padding:22px 24px;border-bottom:1px solid #fce7f3;">
                        <table role="presentation" style="width:100%;border-collapse:collapse;">
                            <tr>
                                <td style="vertical-align:middle;">
                                    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${PRICONPRI_BRAND.primary};font-weight:700;">Priconpri x ${escapeHtml(companyName)}</div>
                                    <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;color:${PRICONPRI_BRAND.ink};">${escapeHtml(params.title)}</h1>
                                </td>
                                ${companyLogo ? `
                                    <td style="vertical-align:middle;text-align:right;width:72px;">
                                        <img src="${companyLogo}" alt="${escapeHtml(companyName)}" style="max-width:56px;max-height:56px;border-radius:12px;border:1px solid #fce7f3;object-fit:contain;">
                                    </td>
                                ` : ''}
                            </tr>
                        </table>
                    </div>
                    <div style="padding:24px;">
                        ${params.bodyHtml}
                        ${contactLine ? `
                            <div style="margin-top:24px;padding:14px 16px;background:#fdf2f8;border:1px solid #fbcfe8;border-radius:12px;color:${PRICONPRI_BRAND.primaryDark};font-size:14px;">
                                ${escapeHtml(contactLine)}
                            </div>
                        ` : ''}
                    </div>
                </div>
                <p style="text-align:center;margin:14px 0 0;color:${PRICONPRI_BRAND.muted};font-size:12px;">Powered by Priconpri</p>
            </div>
        </body>
        </html>
    `;
}
