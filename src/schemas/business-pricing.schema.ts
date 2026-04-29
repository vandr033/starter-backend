import { z } from 'zod';
import {
    PUBLIC_ADD_ON_KEYS,
    PUBLIC_CORE_PRODUCT_KEYS,
    PUBLIC_CORE_TIER_KEYS,
} from '../config/business-pricing';

const knownBusinessPricingProductKeys = [
    ...PUBLIC_CORE_PRODUCT_KEYS,
    ...PUBLIC_ADD_ON_KEYS,
] as const;

export const businessPricingProductKeySchema = z.enum(knownBusinessPricingProductKeys, {
    error: 'Producto inválido.',
});

const coreTierPricingSchema = z.object({
    tierKey: z.enum(PUBLIC_CORE_TIER_KEYS, {
        error: 'Tier inválido.',
    }),
    monthlyPriceBs: z
        .number({ error: 'Ingresá un precio válido.' })
        .finite('Ingresá un precio válido.')
        .min(0, 'El precio mensual no puede ser negativo.'),
});

export const updateBusinessPricingProductSchema = z.object({
    displayName: z
        .string()
        .trim()
        .min(1, 'El nombre visible es obligatorio.')
        .max(120, 'El nombre visible no puede tener más de 120 caracteres.'),
    monthlyPriceBs: z
        .number({ error: 'Ingresá un precio válido.' })
        .finite('Ingresá un precio válido.')
        .min(0, 'El precio mensual no puede ser negativo.'),
    isActive: z.boolean({ error: 'El estado activo es obligatorio.' }),
    isComingSoon: z.boolean({ error: 'El estado de próximamente es obligatorio.' }),
    sortOrder: z
        .number({ error: 'Ingresá un orden válido.' })
        .int('El orden debe ser un número entero.')
        .min(0, 'El orden no puede ser negativo.'),
    tiers: z.array(coreTierPricingSchema).optional().default([]),
});

const discountTierSchema = z.object({
    minSelectedItems: z
        .number({ error: 'Ingresá una cantidad mínima válida.' })
        .int('La cantidad mínima debe ser un número entero.')
        .min(1, 'La cantidad mínima debe ser al menos 1.'),
    discountPercent: z
        .number({ error: 'Ingresá un porcentaje válido.' })
        .finite('Ingresá un porcentaje válido.')
        .min(0, 'El porcentaje no puede ser negativo.')
        .max(100, 'El porcentaje no puede ser mayor a 100.'),
    label: z
        .string()
        .trim()
        .min(1, 'La etiqueta es obligatoria.')
        .max(120, 'La etiqueta no puede tener más de 120 caracteres.'),
    isActive: z.boolean({ error: 'El estado activo es obligatorio.' }),
    sortOrder: z
        .number({ error: 'Ingresá un orden válido.' })
        .int('El orden debe ser un número entero.')
        .min(0, 'El orden no puede ser negativo.'),
});

export const updateBusinessPricingDiscountsSchema = z
    .object({
        bundleTiers: z
            .array(discountTierSchema)
            .min(1, 'Definí al menos un tier de descuento.'),
    })
    .superRefine((data, ctx) => {
        const seenMinimums = new Set<number>();

        data.bundleTiers.forEach((tier, index) => {
            if (seenMinimums.has(tier.minSelectedItems)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['bundleTiers', index, 'minSelectedItems'],
                    message: 'No repitas la cantidad mínima en los descuentos por combo.',
                });
                return;
            }

            seenMinimums.add(tier.minSelectedItems);
        });
    });

export const updateBusinessPricingSettingsSchema = z.object({
        annualDiscountPercent: z
            .number({ error: 'Ingresá un porcentaje anual válido.' })
            .finite('Ingresá un porcentaje anual válido.')
            .min(0, 'El descuento anual no puede ser negativo.')
            .max(100, 'El descuento anual no puede ser mayor a 100.'),
        trialLengthDays: z
            .number({ error: 'Ingresá una duración de prueba válida.' })
            .int('La duración de la prueba debe ser un número entero.')
            .min(1, 'La duración de la prueba debe ser mayor a 0.')
            .max(365, 'La duración de la prueba no puede ser mayor a 365 días.'),
        firstMonthFree: z.boolean({ error: 'El estado del primer mes gratis es obligatorio.' }),
});

export type UpdateBusinessPricingProductInput = z.infer<
    typeof updateBusinessPricingProductSchema
>;
export type UpdateBusinessPricingDiscountsInput = z.infer<
    typeof updateBusinessPricingDiscountsSchema
>;
export type UpdateBusinessPricingSettingsInput = z.infer<
    typeof updateBusinessPricingSettingsSchema
>;
