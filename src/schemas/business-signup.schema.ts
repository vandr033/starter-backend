import { z } from 'zod';
import {
    PUBLIC_ADD_ON_KEYS,
    PUBLIC_CORE_PRODUCT_KEYS,
    PUBLIC_CORE_TIER_KEYS,
    SELECTABLE_CORE_PRODUCT_KEYS,
    getDefaultTierForCoreProduct,
    isTierValidForCoreProduct,
    type SelectableCoreProductKey,
} from '../config/business-products';

const coreProductSchema = z.enum(PUBLIC_CORE_PRODUCT_KEYS, {
    error: 'Producto principal invalido.',
});

const addOnSchema = z.enum(PUBLIC_ADD_ON_KEYS, {
    error: 'Add-on invalido.',
});

const coreSelectionSchema = z.object({
    productKey: z.enum(SELECTABLE_CORE_PRODUCT_KEYS, {
        error: 'Producto principal invalido.',
    }),
    tierKey: z.enum(PUBLIC_CORE_TIER_KEYS, {
        error: 'Tier inválido.',
    }),
});

const slugSchema = z
    .string()
    .trim()
    .min(2, 'El slug debe tener al menos 2 caracteres.')
    .max(64, 'El slug no puede tener más de 64 caracteres.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usá solo minúsculas, números y guiones en el slug.');

export const businessSignupSchema = z
    .object({
        businessName: z.string().trim().min(2, 'El nombre del negocio es obligatorio.'),
        businessType: z.string().trim().min(1, 'Elegí un tipo de negocio.'),
        ownerName: z.string().trim().min(2, 'El nombre del dueño es obligatorio.'),
        email: z.string().trim().email('Ingresá un email válido.'),
        phonePrefix: z.string().trim().min(1, 'Ingresá un prefijo válido.'),
        countryCode: z.string().trim().min(2).max(3).optional(),
        phone: z.string().trim().min(6, 'Ingresá un teléfono o WhatsApp válido.'),
        password: z
            .string()
            .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
        slug: slugSchema.optional(),
        coreProducts: z
            .array(coreProductSchema)
            .optional()
            .default([]),
        coreSelections: z
            .array(coreSelectionSchema)
            .optional()
            .default([]),
        addOns: z.array(addOnSchema).optional().default([]),
    })
    .transform((data) => {
        const fallbackSelections = data.coreProducts
            .filter((product): product is SelectableCoreProductKey =>
                SELECTABLE_CORE_PRODUCT_KEYS.includes(product as SelectableCoreProductKey),
            )
            .map((productKey) => ({
                productKey,
                tierKey: getDefaultTierForCoreProduct(productKey),
            }));

        return {
            ...data,
            coreSelections: data.coreSelections.length > 0 ? data.coreSelections : fallbackSelections,
        };
    })
    .superRefine((data, ctx) => {
        const uniqueCoreProducts = new Set(data.coreSelections.map((selection) => selection.productKey));
        const uniqueAddOns = new Set(data.addOns);

        if (data.coreSelections.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['coreSelections'],
                message: 'Elegí al menos un producto principal.',
            });
        }

        if (uniqueCoreProducts.size !== data.coreSelections.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['coreSelections'],
                message: 'No repitas productos principales.',
            });
        }


        if (uniqueAddOns.size !== data.addOns.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['addOns'],
                message: 'No repitas add-ons.',
            });
        }

        data.coreSelections.forEach((selection, index) => {
            if (!isTierValidForCoreProduct(selection.productKey, selection.tierKey)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['coreSelections', index, 'tierKey'],
                    message: 'Ese tier no corresponde al producto elegido.',
                });
            }
        });
    });

export type BusinessSignupInput = z.infer<typeof businessSignupSchema>;
