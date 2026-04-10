import { MensajeApi } from '../types/MensajeApi';
import * as ThemeRepo from '../repositories/theme.repo';
import { PageBackgroundPreset, CornerRadius } from '@prisma/client';

interface ThemeResult extends MensajeApi {
    data?: any;
}

// Default theme values
const DEFAULT_THEME = {
    brand_color: '#2563eb',
    page_background_color: '#f3f4f6',
    page_background_preset: 'auto' as PageBackgroundPreset,
    cards_elevated: true,
    corner_radius: 'md' as CornerRadius,
    font_pairing: 'classic',
    hero_variant: 'hero-cinematic',
    services_variant: 'services-grid',
    team_variant: 'team-cards',
    home_cta_buttons: null,
};

const VALID_CTA_DESTINATIONS = ['booking', 'services', 'free-events', 'events', 'classes'];

function validateCTAButtons(buttons: unknown): string | null {
    if (!Array.isArray(buttons)) return 'home_cta_buttons must be an array';
    if (buttons.length > 5) return 'home_cta_buttons cannot have more than 5 buttons';
    for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i] as Record<string, unknown>;
        if (!VALID_CTA_DESTINATIONS.includes(btn.destination as string)) {
            return `Invalid destination "${btn.destination}" at index ${i}. Must be one of: ${VALID_CTA_DESTINATIONS.join(', ')}`;
        }
        if (typeof btn.label !== 'string' || btn.label.trim() === '') {
            return `Button at index ${i} must have a non-empty label`;
        }
        if (typeof btn.color !== 'string' || !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(btn.color)) {
            return `Button at index ${i} has invalid color format. Must be a hex color (e.g., #ffffff)`;
        }
        if (typeof btn.opacity !== 'number' || btn.opacity < 0 || btn.opacity > 100) {
            return `Button at index ${i} opacity must be a number between 0 and 100`;
        }
        if (typeof btn.enabled !== 'boolean') {
            return `Button at index ${i} enabled must be a boolean`;
        }
        if (typeof btn.order !== 'number') {
            return `Button at index ${i} order must be a number`;
        }
    }
    return null;
}

const VALID_HERO_VARIANTS = ['hero-cinematic', 'hero-split', 'hero-minimal'];
const VALID_SERVICES_VARIANTS = ['services-grid', 'services-list'];
const VALID_TEAM_VARIANTS = ['team-cards', 'team-spotlight'];
const VALID_FONT_PAIRINGS = ['classic', 'modern', 'bold', 'refined', 'friendly'];

/**
 * Validate hex color format
 */
function validateHexColor(color: string): boolean {
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexRegex.test(color);
}

/**
 * Get theme config for a company, returning defaults if none exists
 */
