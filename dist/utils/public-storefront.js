"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPublicStorefrontVisibility = buildPublicStorefrontVisibility;
exports.buildPublicEntitlementSummary = buildPublicEntitlementSummary;
exports.applyCommerceStoreVisibility = applyCommerceStoreVisibility;
exports.sanitizePublicThemeConfig = sanitizePublicThemeConfig;
const company_availability_1 = require("./company-availability");
function hasCapability(entitlements, capability) {
    return entitlements.productCapabilities[capability] === true;
}
function buildPublicStorefrontVisibility(params) {
    const storefrontEnabled = (0, company_availability_1.isCompanyAvailableNow)(params.availability);
    const servicesVisible = storefrontEnabled && hasCapability(params.entitlements, 'RESERVAS_BASE');
    const commerceVisible = storefrontEnabled && hasCapability(params.entitlements, 'COMMERCE_ACCESS');
    const eventsVisible = storefrontEnabled && hasCapability(params.entitlements, 'EVENTOS_BASE');
    const classesVisible = storefrontEnabled && hasCapability(params.entitlements, 'CLASES_BASE');
    const personalizationPlusEnabled = storefrontEnabled && hasCapability(params.entitlements, 'PERSONALIZACION_PLUS');
    const eventAdvancedEnabled = storefrontEnabled && hasCapability(params.entitlements, 'EVENTOS_PRO');
    const classAdvancedEnabled = storefrontEnabled && hasCapability(params.entitlements, 'CLASES_PRO');
    const marketplaceCapabilityEnabled = storefrontEnabled
        && (hasCapability(params.entitlements, 'MARKETPLACE_LISTING')
            || hasCapability(params.entitlements, 'MARKETPLACE_PLUS'));
    return {
        storefrontEnabled,
        companyInfoVisible: storefrontEnabled,
        contactVisible: storefrontEnabled,
        servicesVisible,
        bookingsEnabled: servicesVisible,
        commerceVisible,
        commercePromotionsVisible: commerceVisible && hasCapability(params.entitlements, 'COMMERCE_PROMOTIONS'),
        commerceCombosVisible: commerceVisible && hasCapability(params.entitlements, 'COMMERCE_COMBOS'),
        eventsVisible,
        eventRegistrationEnabled: eventsVisible,
        eventAdvancedEnabled,
        eventWaitlistEnabled: eventAdvancedEnabled,
        eventTicketsEnabled: eventAdvancedEnabled,
        classesVisible,
        classEnrollmentEnabled: classesVisible,
        classAdvancedEnabled,
        classPaymentPlansEnabled: classAdvancedEnabled,
        classAttendanceEnabled: classAdvancedEnabled,
        personalizationPlusEnabled,
        customCtasVisible: personalizationPlusEnabled,
        announcementBannersVisible: personalizationPlusEnabled,
        advancedSectionsVisible: personalizationPlusEnabled,
        footerCustomizationVisible: personalizationPlusEnabled,
        marketplaceListed: marketplaceCapabilityEnabled && Boolean(params.isMarketplaceVisible ?? true),
    };
}
function buildPublicEntitlementSummary(entitlements, publicFeatures) {
    return {
        source: entitlements.source,
        currentPlan: entitlements.currentPlan,
        activeProducts: [...entitlements.activeCoreProducts],
        activeAddOns: [...entitlements.activeAddOns],
        capabilities: { ...entitlements.productCapabilities },
        products: entitlements.products.map((product) => ({ ...product })),
        publicFeatures: { ...publicFeatures },
    };
}
function applyCommerceStoreVisibility(publicFeatures, isCommerceStoreActive) {
    if (isCommerceStoreActive) {
        return { ...publicFeatures };
    }
    return {
        ...publicFeatures,
        commerceVisible: false,
        commercePromotionsVisible: false,
        commerceCombosVisible: false,
    };
}
function sanitizePublicThemeConfig(theme, publicFeatures) {
    if (!theme) {
        return theme;
    }
    return {
        ...theme,
        home_cta_buttons: publicFeatures.customCtasVisible
            ? theme.home_cta_buttons ?? null
            : null,
        home_section_order: publicFeatures.advancedSectionsVisible
            ? theme.home_section_order ?? null
            : null,
        footer_config: publicFeatures.footerCustomizationVisible
            ? theme.footer_config ?? null
            : null,
        announcement_banners: publicFeatures.announcementBannersVisible
            ? theme.announcement_banners ?? null
            : null,
    };
}
