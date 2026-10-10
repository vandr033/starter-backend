"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_PROFILES = exports.DEMO_OPERATOR_EMAIL = void 0;
exports.getDemoProfile = getDemoProfile;
exports.getDemoProfileForCompanySlug = getDemoProfileForCompanySlug;
exports.toPublicDemoProfile = toPublicDemoProfile;
// Reserved for demo sessions; membership writes and the read-only verifier enforce demo-only access.
exports.DEMO_OPERATOR_EMAIL = 'demo.operator@demo.priconpri.invalid';
const commonAddons = ['CRM', 'MENSAJERIA', 'METRICAS', 'PERSONALIZACION'];
exports.DEMO_PROFILES = {
    reservas: {
        key: 'reservas', displayName: 'Reservas', companyName: 'Atelier 27', companySlug: 'atelier-27-demo',
        companyTypeKey: 'demo-beauty-wellness', publicDestination: '/shop/atelier-27-demo/services',
        adminDestination: '/admin/dashboard/bookings', enabledProducts: ['RESERVAS'], enabledAddons: commonAddons,
        productTiers: ['RESERVAS_PRO', 'CRM_PRO', 'MENSAJERIA_PRO', 'METRICAS_PRO', 'PERSONALIZACION_PLUS'],
        hasPublicFlow: true, hasAdminFlow: true,
    },
    restaurante: {
        key: 'restaurante', displayName: 'Restaurante', companyName: 'Casa Patio', companySlug: 'casa-patio-demo',
        companyTypeKey: 'demo-restaurant', publicDestination: '/shop/casa-patio-demo/menu',
        adminDestination: '/admin/dashboard/restaurant', enabledProducts: ['RESTAURANTE'], enabledAddons: commonAddons,
        productTiers: ['RESTAURANTE_PRO', 'CRM_PRO', 'MENSAJERIA_PRO', 'METRICAS_PRO', 'PERSONALIZACION_PLUS'],
        hasPublicFlow: true, hasAdminFlow: true,
    },
    eventos: {
        key: 'eventos', displayName: 'Eventos', companyName: 'Distrito', companySlug: 'distrito-demo',
        companyTypeKey: 'demo-events-venue', publicDestination: '/shop/distrito-demo/events',
        adminDestination: '/admin/dashboard/group-reservations/events', enabledProducts: ['EVENTOS'], enabledAddons: commonAddons,
        productTiers: ['EVENTOS_PRO', 'CRM_PRO', 'MENSAJERIA_PRO', 'METRICAS_PRO', 'PERSONALIZACION_PLUS'],
        hasPublicFlow: true, hasAdminFlow: true,
    },
    clases: {
        key: 'clases', displayName: 'Clases', companyName: 'Forma Studio', companySlug: 'forma-studio-demo',
        companyTypeKey: 'demo-fitness-studio', publicDestination: '/shop/forma-studio-demo/classes',
        adminDestination: '/admin/dashboard/group-reservations/classes', enabledProducts: ['CLASES'], enabledAddons: commonAddons,
        productTiers: ['CLASES_PRO', 'CRM_PRO', 'MENSAJERIA_PRO', 'METRICAS_PRO', 'PERSONALIZACION_PLUS'],
        hasPublicFlow: true, hasAdminFlow: true,
    },
    tienda: {
        key: 'tienda', displayName: 'Tienda', companyName: 'Nativa', companySlug: 'nativa-demo',
        companyTypeKey: 'demo-retail-store', publicDestination: '/shop/nativa-demo/store',
        adminDestination: '/admin/dashboard/store', enabledProducts: ['STORES'], enabledAddons: commonAddons,
        productTiers: ['STORES_PRO', 'CRM_PRO', 'MENSAJERIA_PRO', 'METRICAS_PRO', 'PERSONALIZACION_PLUS'],
        hasPublicFlow: true, hasAdminFlow: true,
    },
    completo: {
        key: 'completo', displayName: 'Suite completa', companyName: 'Club Horizonte', companySlug: 'club-horizonte-demo',
        companyTypeKey: 'demo-wellness-club', publicDestination: '/shop/club-horizonte-demo',
        adminDestination: '/admin/dashboard', enabledProducts: ['RESERVAS', 'RESTAURANTE', 'EVENTOS', 'CLASES', 'STORES'], enabledAddons: commonAddons,
        productTiers: ['RESERVAS_PRO', 'RESTAURANTE_PRO', 'EVENTOS_PRO', 'CLASES_PRO', 'STORES_PRO', 'CRM_PRO', 'MENSAJERIA_PRO', 'METRICAS_PRO', 'PERSONALIZACION_PLUS'],
        hasPublicFlow: true, hasAdminFlow: true,
    },
};
function getDemoProfile(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(exports.DEMO_PROFILES, value)
        ? exports.DEMO_PROFILES[value]
        : null;
}
function getDemoProfileForCompanySlug(slug) {
    return Object.values(exports.DEMO_PROFILES).find((profile) => profile.companySlug === slug) ?? null;
}
function toPublicDemoProfile(profile) {
    return {
        key: profile.key,
        displayName: profile.displayName,
        companyName: profile.companyName,
        companySlug: profile.companySlug,
        publicDestination: profile.publicDestination,
        adminDestination: profile.adminDestination,
        enabledProducts: profile.enabledProducts,
        enabledAddons: profile.enabledAddons,
        hasPublicFlow: profile.hasPublicFlow,
        hasAdminFlow: profile.hasAdminFlow,
    };
}
