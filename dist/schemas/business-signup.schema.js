"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.businessSignupSchema = void 0;
const zod_1 = require("zod");
const business_products_1 = require("../config/business-products");
const coreProductSchema = zod_1.z.enum(business_products_1.PUBLIC_CORE_PRODUCT_KEYS, {
    error: 'Producto principal invalido.',
});
const addOnSchema = zod_1.z.enum(business_products_1.PUBLIC_ADD_ON_KEYS, {
    error: 'Add-on invalido.',
});
const coreSelectionSchema = zod_1.z.object({
    productKey: zod_1.z.enum(business_products_1.SELECTABLE_CORE_PRODUCT_KEYS, {
        error: 'Producto principal invalido.',
    }),
    tierKey: zod_1.z.enum(business_products_1.PUBLIC_CORE_TIER_KEYS, {
        error: 'Tier inválido.',
    }),
});
const slugSchema = zod_1.z
    .string()
    .trim()
    .min(2, 'El slug debe tener al menos 2 caracteres.')
    .max(64, 'El slug no puede tener más de 64 caracteres.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usá solo minúsculas, números y guiones en el slug.');
exports.businessSignupSchema = zod_1.z
    .object({
    businessName: zod_1.z.string().trim().min(2, 'El nombre del negocio es obligatorio.'),
    businessType: zod_1.z.string().trim().min(1, 'Elegí un tipo de negocio.'),
    ownerName: zod_1.z.string().trim().min(2, 'El nombre del dueño es obligatorio.'),
    email: zod_1.z.string().trim().email('Ingresá un email válido.'),
    phonePrefix: zod_1.z.string().trim().min(1, 'Ingresá un prefijo válido.'),
    countryCode: zod_1.z.string().trim().min(2).max(3).optional(),
    phone: zod_1.z.string().trim().min(6, 'Ingresá un teléfono o WhatsApp válido.'),
    password: zod_1.z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    slug: slugSchema.optional(),
    coreProducts: zod_1.z
        .array(coreProductSchema)
        .optional()
        .default([]),
    coreSelections: zod_1.z
        .array(coreSelectionSchema)
        .optional()
        .default([]),
    addOns: zod_1.z.array(addOnSchema).optional().default([]),
})
    .transform((data) => {
    const fallbackSelections = data.coreProducts
        .filter((product) => business_products_1.SELECTABLE_CORE_PRODUCT_KEYS.includes(product))
        .map((productKey) => ({
        productKey,
        tierKey: (0, business_products_1.getDefaultTierForCoreProduct)(productKey),
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
            code: zod_1.z.ZodIssueCode.custom,
            path: ['coreSelections'],
            message: 'Elegí al menos un producto principal.',
        });
    }
    if (uniqueCoreProducts.size !== data.coreSelections.length) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['coreSelections'],
            message: 'No repitas productos principales.',
        });
    }
    if (uniqueAddOns.size !== data.addOns.length) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['addOns'],
            message: 'No repitas add-ons.',
        });
    }
    data.coreSelections.forEach((selection, index) => {
        if (!(0, business_products_1.isTierValidForCoreProduct)(selection.productKey, selection.tierKey)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['coreSelections', index, 'tierKey'],
                message: 'Ese tier no corresponde al producto elegido.',
            });
        }
    });
});
