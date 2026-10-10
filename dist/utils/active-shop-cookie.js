"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVE_COMPANY_COOKIE_NAME = void 0;
exports.getActiveCompanyIdFromRequest = getActiveCompanyIdFromRequest;
exports.getActiveCompanyCookieState = getActiveCompanyCookieState;
exports.setActiveCompanyCookie = setActiveCompanyCookie;
exports.clearActiveCompanyCookie = clearActiveCompanyCookie;
exports.ACTIVE_COMPANY_COOKIE_NAME = 'active_company_id';
function parseCookieHeader(cookieHeader) {
    if (!cookieHeader)
        return {};
    return cookieHeader.split(';').reduce((acc, part) => {
        const index = part.indexOf('=');
        if (index <= 0)
            return acc;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!key)
            return acc;
        try {
            acc[key] = decodeURIComponent(value);
        }
        catch {
            acc[key] = value;
        }
        return acc;
    }, {});
}
function getActiveCompanyIdFromRequest(req) {
    return getActiveCompanyCookieState(req).companyId;
}
/**
 * Restaurant routes must distinguish an omitted context from a malformed one.
 * The legacy helper intentionally collapses both cases to null for modules that
 * still support their historical fallback behavior.
 */
function getActiveCompanyCookieState(req) {
    const cookieHeader = typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined;
    const cookies = parseCookieHeader(cookieHeader);
    const raw = cookies[exports.ACTIVE_COMPANY_COOKIE_NAME];
    if (!raw)
        return { present: false, companyId: null, invalid: false };
    if (!/^\d+$/.test(raw))
        return { present: true, companyId: null, invalid: true };
    const parsed = Number.parseInt(raw, 10);
    return { present: true, companyId: Number.isInteger(parsed) && parsed > 0 ? parsed : null, invalid: !(Number.isInteger(parsed) && parsed > 0) };
}
function getCookieSettings() {
    const isProduction = process.env.NODE_ENV === 'production';
    const sameSite = isProduction ? 'none' : 'lax';
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite,
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    };
}
function setActiveCompanyCookie(res, companyId) {
    res.cookie(exports.ACTIVE_COMPANY_COOKIE_NAME, String(companyId), getCookieSettings());
}
function clearActiveCompanyCookie(res) {
    const isProduction = process.env.NODE_ENV === 'production';
    const sameSite = isProduction ? 'none' : 'lax';
    res.clearCookie(exports.ACTIVE_COMPANY_COOKIE_NAME, {
        path: '/',
        sameSite,
        secure: isProduction,
    });
}
