import { z } from 'zod';

const shopPlanSchema = z.enum(['STARTER', 'BUSINESS', 'PRO']);
const billingCycleSchema = z.enum(['MONTHLY', 'YEARLY']);

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
    plan: shopPlanSchema,
    billingCycle: billingCycleSchema,
    availableUntil: availableUntilSchema,
    pricePaid: z.number().min(0).nullable().optional(),
    isMarketplaceVisible: z.boolean(),
    reservations_enabled: z.boolean(),
    store_enabled: z.boolean(),
    owner: ownerSchema,
  })
  .refine((data) => data.reservations_enabled || data.store_enabled, {
    message: 'At least one company module must be enabled',
    path: ['reservations_enabled'],
  })
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
    reservations_enabled: z.boolean().optional(),
    store_enabled: z.boolean().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export type CreateSuperAdminShopDTO = z.infer<typeof createSuperAdminShopSchema>;
export type UpdateSuperAdminShopDTO = z.infer<typeof updateSuperAdminShopSchema>;
