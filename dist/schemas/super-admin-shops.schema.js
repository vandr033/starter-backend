"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSuperAdminShopSchema = exports.createSuperAdminShopSchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const shopPlanSchema = zod_1.z.nativeEnum(client_1.ShopPlan);
const billingCycleSchema = zod_1.z.nativeEnum(client_1.BillingCycle);
const productCodeSchema = zod_1.z.nativeEnum(client_1.ProductCode);
const productTierCodeSchema = zod_1.z.nativeEnum(client_1.ProductTierCode);
const optionalTextSchema = zod_1.z
    .string()
    .trim()
    .optional()
    .nullable();
const requiredTextSchema = zod_1.z.string().trim().min(1);
const optionalCoordinateSchema = zod_1.z
    .number()
    .refine((value) => Number.isFinite(value), 'Must be a valid number')
    .optional()
    .nullable();
const availableUntilSchema = zod_1.z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), 'availableUntil must be a valid datetime');
const currencySchema = zod_1.z
    .string()
    .trim()
    .min(1, 'currency is required')
    .max(3, 'currency must be at most 3 characters');
const activeProductSchema = zod_1.z.object({
    productCode: productCodeSchema,
    tierCode: productTierCodeSchema,
    billingCycle: billingCycleSchema.optional().nullable(),
    availableUntil: availableUntilSchema.optional().nullable(),
    pricePaid: zod_1.z.number().min(0).nullable().optional(),
    currency: currencySchema.optional().nullable(),
});
const requestedProductSchema = zod_1.z.object({
    productCode: productCodeSchema,
    tierCode: productTierCodeSchema,
});
function tierBelongsToProduct(productCode, tierCode) {
    if (productCode === 'RESERVAS')
        return tierCode === 'RESERVAS_BASE' || tierCode === 'RESERVAS_PRO';
    if (productCode === 'EVENTOS')
        return tierCode === 'EVENTOS_BASE' || tierCode === 'EVENTOS_PRO';
    if (productCode === 'CLASES')
        return tierCode === 'CLASES_BASE' || tierCode === 'CLASES_PRO';
    if (productCode === 'STORES')
        return tierCode === 'STORES_BASE' || tierCode === 'STORES_PRO';
    if (productCode === 'RESTAURANTE')
        return tierCode === 'RESTAURANTE_PRO';
    if (productCode === 'PERSONALIZACION') {
        return tierCode === 'PERSONALIZACION_BASE' || tierCode === 'PERSONALIZACION_PLUS';
    }
    if (productCode === 'CRM')
        return tierCode === 'CRM_BASE' || tierCode === 'CRM_PRO';
    if (productCode === 'MENSAJERIA') {
        return tierCode === 'MENSAJERIA_BASE' || tierCode === 'MENSAJERIA_PRO';
    }
    if (productCode === 'METRICAS')
        return tierCode === 'METRICAS_BASE' || tierCode === 'METRICAS_PRO';
    if (productCode === 'MARKETPLACE')
        return tierCode === 'MARKETPLACE_PLUS';
    return false;
}
function isCoreProduct(productCode) {
    return (productCode === 'RESERVAS' ||
        productCode === 'EVENTOS' ||
        productCode === 'CLASES' ||
        productCode === 'STORES' ||
        productCode === 'RESTAURANTE');
}
function validateProductConfiguration(data, ctx) {
    const activeProducts = data.activeProducts ?? [];
    const requestedProducts = data.requestedProducts ?? [];
    const seenActive = new Set();
    for (const [index, product] of activeProducts.entries()) {
        if (!tierBelongsToProduct(product.productCode, product.tierCode)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['activeProducts', index, 'tierCode'],
                message: 'product tier must belong to selected product',
            });
        }
        if (seenActive.has(product.productCode)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['activeProducts', index, 'productCode'],
                message: 'active products cannot be duplicated',
            });
        }
        seenActive.add(product.productCode);
    }
    const seenRequested = new Set();
    for (const [index, product] of requestedProducts.entries()) {
        if (!tierBelongsToProduct(product.productCode, product.tierCode)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['requestedProducts', index, 'tierCode'],
                message: 'product tier must belong to selected product',
            });
        }
        if (seenRequested.has(product.productCode)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['requestedProducts', index, 'productCode'],
                message: 'requested products cannot be duplicated',
            });
        }
        seenRequested.add(product.productCode);
        if (seenActive.has(product.productCode)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['requestedProducts', index, 'productCode'],
                message: 'a product cannot be both active and requested',
            });
        }
    }
    if (data.activeProducts !== undefined) {
        const activeCoreCount = activeProducts.filter((product) => isCoreProduct(product.productCode)).length;
        if (activeCoreCount === 0) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['activeProducts'],
                message: 'at least one core product is required',
            });
        }
    }
    if (data.restaurantEnabled &&
        data.activeProducts !== undefined &&
        !activeProducts.some((product) => product.productCode === 'RESTAURANTE' && product.tierCode === 'RESTAURANTE_PRO')) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['restaurantEnabled'],
            message: 'Restaurant Lite requires an active Restaurante product',
        });
    }
}
const ownerSchema = zod_1.z
    .object({
    existingUserId: zod_1.z.string().trim().min(1).optional(),
    email: zod_1.z.string().trim().email().optional(),
    password: zod_1.z.string().min(8).optional(),
    first_name: optionalTextSchema,
    last_name: optionalTextSchema,
    phone_prefix: optionalTextSchema,
    phone: zod_1.z.string().trim().optional(),
    display_name: optionalTextSchema,
    is_bookable: zod_1.z.boolean().optional(),
})
    .superRefine((owner, ctx) => {
    const hasExistingUser = typeof owner.existingUserId === 'string' && owner.existingUserId.trim().length > 0;
    if (hasExistingUser)
        return;
    if (!owner.email) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['email'],
            message: 'owner.email is required when existingUserId is not provided',
        });
    }
    if (!owner.password || owner.password.length < 8) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['password'],
            message: 'owner.password must be at least 8 characters when existingUserId is not provided',
        });
    }
    const normalizedPhone = (owner.phone ?? '').replace(/\D/g, '');
    if (!normalizedPhone) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['phone'],
            message: 'owner.phone is required when existingUserId is not provided',
        });
    }
});
exports.createSuperAdminShopSchema = zod_1.z
    .object({
    name: requiredTextSchema,
    slug: optionalTextSchema,
    address: optionalTextSchema,
    phone_prefix: optionalTextSchema,
    phone: requiredTextSchema,
    email: zod_1.z.string().trim().email().optional().nullable(),
    city: optionalTextSchema,
    state: optionalTextSchema,
    country_code: optionalTextSchema,
    timezone: optionalTextSchema,
    currency: currencySchema,
    latitude: optionalCoordinateSchema,
    longitude: optionalCoordinateSchema,
    company_type_id: zod_1.z.number().int().positive(),
    plan: shopPlanSchema.optional(),
    billingCycle: billingCycleSchema,
    availableUntil: availableUntilSchema,
    pricePaid: zod_1.z.number().min(0).nullable().optional(),
    isMarketplaceVisible: zod_1.z.boolean(),
    activeProducts: zod_1.z.array(activeProductSchema).optional(),
    requestedProducts: zod_1.z.array(requestedProductSchema).optional(),
    restaurantEnabled: zod_1.z.boolean().optional(),
    note: zod_1.z.string().trim().max(500).optional(),
    owner: ownerSchema,
})
    .superRefine((data, ctx) => validateProductConfiguration(data, ctx))
    .strict();
