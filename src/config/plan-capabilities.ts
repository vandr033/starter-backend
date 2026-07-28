import { ShopPlan } from '@prisma/client';

// Legacy fixed-plan matrix kept for backwards compatibility.
// New commercial logic should resolve through `company-entitlements.service.ts`,
// which uses modular product subscriptions when present and falls back to
// `Company.plan` until that column can be fully deprecated.

export type PlanFeatureKey =
    | 'ROLES_PERMISSIONS'
    | 'STAFF_AVAILABILITY'
    | 'TRANSACTIONAL_BOOKING_NOTIFICATIONS'
    | 'BOOKING_REMINDERS'
    | 'CUSTOMER_IMPORT_EXPORT'
    | 'OPERATIONAL_DASHBOARD'
    | 'REVIEW_MANAGEMENT'
    | 'REVIEW_ANALYTICS'
    | 'REVIEW_REQUEST_REMINDERS'
    | 'REVIEW_REQUEST_EMAIL'
    | 'REVIEW_REQUEST_WHATSAPP'
    | 'BOOKING_FLOW_CUSTOMIZATION'
    | 'HOME_CTA_CUSTOMIZATION'
    | 'HOME_SECTION_ORDER'
    | 'FOOTER_CUSTOMIZATION'
    | 'ANNOUNCEMENT_BANNERS'
    | 'BULK_WHATSAPP_MESSAGING'
    | 'BULK_EMAIL_CAMPAIGNS'
    | 'OUTREACH_REACTIVATION_TOOLS'
    | 'GROUP_EVENTS'
    | 'GROUP_CLASSES'
    | 'GROUP_ADVANCED'
    | 'RESTAURANT_MODULE';

export type PlanCapabilities = {
    maxStaffMembers: number | null;
    features: Record<PlanFeatureKey, boolean>;
};

export type CompanyCapabilitiesPayload = {
    version: 1;
    currentPlan: ShopPlan;
    maxStaffMembers: number | null;
    features: Record<PlanFeatureKey, boolean>;
    requiredPlans: Record<PlanFeatureKey, ShopPlan>;
};

const STARTER_FEATURES: Record<PlanFeatureKey, boolean> = {
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

const BUSINESS_FEATURES: Record<PlanFeatureKey, boolean> = {
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

const PRO_FEATURES: Record<PlanFeatureKey, boolean> = {
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

export const PLAN_CAPABILITIES: Record<ShopPlan, PlanCapabilities> = {
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

export const FEATURE_REQUIRED_PLAN: Record<PlanFeatureKey, ShopPlan> = {
    ROLES_PERMISSIONS: ShopPlan.BUSINESS,
    STAFF_AVAILABILITY: ShopPlan.BUSINESS,
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: ShopPlan.BUSINESS,
    BOOKING_REMINDERS: ShopPlan.PRO,
    CUSTOMER_IMPORT_EXPORT: ShopPlan.PRO,
    OPERATIONAL_DASHBOARD: ShopPlan.BUSINESS,
    REVIEW_MANAGEMENT: ShopPlan.BUSINESS,
    REVIEW_ANALYTICS: ShopPlan.BUSINESS,
    BOOKING_FLOW_CUSTOMIZATION: ShopPlan.BUSINESS,
    HOME_CTA_CUSTOMIZATION: ShopPlan.PRO,
    HOME_SECTION_ORDER: ShopPlan.BUSINESS,
    FOOTER_CUSTOMIZATION: ShopPlan.BUSINESS,
    ANNOUNCEMENT_BANNERS: ShopPlan.PRO,
    REVIEW_REQUEST_REMINDERS: ShopPlan.PRO,
    REVIEW_REQUEST_EMAIL: ShopPlan.PRO,
    REVIEW_REQUEST_WHATSAPP: ShopPlan.PRO,
    BULK_WHATSAPP_MESSAGING: ShopPlan.PRO,
    BULK_EMAIL_CAMPAIGNS: ShopPlan.PRO,
    OUTREACH_REACTIVATION_TOOLS: ShopPlan.PRO,
    GROUP_EVENTS: ShopPlan.BUSINESS,
    GROUP_CLASSES: ShopPlan.PRO,
    GROUP_ADVANCED: ShopPlan.PRO,
    RESTAURANT_MODULE: ShopPlan.BUSINESS,
};

export function getPlanCapabilities(plan: ShopPlan): PlanCapabilities {
    return PLAN_CAPABILITIES[plan];
}

export function isPlanFeatureEnabled(plan: ShopPlan, feature: PlanFeatureKey): boolean {
    return getPlanCapabilities(plan).features[feature] === true;
}

export function getFeatureRequiredPlan(feature: PlanFeatureKey): ShopPlan {
    return FEATURE_REQUIRED_PLAN[feature];
}

export function getPlanStaffLimit(plan: ShopPlan): number | null {
    return getPlanCapabilities(plan).maxStaffMembers;
}

export function getCompanyCapabilitiesPayload(plan: ShopPlan): CompanyCapabilitiesPayload {
    const capabilities = getPlanCapabilities(plan);

    return {
        version: 1,
        currentPlan: plan,
        maxStaffMembers: capabilities.maxStaffMembers,
        features: { ...capabilities.features },
        requiredPlans: { ...FEATURE_REQUIRED_PLAN },
    };
}
