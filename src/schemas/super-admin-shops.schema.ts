import { BillingCycle, ProductCode, ProductTierCode, ShopPlan } from '@prisma/client';
import { z } from 'zod';

const shopPlanSchema = z.nativeEnum(ShopPlan);
const billingCycleSchema = z.nativeEnum(BillingCycle);
const productCodeSchema = z.nativeEnum(ProductCode);
const productTierCodeSchema = z.nativeEnum(ProductTierCode);

const optionalTextSchema = z
  .string()
  .trim()
  .optional()
  .nullable();

const requiredTextSchema = z.string().trim().min(1);

const optionalCoordinateSchema = z
  .number()
  .refine((value) => Number.isFinite(value), 'Must be a valid number')
  .optional()
  .nullable();

const availableUntilSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'availableUntil must be a valid datetime');

const currencySchema = z
  .string()
  .trim()
  .min(1, 'currency is required')
  .max(3, 'currency must be at most 3 characters');

const activeProductSchema = z.object({
  productCode: productCodeSchema,
  tierCode: productTierCodeSchema,
  billingCycle: billingCycleSchema.optional().nullable(),
  availableUntil: availableUntilSchema.optional().nullable(),
  pricePaid: z.number().min(0).nullable().optional(),
  currency: currencySchema.optional().nullable(),
});

const requestedProductSchema = z.object({
  productCode: productCodeSchema,
  tierCode: productTierCodeSchema,
});

function tierBelongsToProduct(
  productCode: z.infer<typeof productCodeSchema>,
  tierCode: z.infer<typeof productTierCodeSchema>,
): boolean {
  if (productCode === 'RESERVAS') return tierCode === 'RESERVAS_BASE' || tierCode === 'RESERVAS_PRO';
  if (productCode === 'EVENTOS') return tierCode === 'EVENTOS_BASE' || tierCode === 'EVENTOS_PRO';
  if (productCode === 'CLASES') return tierCode === 'CLASES_BASE' || tierCode === 'CLASES_PRO';
  if (productCode === 'STORES') return tierCode === 'STORES_BASE' || tierCode === 'STORES_PRO';
  if (productCode === 'PERSONALIZACION') {
    return tierCode === 'PERSONALIZACION_BASE' || tierCode === 'PERSONALIZACION_PLUS';
  }
  if (productCode === 'CRM') return tierCode === 'CRM_BASE' || tierCode === 'CRM_PRO';
  if (productCode === 'MENSAJERIA') {
    return tierCode === 'MENSAJERIA_BASE' || tierCode === 'MENSAJERIA_PRO';
  }
  if (productCode === 'METRICAS') return tierCode === 'METRICAS_BASE' || tierCode === 'METRICAS_PRO';
  if (productCode === 'MARKETPLACE') return tierCode === 'MARKETPLACE_PLUS';
  return false;
}

function isCoreProduct(productCode: z.infer<typeof productCodeSchema>): boolean {
  return (
    productCode === 'RESERVAS' ||
    productCode === 'EVENTOS' ||
    productCode === 'CLASES' ||
    productCode === 'STORES'
  );
}

function validateProductConfiguration(
  data: {
    activeProducts?: Array<z.infer<typeof activeProductSchema>>;
    requestedProducts?: Array<z.infer<typeof requestedProductSchema>>;
  },
  ctx: z.RefinementCtx,
) {
  const activeProducts = data.activeProducts ?? [];
  const requestedProducts = data.requestedProducts ?? [];

  const seenActive = new Set<string>();
  for (const [index, product] of activeProducts.entries()) {
    if (!tierBelongsToProduct(product.productCode, product.tierCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeProducts', index, 'tierCode'],
        message: 'product tier must belong to selected product',
      });
    }

    if (seenActive.has(product.productCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeProducts', index, 'productCode'],
        message: 'active products cannot be duplicated',
      });
    }
    seenActive.add(product.productCode);
  }

  const seenRequested = new Set<string>();
  for (const [index, product] of requestedProducts.entries()) {
    if (!tierBelongsToProduct(product.productCode, product.tierCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requestedProducts', index, 'tierCode'],
        message: 'product tier must belong to selected product',
      });
    }

    if (seenRequested.has(product.productCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requestedProducts', index, 'productCode'],
        message: 'requested products cannot be duplicated',
      });
    }
    seenRequested.add(product.productCode);

    if (seenActive.has(product.productCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requestedProducts', index, 'productCode'],
        message: 'a product cannot be both active and requested',
      });
    }
  }

  if (data.activeProducts !== undefined) {
    const activeCoreCount = activeProducts.filter((product) => isCoreProduct(product.productCode)).length;
    if (activeCoreCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeProducts'],
        message: 'at least one core product is required',
      });
    }
  }
}

