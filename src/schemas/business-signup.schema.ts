import { z } from 'zod';
import {
    PUBLIC_ADD_ON_KEYS,
    PUBLIC_CORE_PRODUCT_KEYS,
    SELECTABLE_CORE_PRODUCT_KEYS,
} from '../config/business-products';

const coreProductSchema = z.enum(PUBLIC_CORE_PRODUCT_KEYS, {
    error: 'Producto principal invalido.',
});

const addOnSchema = z.enum(PUBLIC_ADD_ON_KEYS, {
    error: 'Add-on invalido.',
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
        phone: z.string().trim().min(6, 'Ingresá un teléfono o WhatsApp válido.'),
        password: z
            .string()
            .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
        slug: slugSchema.optional(),
        coreProducts: z
            .array(coreProductSchema)
            .min(1, 'Elegí al menos un producto principal.'),
        addOns: z.array(addOnSchema).optional().default([]),
    })
    .superRefine((data, ctx) => {
        const uniqueCoreProducts = new Set(data.coreProducts);
        const uniqueAddOns = new Set(data.addOns);

        if (uniqueCoreProducts.size !== data.coreProducts.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['coreProducts'],
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

        if (data.coreProducts.includes('TIENDA')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['coreProducts'],
                message: 'Tienda todavía no está disponible. Elegí otro producto principal.',
            });
        }

        const invalidCoreProduct = data.coreProducts.find(
            (product) => !SELECTABLE_CORE_PRODUCT_KEYS.includes(product as (typeof SELECTABLE_CORE_PRODUCT_KEYS)[number]),
        );

        if (invalidCoreProduct) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['coreProducts'],
                message: 'Solo podés elegir Reservas, Eventos o Clases como productos principales.',
            });
        }
    });

export type BusinessSignupInput = z.infer<typeof businessSignupSchema>;
