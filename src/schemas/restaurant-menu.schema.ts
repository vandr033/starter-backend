import { z } from 'zod';

export const DIETARY_LABELS = ['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE', 'SPICY', 'DAIRY_FREE', 'NUT_FREE'] as const;
export const ALLERGENS = ['GLUTEN', 'DAIRY', 'EGGS', 'PEANUTS', 'TREE_NUTS', 'SOY', 'FISH', 'SHELLFISH', 'SESAME'] as const;

const trimmed = (max: number) => z.string().trim().min(1, 'Este campo es obligatorio.').max(max);
const optionalTrimmed = (max: number) => z.string().trim().max(max).transform((value) => value || null).optional().nullable();
const nonNegative = z.coerce.number().int().min(0);
const labels = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values)).default([]).refine((items) => new Set(items).size === items.length, 'No se permiten etiquetas duplicadas.');

export const createRestaurantMenuCategorySchema = z.object({
  name: trimmed(120),
  description: optionalTrimmed(500),
  sort_order: nonNegative.default(0),
  is_active: z.boolean().default(true),
});
export const updateRestaurantMenuCategorySchema = createRestaurantMenuCategorySchema.partial().refine((input) => Object.keys(input).length > 0, 'Se requiere al menos un cambio.');

const price = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    ctx.addIssue({ code: 'custom', message: 'El precio debe ser un decimal válido con hasta dos decimales.' });
    return z.NEVER;
  }
  return normalized;
});

export const createRestaurantMenuItemSchema = z.object({
  category_id: z.coerce.number().int().positive(),
  name: trimmed(160),
  description: optionalTrimmed(2000),
  price: price.optional().nullable(),
  is_active: z.boolean().default(true),
  is_available: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  sort_order: nonNegative.default(0),
  preparation_minutes: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  dietary_labels: labels(DIETARY_LABELS),
  allergens: labels(ALLERGENS),
});
export const updateRestaurantMenuItemSchema = createRestaurantMenuItemSchema.partial().refine((input) => Object.keys(input).length > 0, 'Se requiere al menos un cambio.');

export const restaurantMenuReorderSchema = z.object({
  items: z.array(z.object({ id: z.coerce.number().int().positive(), sortOrder: nonNegative })).min(1).refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'No se permiten IDs duplicados.'),
});