export async function getTheme(companyId: number): Promise<ThemeResult> {
    try {
        const theme = await ThemeRepo.getThemeByCompany(companyId);

        if (!theme) {
            return {
                code: 200,
                message: 'Theme config retrieved successfully (using defaults)',
                error: false,
                data: DEFAULT_THEME,
            };
        }

        return {
            code: 200,
            message: 'Theme config retrieved successfully',
            error: false,
            data: {
                brand_color: theme.brand_color,
                page_background_color: theme.page_background_color,
                page_background_preset: theme.page_background_preset,
                cards_elevated: theme.cards_elevated,
                corner_radius: theme.corner_radius,
                font_pairing: theme.font_pairing || 'classic',
                hero_variant: theme.hero_variant || 'hero-cinematic',
                services_variant: theme.services_variant || 'services-grid',
                team_variant: theme.team_variant || 'team-cards',
                home_cta_buttons: theme.home_cta_buttons ?? null,
                home_section_order: theme.home_section_order ?? null,
                footer_config: theme.footer_config ?? null,
                announcement_banners: theme.announcement_banners ?? null,
            },
        };
    } catch (error: any) {
        console.error('Error getting theme:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Update theme config for a company
 */
export interface ThemeUpdateInput {
    brand_color: string;
    page_background_color: string;
    page_background_preset: PageBackgroundPreset;
    cards_elevated: boolean;
    corner_radius: CornerRadius;
    font_pairing?: string;
    hero_variant?: string;
    services_variant?: string;
    team_variant?: string;
    home_cta_buttons?: unknown[] | null;
    home_section_order?: unknown[] | null;
    footer_config?: unknown | null;
    announcement_banners?: unknown[] | null;
}

export async function updateTheme(
    companyId: number,
    input: ThemeUpdateInput
): Promise<ThemeResult> {
    try {
        // Validate hex colors
        if (!validateHexColor(input.brand_color)) {
            return {
                code: 400,
                message: `Invalid brand_color format: ${input.brand_color}. Must be a valid hex color (e.g., #2563eb).`,
                error: true,
            };
        }

        if (!validateHexColor(input.page_background_color)) {
            return {
                code: 400,
                message: `Invalid page_background_color format: ${input.page_background_color}. Must be a valid hex color (e.g., #f3f4f6).`,
                error: true,
            };
        }

        // Validate page_background_preset
        const validPresets: PageBackgroundPreset[] = ['light', 'soft', 'dark', 'auto'];
        if (!validPresets.includes(input.page_background_preset)) {
            return {
                code: 400,
                message: `Invalid page_background_preset: ${input.page_background_preset}. Must be one of: ${validPresets.join(', ')}.`,
                error: true,
            };
        }

        // Validate corner_radius
        const validCorners: CornerRadius[] = ['sm', 'md', 'lg'];
        if (!validCorners.includes(input.corner_radius)) {
            return {
                code: 400,
                message: `Invalid corner_radius: ${input.corner_radius}. Must be one of: ${validCorners.join(', ')}.`,
                error: true,
            };
        }

        // Validate cards_elevated
        if (typeof input.cards_elevated !== 'boolean') {
            return {
                code: 400,
                message: `cards_elevated must be a boolean`,
                error: true,
            };
        }

        // Validate new customization fields
        const fontPairing = input.font_pairing || 'classic';
        if (!VALID_FONT_PAIRINGS.includes(fontPairing)) {
            return {
                code: 400,
                message: `Invalid font_pairing: ${fontPairing}. Must be one of: ${VALID_FONT_PAIRINGS.join(', ')}.`,
                error: true,
            };
        }

        const heroVariant = input.hero_variant || 'hero-cinematic';
        if (!VALID_HERO_VARIANTS.includes(heroVariant)) {
            return {
                code: 400,
                message: `Invalid hero_variant: ${heroVariant}. Must be one of: ${VALID_HERO_VARIANTS.join(', ')}.`,
                error: true,
            };
        }

        const servicesVariant = input.services_variant || 'services-grid';
        if (!VALID_SERVICES_VARIANTS.includes(servicesVariant)) {
            return {
                code: 400,
                message: `Invalid services_variant: ${servicesVariant}. Must be one of: ${VALID_SERVICES_VARIANTS.join(', ')}.`,
                error: true,
            };
        }

        const teamVariant = input.team_variant || 'team-cards';
        if (!VALID_TEAM_VARIANTS.includes(teamVariant)) {
            return {
                code: 400,
                message: `Invalid team_variant: ${teamVariant}. Must be one of: ${VALID_TEAM_VARIANTS.join(', ')}.`,
                error: true,
            };
        }

        // Validate home_cta_buttons if provided
        if (input.home_cta_buttons !== undefined && input.home_cta_buttons !== null) {
            const ctaError = validateCTAButtons(input.home_cta_buttons);
            if (ctaError) {
                return { code: 400, message: ctaError, error: true };
            }
        }

        // Validate home_section_order if provided
        const validSections = ['about', 'services', 'events', 'classes', 'team'];
        if (input.home_section_order !== undefined && input.home_section_order !== null) {
            if (!Array.isArray(input.home_section_order) ||
                !input.home_section_order.every((s) => validSections.includes(s as string))) {
                return { code: 400, message: `home_section_order must be an array of: ${validSections.join(', ')}`, error: true };
            }
        }

        // Validate announcement_banners if provided
        if (input.announcement_banners !== undefined && input.announcement_banners !== null) {
            if (!Array.isArray(input.announcement_banners) || input.announcement_banners.length > 3) {
                return { code: 400, message: 'announcement_banners must be an array of up to 3 items', error: true };
            }
            for (const b of input.announcement_banners as Record<string, unknown>[]) {
                if (typeof b.id !== 'string' || b.id.trim() === '') return { code: 400, message: 'Each banner must have a non-empty id', error: true };
                if (typeof b.message !== 'string' || b.message.trim() === '') return { code: 400, message: 'Each banner must have a non-empty message', error: true };
                if (typeof b.enabled !== 'boolean') return { code: 400, message: 'Each banner enabled must be boolean', error: true };
                if (b.sticky !== undefined && typeof b.sticky !== 'boolean') {
                    return { code: 400, message: 'Each banner sticky must be boolean when provided', error: true };
                }
            }
        }

        // Upsert theme
        await ThemeRepo.upsertTheme({
            companyId,
            brandColor: input.brand_color,
            pageBackgroundColor: input.page_background_color,
            pageBackgroundPreset: input.page_background_preset,
            cardsElevated: input.cards_elevated,
            cornerRadius: input.corner_radius,
            fontPairing,
            heroVariant,
            servicesVariant,
            teamVariant,
            homeCTAButtons: input.home_cta_buttons !== undefined ? input.home_cta_buttons : undefined,
            homeSectionOrder: input.home_section_order !== undefined ? input.home_section_order : undefined,
            footerConfig: input.footer_config !== undefined ? input.footer_config : undefined,
            announcementBanners: input.announcement_banners !== undefined ? input.announcement_banners : undefined,
        });

        // Get updated theme
        const updatedTheme = await ThemeRepo.getThemeByCompany(companyId);

        return {
            code: 200,
            message: 'Theme updated successfully',
            error: false,
            data: {
                brand_color: updatedTheme!.brand_color,
                page_background_color: updatedTheme!.page_background_color,
                page_background_preset: updatedTheme!.page_background_preset,
                cards_elevated: updatedTheme!.cards_elevated,
                corner_radius: updatedTheme!.corner_radius,
                font_pairing: updatedTheme!.font_pairing,
                hero_variant: updatedTheme!.hero_variant,
                services_variant: updatedTheme!.services_variant,
                team_variant: updatedTheme!.team_variant,
                home_cta_buttons: updatedTheme!.home_cta_buttons ?? null,
                home_section_order: updatedTheme!.home_section_order ?? null,
                footer_config: updatedTheme!.footer_config ?? null,
                announcement_banners: updatedTheme!.announcement_banners ?? null,
            },
        };
    } catch (error: any) {
        console.error('Error updating theme:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
