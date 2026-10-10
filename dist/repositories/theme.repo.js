"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getThemeByCompany = getThemeByCompany;
exports.upsertTheme = upsertTheme;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
/**
 * Coerce a JSON field value so Prisma accepts it.
 * Prisma requires Prisma.JsonNull (not plain null) for nullable Json columns.
 */
function toJsonValue(value) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return client_2.Prisma.JsonNull;
    return value;
}
/**
 * Get theme config for a company
 */
async function getThemeByCompany(companyId) {
    return client_1.prisma.themeConfig.findUnique({
        where: {
            company_id: companyId,
        },
    });
}
/**
 * Upsert theme config for a company
 */
async function upsertTheme(data) {
    const fields = {
        brand_color: data.brandColor,
        page_background_color: data.pageBackgroundColor,
        page_background_preset: data.pageBackgroundPreset,
        cards_elevated: data.cardsElevated,
        corner_radius: data.cornerRadius,
        font_pairing: data.fontPairing,
        hero_variant: data.heroVariant,
        services_variant: data.servicesVariant,
        team_variant: data.teamVariant,
        ...(data.homeCTAButtons !== undefined && { home_cta_buttons: toJsonValue(data.homeCTAButtons) }),
        ...(data.homeSectionOrder !== undefined && { home_section_order: toJsonValue(data.homeSectionOrder) }),
        ...(data.footerConfig !== undefined && { footer_config: toJsonValue(data.footerConfig) }),
        ...(data.announcementBanners !== undefined && { announcement_banners: toJsonValue(data.announcementBanners) }),
    };
    return client_1.prisma.themeConfig.upsert({
        where: { company_id: data.companyId },
        update: fields,
        create: { company_id: data.companyId, ...fields },
    });
}