const ownerSchema = z
  .object({
    existingUserId: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    password: z.string().min(8).optional(),
    first_name: optionalTextSchema,
    last_name: optionalTextSchema,
    phone_prefix: optionalTextSchema,
    phone: z.string().trim().optional(),
    display_name: optionalTextSchema,
    is_bookable: z.boolean().optional(),
  })
  .superRefine((owner, ctx) => {
    const hasExistingUser = typeof owner.existingUserId === 'string' && owner.existingUserId.trim().length > 0;
    if (hasExistingUser) return;

    if (!owner.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'owner.email is required when existingUserId is not provided',
      });
    }

    if (!owner.password || owner.password.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'owner.password must be at least 8 characters when existingUserId is not provided',
      });
    }

    const normalizedPhone = (owner.phone ?? '').replace(/\D/g, '');
    if (!normalizedPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'owner.phone is required when existingUserId is not provided',
      });
    }
  });

export const createSuperAdminShopSchema = z
  .object({
    name: requiredTextSchema,
    slug: optionalTextSchema,
    address: optionalTextSchema,
    phone_prefix: optionalTextSchema,
    phone: requiredTextSchema,
    email: z.string().trim().email().optional().nullable(),
    city: optionalTextSchema,
    state: optionalTextSchema,
    country_code: optionalTextSchema,
    timezone: optionalTextSchema,
    currency: currencySchema,
    latitude: optionalCoordinateSchema,
    longitude: optionalCoordinateSchema,
    company_type_id: z.number().int().positive(),
    plan: shopPlanSchema.optional(),
    billingCycle: billingCycleSchema,
    availableUntil: availableUntilSchema,
    pricePaid: z.number().min(0).nullable().optional(),
    isMarketplaceVisible: z.boolean(),
    activeProducts: z.array(activeProductSchema).optional(),
    requestedProducts: z.array(requestedProductSchema).optional(),
    note: z.string().trim().max(500).optional(),
    owner: ownerSchema,
  })
  .superRefine((data, ctx) => validateProductConfiguration(data, ctx))
  .strict();

export const updateSuperAdminShopSchema = z
  .object({
    name: requiredTextSchema.optional(),
    slug: z.string().trim().min(1).max(64).optional(),
    address: optionalTextSchema,
    phone_prefix: optionalTextSchema,
    phone: requiredTextSchema.optional(),
    email: z.string().trim().email().optional().nullable(),
    city: optionalTextSchema,
    state: optionalTextSchema,
    country_code: optionalTextSchema,
    timezone: optionalTextSchema,
    currency: currencySchema.optional(),
    latitude: optionalCoordinateSchema,
    longitude: optionalCoordinateSchema,
    company_type_id: z.number().int().positive().optional(),
    is_active: z.boolean().optional(),
    plan: shopPlanSchema.optional(),
    billingCycle: billingCycleSchema.optional(),
    availableUntil: availableUntilSchema.optional(),
    pricePaid: z.number().min(0).nullable().optional(),
    isMarketplaceVisible: z.boolean().optional(),
    activeProducts: z.array(activeProductSchema).optional(),
    requestedProducts: z.array(requestedProductSchema).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => validateProductConfiguration(data, ctx))
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export type CreateSuperAdminShopDTO = z.infer<typeof createSuperAdminShopSchema>;
export type UpdateSuperAdminShopDTO = z.infer<typeof updateSuperAdminShopSchema>;
