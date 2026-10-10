"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCompanyAvailableNow = isCompanyAvailableNow;
exports.buildShopUnavailablePayload = buildShopUnavailablePayload;
const SHOP_UNAVAILABLE_COPY = {
    title: {
        es: 'Negocio no disponible',
        en: 'Business unavailable',
    },
    subtitle: {
        es: 'Esta tienda no se encuentra activa en este momento.',
        en: 'This shop is not active at the moment.',
    },
    adminBanner: {
        es: 'Tu prueba o plan terminó el {date}. Activá tu plan para volver a operar.',
        en: 'Your plan expired on {date}. Contact support or renew to reactivate the shop.',
    },
};
function isCompanyAvailableNow(company, now = new Date()) {
    if (company.deleted_at)
        return false;
    if (company.is_active === false)
        return false;
    return now.getTime() <= company.availableUntil.getTime();
}
function buildShopUnavailablePayload(availableUntil, message) {
    const isExpired = new Date().getTime() > availableUntil.getTime();
    return {
        code: 403,
        error: true,
        errorCode: isExpired ? 'COMPANY_EXPIRED' : 'COMPANY_ACCESS_DENIED',
        reason: 'SHOP_EXPIRED',
        message: message || SHOP_UNAVAILABLE_COPY.title.es,
        data: {
            availableUntil: availableUntil.toISOString(),
            ...SHOP_UNAVAILABLE_COPY,
        },
    };
}
