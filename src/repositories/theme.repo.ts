import { prisma } from '../prisma/client';
import { PageBackgroundPreset, CornerRadius, Prisma } from '@prisma/client';

/**
 * Coerce a JSON field value so Prisma accepts it.
 * Prisma requires Prisma.JsonNull (not plain null) for nullable Json columns.
 */
function toJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
}

/**
 * Get theme config for a company
 */
export async function getThemeByCompany(companyId: number) {
    return prisma.themeConfig.findUnique({
        where: {
            company_id: companyId,
        },
    });
}

/**
 * Upsert theme config for a company
 */
export async function upsertTheme(data: {
    companyId: number;
    brandColor: string;
    pageBackgroundColor: string;
    pageBackgroundPreset: PageBackgroundPreset;
    cardsElevated: boolean;
    cornerRadius: CornerRadius;
    fontPairing: string;
    heroVariant: string;
    servicesVariant: string;
    teamVariant: string;
    homeCTAButtons?: object | null;
    homeSectionOrder?: object | null;
    footerConfig?: object | null;
    announcementBanners?: object | null;
}) {
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

    return prisma.themeConfig.upsert({
        where: { company_id: data.companyId },
        update: fields,
        create: { company_id: data.companyId, ...fields },
    });
}
