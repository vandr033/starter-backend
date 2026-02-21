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
};

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

        // Upsert theme
        await ThemeRepo.upsertTheme({
            companyId,
            brandColor: input.brand_color,
            pageBackgroundColor: input.page_background_color,
            pageBackgroundPreset: input.page_background_preset,
            cardsElevated: input.cards_elevated,
            cornerRadius: input.corner_radius,
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
