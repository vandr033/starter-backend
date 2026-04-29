import type {
  CompanyEntitlementPayload,
  EffectiveCompanyProduct,
  ProductCapability,
  ProductTierCode,
} from '../config/product-entitlements';
import {
  isCompanyAvailableNow,
  type CompanyAvailabilitySnapshot,
} from './company-availability';

export type PublicStorefrontVisibility = {
  storefrontEnabled: boolean;
  companyInfoVisible: boolean;
  contactVisible: boolean;
  servicesVisible: boolean;
  bookingsEnabled: boolean;
  eventsVisible: boolean;
  eventRegistrationEnabled: boolean;
  eventAdvancedEnabled: boolean;
  eventWaitlistEnabled: boolean;
  eventTicketsEnabled: boolean;
  classesVisible: boolean;
  classEnrollmentEnabled: boolean;
  classAdvancedEnabled: boolean;
  classPaymentPlansEnabled: boolean;
  classAttendanceEnabled: boolean;
  personalizationPlusEnabled: boolean;
  customCtasVisible: boolean;
  announcementBannersVisible: boolean;
  advancedSectionsVisible: boolean;
  footerCustomizationVisible: boolean;
  marketplaceListed: boolean;
};

export type PublicEntitlementSummary = {
  source: CompanyEntitlementPayload['source'];
  currentPlan: CompanyEntitlementPayload['currentPlan'];
  activeProducts: ProductTierCode[];
  activeAddOns: ProductTierCode[];
  capabilities: Record<ProductCapability, boolean>;
  products: EffectiveCompanyProduct[];
  publicFeatures: PublicStorefrontVisibility;
};

type ThemeConfigShape = {
  brand_color?: string | null;
  page_background_color?: string | null;
  page_background_preset?: string | null;
  cards_elevated?: boolean | null;
  corner_radius?: string | null;
  font_pairing?: string | null;
  hero_variant?: string | null;
  services_variant?: string | null;
  team_variant?: string | null;
  home_cta_buttons?: unknown[] | null;
  home_section_order?: unknown[] | null;
  footer_config?: Record<string, unknown> | null;
  announcement_banners?: unknown[] | null;
};

function hasCapability(
  entitlements: CompanyEntitlementPayload,
  capability: ProductCapability,
): boolean {
  return entitlements.productCapabilities[capability] === true;
}

export function buildPublicStorefrontVisibility(params: {
  entitlements: CompanyEntitlementPayload;
  availability: CompanyAvailabilitySnapshot;
  isMarketplaceVisible?: boolean | null;
}): PublicStorefrontVisibility {
  const storefrontEnabled = isCompanyAvailableNow(params.availability);
  const servicesVisible = storefrontEnabled && hasCapability(params.entitlements, 'RESERVAS_BASE');
  const eventsVisible = storefrontEnabled && hasCapability(params.entitlements, 'EVENTOS_BASE');
  const classesVisible = storefrontEnabled && hasCapability(params.entitlements, 'CLASES_BASE');
  const personalizationPlusEnabled =
    storefrontEnabled && hasCapability(params.entitlements, 'PERSONALIZACION_PLUS');
  const eventAdvancedEnabled =
    storefrontEnabled && hasCapability(params.entitlements, 'EVENTOS_PRO');
  const classAdvancedEnabled =
    storefrontEnabled && hasCapability(params.entitlements, 'CLASES_PRO');
  const marketplaceCapabilityEnabled =
    storefrontEnabled
    && (
      hasCapability(params.entitlements, 'MARKETPLACE_LISTING')
      || hasCapability(params.entitlements, 'MARKETPLACE_PLUS')
    );

  return {
    storefrontEnabled,
    companyInfoVisible: storefrontEnabled,
    contactVisible: storefrontEnabled,
    servicesVisible,
    bookingsEnabled: servicesVisible,
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

export function buildPublicEntitlementSummary(
  entitlements: CompanyEntitlementPayload,
  publicFeatures: PublicStorefrontVisibility,
): PublicEntitlementSummary {
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

export function sanitizePublicThemeConfig<T extends ThemeConfigShape | null | undefined>(
  theme: T,
  publicFeatures: PublicStorefrontVisibility,
): T {
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
  } as T;
}