exports.updateSuperAdminShopSchema = zod_1.z
    .object({
    name: requiredTextSchema.optional(),
    slug: zod_1.z.string().trim().min(1).max(64).optional(),
    address: optionalTextSchema,
    phone_prefix: optionalTextSchema,
    phone: requiredTextSchema.optional(),
    email: zod_1.z.string().trim().email().optional().nullable(),
    city: optionalTextSchema,
    state: optionalTextSchema,
    country_code: optionalTextSchema,
    timezone: optionalTextSchema,
    currency: currencySchema.optional(),
    latitude: optionalCoordinateSchema,
    longitude: optionalCoordinateSchema,
    company_type_id: zod_1.z.number().int().positive().optional(),
    is_active: zod_1.z.boolean().optional(),
    plan: shopPlanSchema.optional(),
    billingCycle: billingCycleSchema.optional(),
    availableUntil: availableUntilSchema.optional(),
    pricePaid: zod_1.z.number().min(0).nullable().optional(),
    isMarketplaceVisible: zod_1.z.boolean().optional(),
    activeProducts: zod_1.z.array(activeProductSchema).optional(),
    requestedProducts: zod_1.z.array(requestedProductSchema).optional(),
    restaurantEnabled: zod_1.z.boolean().optional(),
    note: zod_1.z.string().trim().max(500).optional(),
})
    .superRefine((data, ctx) => validateProductConfiguration(data, ctx))
    .strict()
    .refine((data) => Object.keys(data).length > 0, 'At least one field is required');
