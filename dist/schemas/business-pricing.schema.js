"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBusinessPricingSettingsSchema = exports.updateBusinessPricingDiscountsSchema = exports.updateBusinessPricingProductSchema = exports.businessPricingProductKeySchema = void 0;
const zod_1 = require("zod");
const business_pricing_1 = require("../config/business-pricing");
const knownBusinessPricingProductKeys = [
    ...business_pricing_1.PUBLIC_CORE_PRODUCT_KEYS,
    ...business_pricing_1.PUBLIC_ADD_ON_KEYS,
];
exports.businessPricingProductKeySchema = zod_1.z.enum(knownBusinessPricingProductKeys, {
    error: 'Producto inválido.',
});
const coreTierPricingSchema = zod_1.z.object({
    tierKey: zod_1.z.enum(business_pricing_1.PUBLIC_CORE_TIER_KEYS, {
        error: 'Tier inválido.',
    }),
    monthlyPriceBs: zod_1.z
        .number({ error: 'Ingresá un precio válido.' })
        .finite('Ingresá un precio válido.')
        .min(0, 'El precio mensual no puede ser negativo.'),
});
exports.updateBusinessPricingProductSchema = zod_1.z.object({
    displayName: zod_1.z
        .string()
        .trim()
        .min(1, 'El nombre visible es obligatorio.')
        .max(120, 'El nombre visible no puede tener más de 120 caracteres.'),
    monthlyPriceBs: zod_1.z
        .number({ error: 'Ingresá un precio válido.' })
        .finite('Ingresá un precio válido.')
        .min(0, 'El precio mensual no puede ser negativo.'),
    isActive: zod_1.z.boolean({ error: 'El estado activo es obligatorio.' }),
    isComingSoon: zod_1.z.boolean({ error: 'El estado de próximamente es obligatorio.' }),
    sortOrder: zod_1.z
        .number({ error: 'Ingresá un orden válido.' })
        .int('El orden debe ser un número entero.')
        .min(0, 'El orden no puede ser negativo.'),
    tiers: zod_1.z.array(coreTierPricingSchema).optional().default([]),
});
const discountTierSchema = zod_1.z.object({
    minSelectedItems: zod_1.z
        .number({ error: 'Ingresá una cantidad mínima válida.' })
        .int('La cantidad mínima debe ser un número entero.')
        .min(1, 'La cantidad mínima debe ser al menos 1.'),
    discountPercent: zod_1.z
        .number({ error: 'Ingresá un porcentaje válido.' })
        .finite('Ingresá un porcentaje válido.')
        .min(0, 'El porcentaje no puede ser negativo.')
        .max(100, 'El porcentaje no puede ser mayor a 100.'),
    label: zod_1.z
        .string()
        .trim()
        .min(1, 'La etiqueta es obligatoria.')
        .max(120, 'La etiqueta no puede tener más de 120 caracteres.'),
    isActive: zod_1.z.boolean({ error: 'El estado activo es obligatorio.' }),
    sortOrder: zod_1.z
        .number({ error: 'Ingresá un orden válido.' })
        .int('El orden debe ser un número entero.')
        .min(0, 'El orden no puede ser negativo.'),
});
exports.updateBusinessPricingDiscountsSchema = zod_1.z
    .object({
    bundleTiers: zod_1.z
        .array(discountTierSchema)
        .min(1, 'Definí al menos un tier de descuento.'),
})
    .superRefine((data, ctx) => {
    const seenMinimums = new Set();
    data.bundleTiers.forEach((tier, index) => {
        if (seenMinimums.has(tier.minSelectedItems)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['bundleTiers', index, 'minSelectedItems'],
                message: 'No repitas la cantidad mínima en los descuentos por combo.',
            });
            return;
        }
        seenMinimums.add(tier.minSelectedItems);
    });
});
exports.updateBusinessPricingSettingsSchema = zod_1.z.object({
    annualDiscountPercent: zod_1.z
        .number({ error: 'Ingresá un porcentaje anual válido.' })
        .finite('Ingresá un porcentaje anual válido.')
        .min(0, 'El descuento anual no puede ser negativo.')
        .max(100, 'El descuento anual no puede ser mayor a 100.'),
    trialLengthDays: zod_1.z
        .number({ error: 'Ingresá una duración de prueba válida.' })
        .int('La duración de la prueba debe ser un número entero.')
        .min(1, 'La duración de la prueba debe ser mayor a 0.')
        .max(365, 'La duración de la prueba no puede ser mayor a 365 días.'),
    firstMonthFree: zod_1.z.boolean({ error: 'El estado del primer mes gratis es obligatorio.' }),
});
