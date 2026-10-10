"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEATURE_REQUIRED_PLAN = exports.PLAN_CAPABILITIES = void 0;
exports.getPlanCapabilities = getPlanCapabilities;
exports.isPlanFeatureEnabled = isPlanFeatureEnabled;
exports.getFeatureRequiredPlan = getFeatureRequiredPlan;
exports.getPlanStaffLimit = getPlanStaffLimit;
exports.getCompanyCapabilitiesPayload = getCompanyCapabilitiesPayload;
const client_1 = require("@prisma/client");
const STARTER_FEATURES = {
    ROLES_PERMISSIONS: false,
    STAFF_AVAILABILITY: false,
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: false,
    BOOKING_REMINDERS: false,
    CUSTOMER_IMPORT_EXPORT: false,
    OPERATIONAL_DASHBOARD: false,
    REVIEW_MANAGEMENT: false,
    REVIEW_ANALYTICS: false,
    BOOKING_FLOW_CUSTOMIZATION: false,
    HOME_CTA_CUSTOMIZATION: false,
    HOME_SECTION_ORDER: false,
    FOOTER_CUSTOMIZATION: false,
    ANNOUNCEMENT_BANNERS: false,
    REVIEW_REQUEST_REMINDERS: false,
    REVIEW_REQUEST_EMAIL: false,
    REVIEW_REQUEST_WHATSAPP: false,
    BULK_WHATSAPP_MESSAGING: false,
    BULK_EMAIL_CAMPAIGNS: false,
    OUTREACH_REACTIVATION_TOOLS: false,
    GROUP_EVENTS: false,
    GROUP_CLASSES: false,
    GROUP_ADVANCED: false,
    RESTAURANT_MODULE: false,
};
const BUSINESS_FEATURES = {
    ROLES_PERMISSIONS: true,
    STAFF_AVAILABILITY: true,
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: true,
    BOOKING_REMINDERS: false,
    CUSTOMER_IMPORT_EXPORT: false,
    OPERATIONAL_DASHBOARD: true,
    REVIEW_MANAGEMENT: true,
    REVIEW_ANALYTICS: true,
    BOOKING_FLOW_CUSTOMIZATION: true,
    HOME_CTA_CUSTOMIZATION: false,
    HOME_SECTION_ORDER: true,
    FOOTER_CUSTOMIZATION: true,
    ANNOUNCEMENT_BANNERS: false,
    REVIEW_REQUEST_REMINDERS: false,
    REVIEW_REQUEST_EMAIL: false,
    REVIEW_REQUEST_WHATSAPP: false,
    BULK_WHATSAPP_MESSAGING: false,
    BULK_EMAIL_CAMPAIGNS: false,
    OUTREACH_REACTIVATION_TOOLS: false,
    GROUP_EVENTS: true,
    GROUP_CLASSES: false,
    GROUP_ADVANCED: false,
    RESTAURANT_MODULE: true,
};
const PRO_FEATURES = {
    ROLES_PERMISSIONS: true,
    STAFF_AVAILABILITY: true,
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: true,
    BOOKING_REMINDERS: true,
    CUSTOMER_IMPORT_EXPORT: true,
    OPERATIONAL_DASHBOARD: true,
    REVIEW_MANAGEMENT: true,
    REVIEW_ANALYTICS: true,
    BOOKING_FLOW_CUSTOMIZATION: true,
    HOME_CTA_CUSTOMIZATION: true,
    HOME_SECTION_ORDER: true,
    FOOTER_CUSTOMIZATION: true,
    ANNOUNCEMENT_BANNERS: true,
    REVIEW_REQUEST_REMINDERS: true,
    REVIEW_REQUEST_EMAIL: true,
    REVIEW_REQUEST_WHATSAPP: true,
    BULK_WHATSAPP_MESSAGING: true,
    BULK_EMAIL_CAMPAIGNS: true,
    OUTREACH_REACTIVATION_TOOLS: true,
    GROUP_EVENTS: true,
    GROUP_CLASSES: true,
    GROUP_ADVANCED: true,
    RESTAURANT_MODULE: true,
};
exports.PLAN_CAPABILITIES = {
    STARTER: {
        maxStaffMembers: 3,
        features: STARTER_FEATURES,
    },
    BUSINESS: {
        maxStaffMembers: 10,
        features: BUSINESS_FEATURES,
    },
    PRO: {
        maxStaffMembers: null,
        features: PRO_FEATURES,
    },
};
exports.FEATURE_REQUIRED_PLAN = {
    ROLES_PERMISSIONS: client_1.ShopPlan.BUSINESS,
    STAFF_AVAILABILITY: client_1.ShopPlan.BUSINESS,
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: client_1.ShopPlan.BUSINESS,
    BOOKING_REMINDERS: client_1.ShopPlan.PRO,
    CUSTOMER_IMPORT_EXPORT: client_1.ShopPlan.PRO,
    OPERATIONAL_DASHBOARD: client_1.ShopPlan.BUSINESS,
    REVIEW_MANAGEMENT: client_1.ShopPlan.BUSINESS,
    REVIEW_ANALYTICS: client_1.ShopPlan.BUSINESS,
    BOOKING_FLOW_CUSTOMIZATION: client_1.ShopPlan.BUSINESS,
    HOME_CTA_CUSTOMIZATION: client_1.ShopPlan.PRO,
    HOME_SECTION_ORDER: client_1.ShopPlan.BUSINESS,
    FOOTER_CUSTOMIZATION: client_1.ShopPlan.BUSINESS,
    ANNOUNCEMENT_BANNERS: client_1.ShopPlan.PRO,
    REVIEW_REQUEST_REMINDERS: client_1.ShopPlan.PRO,
    REVIEW_REQUEST_EMAIL: client_1.ShopPlan.PRO,
    REVIEW_REQUEST_WHATSAPP: client_1.ShopPlan.PRO,
    BULK_WHATSAPP_MESSAGING: client_1.ShopPlan.PRO,
    BULK_EMAIL_CAMPAIGNS: client_1.ShopPlan.PRO,
    OUTREACH_REACTIVATION_TOOLS: client_1.ShopPlan.PRO,
    GROUP_EVENTS: client_1.ShopPlan.BUSINESS,
    GROUP_CLASSES: client_1.ShopPlan.PRO,
    GROUP_ADVANCED: client_1.ShopPlan.PRO,
    RESTAURANT_MODULE: client_1.ShopPlan.BUSINESS,
};
function getPlanCapabilities(plan) {
    return exports.PLAN_CAPABILITIES[plan];
}
function isPlanFeatureEnabled(plan, feature) {
    return getPlanCapabilities(plan).features[feature] === true;
}
function getFeatureRequiredPlan(feature) {
    return exports.FEATURE_REQUIRED_PLAN[feature];
}
function getPlanStaffLimit(plan) {
    return getPlanCapabilities(plan).maxStaffMembers;
}
function getCompanyCapabilitiesPayload(plan) {
    const capabilities = getPlanCapabilities(plan);
    return {
        version: 1,
        currentPlan: plan,
        maxStaffMembers: capabilities.maxStaffMembers,
        features: { ...capabilities.features },
        requiredPlans: { ...exports.FEATURE_REQUIRED_PLAN },
    };
}
