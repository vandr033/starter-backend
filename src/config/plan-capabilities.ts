import { ShopPlan } from '@prisma/client';

export type PlanFeatureKey =
    | 'ROLES_PERMISSIONS'
    | 'STAFF_AVAILABILITY'
    | 'TRANSACTIONAL_BOOKING_NOTIFICATIONS'
    | 'BOOKING_REMINDERS'
    | 'CUSTOMER_IMPORT_EXPORT'
    | 'OPERATIONAL_DASHBOARD'
    | 'BULK_WHATSAPP_MESSAGING'
    | 'BULK_EMAIL_CAMPAIGNS'
    | 'OUTREACH_REACTIVATION_TOOLS';

export type PlanCapabilities = {
    maxStaffMembers: number | null;
    features: Record<PlanFeatureKey, boolean>;
};

const STARTER_FEATURES: Record<PlanFeatureKey, boolean> = {
    ROLES_PERMISSIONS: false,
    STAFF_AVAILABILITY: false,
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: false,
    BOOKING_REMINDERS: false,
    CUSTOMER_IMPORT_EXPORT: false,
    OPERATIONAL_DASHBOARD: false,
    BULK_WHATSAPP_MESSAGING: false,
    BULK_EMAIL_CAMPAIGNS: false,
    OUTREACH_REACTIVATION_TOOLS: false,
};

const BUSINESS_FEATURES: Record<PlanFeatureKey, boolean> = {
    ROLES_PERMISSIONS: true,
    STAFF_AVAILABILITY: true,
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: true,
    BOOKING_REMINDERS: true,
    CUSTOMER_IMPORT_EXPORT: true,
    OPERATIONAL_DASHBOARD: true,
    BULK_WHATSAPP_MESSAGING: false,
    BULK_EMAIL_CAMPAIGNS: false,
    OUTREACH_REACTIVATION_TOOLS: false,
};

const PRO_FEATURES: Record<PlanFeatureKey, boolean> = {
    ROLES_PERMISSIONS: true,
    STAFF_AVAILABILITY: true,
    TRANSACTIONAL_BOOKING_NOTIFICATIONS: true,
    BOOKING_REMINDERS: true,
    CUSTOMER_IMPORT_EXPORT: true,
    OPERATIONAL_DASHBOARD: true,
    BULK_WHATSAPP_MESSAGING: true,
    BULK_EMAIL_CAMPAIGNS: true,
    OUTREACH_REACTIVATION_TOOLS: true,
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
    BOOKING_REMINDERS: ShopPlan.BUSINESS,
    CUSTOMER_IMPORT_EXPORT: ShopPlan.BUSINESS,
    OPERATIONAL_DASHBOARD: ShopPlan.BUSINESS,
    BULK_WHATSAPP_MESSAGING: ShopPlan.PRO,
    BULK_EMAIL_CAMPAIGNS: ShopPlan.PRO,
    OUTREACH_REACTIVATION_TOOLS: ShopPlan.PRO,
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
