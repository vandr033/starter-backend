"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restaurantMenuReorderSchema = exports.updateRestaurantMenuItemSchema = exports.createRestaurantMenuItemSchema = exports.updateRestaurantMenuCategorySchema = exports.createRestaurantMenuCategorySchema = exports.ALLERGENS = exports.DIETARY_LABELS = void 0;
const zod_1 = require("zod");
exports.DIETARY_LABELS = ['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE', 'SPICY', 'DAIRY_FREE', 'NUT_FREE'];
exports.ALLERGENS = ['GLUTEN', 'DAIRY', 'EGGS', 'PEANUTS', 'TREE_NUTS', 'SOY', 'FISH', 'SHELLFISH', 'SESAME'];
const trimmed = (max) => zod_1.z.string().trim().min(1, 'Este campo es obligatorio.').max(max);
const optionalTrimmed = (max) => zod_1.z.string().trim().max(max).transform((value) => value || null).optional().nullable();
const nonNegative = zod_1.z.coerce.number().int().min(0);
const labels = (values) => zod_1.z.array(zod_1.z.enum(values)).default([]).refine((items) => new Set(items).size === items.length, 'No se permiten etiquetas duplicadas.');
exports.createRestaurantMenuCategorySchema = zod_1.z.object({
    name: trimmed(120),
    description: optionalTrimmed(500),
    sort_order: nonNegative.default(0),
    is_active: zod_1.z.boolean().default(true),
});
exports.updateRestaurantMenuCategorySchema = exports.createRestaurantMenuCategorySchema.partial().refine((input) => Object.keys(input).length > 0, 'Se requiere al menos un cambio.');
const price = zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).transform((value, ctx) => {
    const normalized = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
        ctx.addIssue({ code: 'custom', message: 'El precio debe ser un decimal válido con hasta dos decimales.' });
        return zod_1.z.NEVER;
    }
    return normalized;
});
exports.createRestaurantMenuItemSchema = zod_1.z.object({
    category_id: zod_1.z.coerce.number().int().positive(),
    name: trimmed(160),
    description: optionalTrimmed(2000),
    price: price.optional().nullable(),
    is_active: zod_1.z.boolean().default(true),
    is_available: zod_1.z.boolean().default(true),
    is_featured: zod_1.z.boolean().default(false),
    sort_order: nonNegative.default(0),
    preparation_minutes: zod_1.z.coerce.number().int().min(0).max(1440).optional().nullable(),
    dietary_labels: labels(exports.DIETARY_LABELS),
    allergens: labels(exports.ALLERGENS),
});
exports.updateRestaurantMenuItemSchema = exports.createRestaurantMenuItemSchema.partial().refine((input) => Object.keys(input).length > 0, 'Se requiere al menos un cambio.');
exports.restaurantMenuReorderSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({ id: zod_1.z.coerce.number().int().positive(), sortOrder: nonNegative })).min(1).refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'No se permiten IDs duplicados.'),
});
