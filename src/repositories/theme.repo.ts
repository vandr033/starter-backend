import { prisma } from '../prisma/client';
import { PageBackgroundPreset, CornerRadius } from '@prisma/client';

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
}) {
    return prisma.themeConfig.upsert({
        where: {
            company_id: data.companyId,
        },
        update: {
            brand_color: data.brandColor,
            page_background_color: data.pageBackgroundColor,
            page_background_preset: data.pageBackgroundPreset,
            cards_elevated: data.cardsElevated,
            corner_radius: data.cornerRadius,
            font_pairing: data.fontPairing,
            hero_variant: data.heroVariant,
            services_variant: data.servicesVariant,
            team_variant: data.teamVariant,
            home_cta_buttons: data.homeCTAButtons ?? undefined,
        },
        create: {
            company_id: data.companyId,
            brand_color: data.brandColor,
            page_background_color: data.pageBackgroundColor,
            page_background_preset: data.pageBackgroundPreset,
            cards_elevated: data.cardsElevated,
            corner_radius: data.cornerRadius,
            font_pairing: data.fontPairing,
            hero_variant: data.heroVariant,
            services_variant: data.servicesVariant,
            team_variant: data.teamVariant,
            home_cta_buttons: data.homeCTAButtons ?? undefined,
        },
    });
}
