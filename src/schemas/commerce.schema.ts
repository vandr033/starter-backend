import {
    CommerceDeliveryCostMode,
    CommerceFulfillmentMode,
    CommerceFulfillmentStatus,
    CommerceFulfillmentType,
    CommercePaymentStatus,
    CommerceProductType,
} from '@prisma/client';
import { z } from 'zod';

const optionalTrimmedString = z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional();

const nullableTrimmedString = z
    .string()
    .trim()
    .transform((value) => value || null)
    .nullable()
    .optional();

const nullableIdString = z
    .string()
    .trim()
    .transform((value) => value || null)
    .nullable()
    .optional();

const decimalNumber = z.number().finite().nonnegative();
const optionalLatitudeNumber = z.number().finite().min(-90).max(90).nullable().optional();
const optionalLongitudeNumber = z.number().finite().min(-180).max(180).nullable().optional();
const commercePaymentMethodSchema = z.enum(['CASH', 'QR', 'MANUAL']);
const commerceStatusFilterSchema = z.enum(['ALL', 'ACTIVE', 'INACTIVE']);
const timeOfDaySchema = z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'Hora inválida.');

const deliveryLocationMetaSchema = z
    .object({
        provider: nullableTrimmedString,
        source: nullableTrimmedString,
        formattedAddress: nullableTrimmedString,
        mapboxPlaceId: nullableTrimmedString,
    })
    .nullable()
    .optional();

function pickFirstDefined<T>(...values: Array<T | undefined>): T | undefined {
    for (const value of values) {
        if (value !== undefined) return value;
    }

    return undefined;
}

function getNormalizedActiveFlag(input: {
    is_active?: boolean;
    active?: boolean;
    visible?: boolean;
}) {
    return pickFirstDefined(input.is_active, input.active, input.visible);
}

function addActiveFlagConflictIssue(
    input: {
        is_active?: boolean;
        active?: boolean;
        visible?: boolean;
    },
    ctx: z.RefinementCtx,
) {
    const definedFlags = [input.is_active, input.active, input.visible].filter(
        (value): value is boolean => value !== undefined,
    );

    if (definedFlags.length > 1 && new Set(definedFlags).size > 1) {
        ctx.addIssue({
            code: 'custom',
            message: 'active, visible e is_active no pueden tener valores distintos.',
            path: ['active'],
        });
    }
}

const rawCommercePromotionFieldsSchema = z.object({
    regular_price: decimalNumber.nullable().optional(),
    regularPrice: decimalNumber.nullable().optional(),
    promo_price: decimalNumber.nullable().optional(),
    promoPrice: decimalNumber.nullable().optional(),
    promo_starts_at: z.coerce.date().nullable().optional(),
    promoStartsAt: z.coerce.date().nullable().optional(),
    promo_ends_at: z.coerce.date().nullable().optional(),
    promoEndsAt: z.coerce.date().nullable().optional(),
    promo_label: nullableTrimmedString,
    promoLabel: nullableTrimmedString,
});

const commercePromotionFieldsSchema = rawCommercePromotionFieldsSchema.transform((input) => ({
    regular_price: pickFirstDefined(input.regular_price, input.regularPrice),
    promo_price: pickFirstDefined(input.promo_price, input.promoPrice),
    promo_starts_at: pickFirstDefined(input.promo_starts_at, input.promoStartsAt),
    promo_ends_at: pickFirstDefined(input.promo_ends_at, input.promoEndsAt),
    promo_label: pickFirstDefined(input.promo_label, input.promoLabel),
}));

const commerceImageInputSchema = z
    .object({
        id: z.string().trim().optional(),
        image_url: z.string().trim().min(1).optional(),
        imageUrl: z.string().trim().min(1).optional(),
        alt_text: nullableTrimmedString,
        altText: nullableTrimmedString,
        sort_order: z.number().int().nonnegative().optional(),
        sortOrder: z.number().int().nonnegative().optional(),
        is_primary: z.boolean().optional(),
        isPrimary: z.boolean().optional(),
    })
    .superRefine((input, ctx) => {
        if (!pickFirstDefined(input.image_url, input.imageUrl)) {
            ctx.addIssue({
                code: 'custom',
                message: 'image_url es obligatorio.',
                path: ['image_url'],
            });
        }
    })
    .transform((input) => ({
        id: input.id,
        image_url: pickFirstDefined(input.image_url, input.imageUrl)!,
        alt_text: pickFirstDefined(input.alt_text, input.altText),
        sort_order: pickFirstDefined(input.sort_order, input.sortOrder),
        is_primary: pickFirstDefined(input.is_primary, input.isPrimary),
    }));

const commerceProductComboItemSchema = z
    .object({
        componentProductId: z.string().trim().min(1).optional(),
        productId: z.string().trim().min(1).optional(),
        quantity: z.number().int().positive(),
    })
    .superRefine((input, ctx) => {
        if (!pickFirstDefined(input.componentProductId, input.productId)) {
            ctx.addIssue({
                code: 'custom',
                message: 'componentProductId es obligatorio.',
                path: ['componentProductId'],
            });
        }
    })
    .transform((input) => ({
        componentProductId: pickFirstDefined(input.componentProductId, input.productId)!,
        quantity: input.quantity,
    }));

const commerceComboItemSchema = z
    .object({
        productId: z.string().trim().min(1).optional(),
        componentProductId: z.string().trim().min(1).optional(),
        quantity: z.number().int().positive(),
    })
    .superRefine((input, ctx) => {
        if (!pickFirstDefined(input.productId, input.componentProductId)) {
            ctx.addIssue({
                code: 'custom',
                message: 'productId es obligatorio.',
                path: ['productId'],
            });
        }
    })
    .transform((input) => ({
        productId: pickFirstDefined(input.productId, input.componentProductId)!,
        quantity: input.quantity,
    }));

const baseCommerceProductSchema = z
    .object({
        category_id: nullableIdString,
        categoryId: nullableIdString,
        name: optionalTrimmedString,
        slug: optionalTrimmedString,
        description: nullableTrimmedString,
        product_type: z.nativeEnum(CommerceProductType).optional(),
        productType: z.nativeEnum(CommerceProductType).optional(),
        price: decimalNumber.optional(),
        regular_price: decimalNumber.nullable().optional(),
        regularPrice: decimalNumber.nullable().optional(),
        promo_price: decimalNumber.nullable().optional(),
        promoPrice: decimalNumber.nullable().optional(),
        promo_starts_at: z.coerce.date().nullable().optional(),
        promoStartsAt: z.coerce.date().nullable().optional(),
        promo_ends_at: z.coerce.date().nullable().optional(),
        promoEndsAt: z.coerce.date().nullable().optional(),
        promo_label: nullableTrimmedString,
        promoLabel: nullableTrimmedString,
        promotion: commercePromotionFieldsSchema.optional(),
        is_active: z.boolean().optional(),
        active: z.boolean().optional(),
        visible: z.boolean().optional(),
        is_featured: z.boolean().optional(),
        featured: z.boolean().optional(),
        track_stock: z.boolean().optional(),
        trackStock: z.boolean().optional(),
        stock_quantity: z.number().int().optional(),
        stockQuantity: z.number().int().optional(),
        low_stock_threshold: z.number().int().nonnegative().nullable().optional(),
        lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
        allow_out_of_stock_orders: z.boolean().optional(),
        allowOutOfStockOrders: z.boolean().optional(),
        available_for_pickup: z.boolean().optional(),
        availableForPickup: z.boolean().optional(),
        available_for_delivery: z.boolean().optional(),
        availableForDelivery: z.boolean().optional(),
        sort_order: z.number().int().nonnegative().optional(),
        sortOrder: z.number().int().nonnegative().optional(),
        images: z.array(commerceImageInputSchema).optional(),
        combo_items: z.array(commerceProductComboItemSchema).optional(),
        comboItems: z.array(commerceProductComboItemSchema).optional(),
    })
    .superRefine((input, ctx) => addActiveFlagConflictIssue(input, ctx))
    .transform((input) => {
        const promotion = input.promotion;

        return {
            category_id: pickFirstDefined(input.category_id, input.categoryId),
            name: input.name,
            slug: input.slug,
            description: input.description,
            product_type: pickFirstDefined(input.product_type, input.productType),
            price: input.price,
            regular_price: pickFirstDefined(
                input.regular_price,
                input.regularPrice,
                promotion?.regular_price,
            ),
            promo_price: pickFirstDefined(
                input.promo_price,
                input.promoPrice,
                promotion?.promo_price,
            ),
            promo_starts_at: pickFirstDefined(
                input.promo_starts_at,
                input.promoStartsAt,
                promotion?.promo_starts_at,
            ),
            promo_ends_at: pickFirstDefined(
                input.promo_ends_at,
                input.promoEndsAt,
                promotion?.promo_ends_at,
            ),
            promo_label: pickFirstDefined(
                input.promo_label,
                input.promoLabel,
                promotion?.promo_label,
            ),
            is_active: getNormalizedActiveFlag(input),
            is_featured: pickFirstDefined(input.is_featured, input.featured),
            track_stock: pickFirstDefined(input.track_stock, input.trackStock),
            stock_quantity: pickFirstDefined(input.stock_quantity, input.stockQuantity),
            low_stock_threshold: pickFirstDefined(
                input.low_stock_threshold,
                input.lowStockThreshold,
            ),
            allow_out_of_stock_orders: pickFirstDefined(
                input.allow_out_of_stock_orders,
                input.allowOutOfStockOrders,
            ),
            available_for_pickup: pickFirstDefined(
                input.available_for_pickup,
                input.availableForPickup,
            ),
            available_for_delivery: pickFirstDefined(
                input.available_for_delivery,
                input.availableForDelivery,
            ),
            sort_order: pickFirstDefined(input.sort_order, input.sortOrder),
            images: input.images,
            combo_items: pickFirstDefined(input.combo_items, input.comboItems),
        };
    });

const baseCommerceComboSchema = z
    .object({
        category_id: nullableIdString,
        categoryId: nullableIdString,
        name: optionalTrimmedString,
        slug: optionalTrimmedString,
        description: nullableTrimmedString,
        price: decimalNumber.optional(),
        regular_price: decimalNumber.nullable().optional(),
        regularPrice: decimalNumber.nullable().optional(),
        promo_price: decimalNumber.nullable().optional(),
        promoPrice: decimalNumber.nullable().optional(),
        promo_starts_at: z.coerce.date().nullable().optional(),
        promoStartsAt: z.coerce.date().nullable().optional(),
        promo_ends_at: z.coerce.date().nullable().optional(),
        promoEndsAt: z.coerce.date().nullable().optional(),
        promo_label: nullableTrimmedString,
        promoLabel: nullableTrimmedString,
        promotion: commercePromotionFieldsSchema.optional(),
        is_active: z.boolean().optional(),
        active: z.boolean().optional(),
        visible: z.boolean().optional(),
        is_featured: z.boolean().optional(),
        featured: z.boolean().optional(),
        track_stock: z.boolean().optional(),
        trackStock: z.boolean().optional(),
        stock_quantity: z.number().int().optional(),
        stockQuantity: z.number().int().optional(),
        low_stock_threshold: z.number().int().nonnegative().nullable().optional(),
        lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
        allow_out_of_stock_orders: z.boolean().optional(),
        allowOutOfStockOrders: z.boolean().optional(),
        available_for_pickup: z.boolean().optional(),
        availableForPickup: z.boolean().optional(),
        available_for_delivery: z.boolean().optional(),
        availableForDelivery: z.boolean().optional(),
        sort_order: z.number().int().nonnegative().optional(),
        sortOrder: z.number().int().nonnegative().optional(),
        items: z.array(commerceComboItemSchema).optional(),
    })
    .superRefine((input, ctx) => addActiveFlagConflictIssue(input, ctx))
    .transform((input) => {
        const promotion = input.promotion;

        return {
            category_id: pickFirstDefined(input.category_id, input.categoryId),
            name: input.name,
            slug: input.slug,
            description: input.description,
            price: input.price,
            regular_price: pickFirstDefined(
                input.regular_price,
                input.regularPrice,
                promotion?.regular_price,
            ),
            promo_price: pickFirstDefined(
                input.promo_price,
                input.promoPrice,
                promotion?.promo_price,
            ),
            promo_starts_at: pickFirstDefined(
                input.promo_starts_at,
                input.promoStartsAt,
                promotion?.promo_starts_at,
            ),
            promo_ends_at: pickFirstDefined(
                input.promo_ends_at,
                input.promoEndsAt,
                promotion?.promo_ends_at,
            ),
            promo_label: pickFirstDefined(
                input.promo_label,
                input.promoLabel,
                promotion?.promo_label,
            ),
            is_active: getNormalizedActiveFlag(input),
            is_featured: pickFirstDefined(input.is_featured, input.featured),
            track_stock: pickFirstDefined(input.track_stock, input.trackStock),
            stock_quantity: pickFirstDefined(input.stock_quantity, input.stockQuantity),
            low_stock_threshold: pickFirstDefined(
                input.low_stock_threshold,
                input.lowStockThreshold,
            ),
            allow_out_of_stock_orders: pickFirstDefined(
                input.allow_out_of_stock_orders,
                input.allowOutOfStockOrders,
            ),
            available_for_pickup: pickFirstDefined(
                input.available_for_pickup,
                input.availableForPickup,
            ),
            available_for_delivery: pickFirstDefined(
                input.available_for_delivery,
                input.availableForDelivery,
            ),
            sort_order: pickFirstDefined(input.sort_order, input.sortOrder),
            items: input.items,
        };
    });

export const upsertCommerceStoreSchema = z.object({
    is_active: z.boolean().optional(),
    fulfillment_mode: z.nativeEnum(CommerceFulfillmentMode).optional(),
    scheduled_orders_enabled: z.boolean().optional(),
    min_preparation_minutes: z.number().int().nonnegative().nullable().optional(),
    max_schedule_days_ahead: z.number().int().nonnegative().nullable().optional(),
    order_slots_enabled: z.boolean().optional(),
    allow_cash_payment: z.boolean().optional(),
    allow_qr_payment: z.boolean().optional(),
    allow_manual_payment: z.boolean().optional(),
    qr_image_url: nullableTrimmedString,
    payment_instructions: nullableTrimmedString,
    payment_proof_required: z.boolean().optional(),
    payment_review_required: z.boolean().optional(),
    delivery_cost_mode: z.nativeEnum(CommerceDeliveryCostMode).optional(),
    fixed_delivery_cost: decimalNumber.nullable().optional(),
    delivery_instructions: nullableTrimmedString,
    pickup_points: z
        .array(
            z.object({
                id: z.string().trim().optional(),
                name: z.string().trim().min(1),
                address: nullableTrimmedString,
                map_url: nullableTrimmedString,
                instructions: nullableTrimmedString,
                is_active: z.boolean().optional(),
                sort_order: z.number().int().nonnegative().optional(),
            }),
        )
        .optional(),
    order_schedule_slots: z
        .array(
            z
                .object({
                    id: z.string().trim().optional(),
                    day_of_week: z.number().int().min(0).max(6),
                    start_time: timeOfDaySchema,
                    end_time: timeOfDaySchema,
                    is_active: z.boolean().optional(),
                    sort_order: z.number().int().nonnegative().optional(),
                })
                .superRefine((input, ctx) => {
                    if (input.start_time >= input.end_time) {
                        ctx.addIssue({
                            code: 'custom',
                            message: 'La hora de fin debe ser mayor a la hora de inicio.',
                            path: ['end_time'],
                        });
                    }
                }),
        )
        .optional(),
});

const baseCommercePointOfSaleSchema = z.object({
    name: z.string().trim().min(1),
    address: z.string().trim().min(1),
    opening_time: timeOfDaySchema,
    closing_time: timeOfDaySchema,
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    google_maps_url: z.string().trim().url(),
    notes: nullableTrimmedString,
    is_active: z.boolean().optional(),
    sort_order: z.number().int().nonnegative().optional(),
});

function addPointOfSaleHoursIssue(
    input: {
        opening_time?: string;
        closing_time?: string;
    },
    ctx: z.RefinementCtx,
) {
    if (!input.opening_time || !input.closing_time) return;

    if (input.closing_time <= input.opening_time) {
        ctx.addIssue({
            code: 'custom',
            message: 'La hora de cierre debe ser mayor a la hora de apertura.',
            path: ['closing_time'],
        });
    }
}

export const createCommercePointOfSaleSchema = baseCommercePointOfSaleSchema.superRefine(addPointOfSaleHoursIssue);

export const updateCommercePointOfSaleSchema = baseCommercePointOfSaleSchema.partial().superRefine(addPointOfSaleHoursIssue);

export const createCommerceCategorySchema = z.object({
    name: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    description: nullableTrimmedString,
    image_url: nullableTrimmedString,
    is_active: z.boolean().optional(),
    sort_order: z.number().int().nonnegative().optional(),
});

export const updateCommerceCategorySchema = createCommerceCategorySchema.partial();

export const reorderCommerceEntitiesSchema = z.object({
    ids: z.array(z.string().trim().min(1)).min(1),
});

export const createCommerceProductSchema = baseCommerceProductSchema.superRefine((input, ctx) => {
    if (input.name === undefined) {
        ctx.addIssue({
            code: 'custom',
            message: 'El nombre es obligatorio.',
            path: ['name'],
        });
    }

    if (input.slug === undefined) {
        ctx.addIssue({
            code: 'custom',
            message: 'El slug es obligatorio.',
            path: ['slug'],
        });
    }

    if (input.price === undefined) {
        ctx.addIssue({
            code: 'custom',
            message: 'El precio es obligatorio.',
            path: ['price'],
        });
    }
});

export const updateCommerceProductSchema = baseCommerceProductSchema;

export const createCommerceComboSchema = baseCommerceComboSchema.superRefine((input, ctx) => {
    if (input.name === undefined) {
        ctx.addIssue({
            code: 'custom',
            message: 'El nombre es obligatorio.',
            path: ['name'],
        });
    }

    if (input.slug === undefined) {
        ctx.addIssue({
            code: 'custom',
            message: 'El slug es obligatorio.',
            path: ['slug'],
        });
    }

    if (input.price === undefined) {
        ctx.addIssue({
            code: 'custom',
            message: 'El precio es obligatorio.',
            path: ['price'],
        });
    }

    if (!input.items || input.items.length === 0) {
        ctx.addIssue({
            code: 'custom',
            message: 'El combo debe tener al menos un item.',
            path: ['items'],
        });
    }
});

export const updateCommerceComboSchema = baseCommerceComboSchema;

export const upsertCommercePromotionSchema = rawCommercePromotionFieldsSchema
    .superRefine((input, ctx) => {
        if (pickFirstDefined(input.promo_price, input.promoPrice) === undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'promoPrice es obligatorio.',
                path: ['promoPrice'],
            });
        }
    })
    .transform((input) => ({
        regular_price: pickFirstDefined(input.regular_price, input.regularPrice),
        promo_price: pickFirstDefined(input.promo_price, input.promoPrice, null),
        promo_starts_at: pickFirstDefined(input.promo_starts_at, input.promoStartsAt),
        promo_ends_at: pickFirstDefined(input.promo_ends_at, input.promoEndsAt),
        promo_label: pickFirstDefined(input.promo_label, input.promoLabel),
    }));

export const reorderCommerceProductImagesSchema = z
    .object({
        image_ids: z.array(z.string().trim().min(1)).min(1).optional(),
        imageIds: z.array(z.string().trim().min(1)).min(1).optional(),
    })
    .superRefine((input, ctx) => {
        if (!pickFirstDefined(input.image_ids, input.imageIds)) {
            ctx.addIssue({
                code: 'custom',
                message: 'image_ids es obligatorio.',
                path: ['image_ids'],
            });
        }
    })
    .transform((input) => ({
        image_ids: pickFirstDefined(input.image_ids, input.imageIds)!,
    }));

export const updateCommerceProductImageSchema = z
    .object({
        alt_text: nullableTrimmedString,
        altText: nullableTrimmedString,
    })
    .transform((input) => ({
        alt_text: pickFirstDefined(input.alt_text, input.altText),
    }));

export const adminCommerceCatalogQuerySchema = z
    .object({
        search: optionalTrimmedString,
        category_id: z.string().trim().min(1).optional(),
        categoryId: z.string().trim().min(1).optional(),
        status: commerceStatusFilterSchema.optional(),
        product_type: z.nativeEnum(CommerceProductType).optional(),
        productType: z.nativeEnum(CommerceProductType).optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .transform((input) => ({
        search: input.search,
        category_id: pickFirstDefined(input.category_id, input.categoryId),
        status: input.status,
        product_type: pickFirstDefined(input.product_type, input.productType),
        page: input.page,
        limit: input.limit,
    }));

export const updateCommerceOrderStatusSchema = z.object({
    payment_status: z.nativeEnum(CommercePaymentStatus).nullable().optional(),
    fulfillment_status: z.nativeEnum(CommerceFulfillmentStatus).nullable().optional(),
    note: nullableTrimmedString,
});

export const updateCommerceOrderDeliveryCostSchema = z.object({
    deliveryCost: decimalNumber,
    note: nullableTrimmedString,
});

export const updateCommerceOrderAssignSchema = z.object({
    assignedStaffId: z.number().int().positive().nullable().optional(),
    note: nullableTrimmedString,
});

export const updateCommerceOrderNotesSchema = z.object({
    internal_notes: nullableTrimmedString,
});

export const createPublicCommerceOrderSchema = z.object({
    customerName: z.string().trim().min(1),
    customerPhone: z.string().trim().min(5),
    customerPhonePrefix: z.string().trim().min(1),
    customerCountryCode: optionalTrimmedString,
    customerEmail: z.string().trim().email(),
    fulfillmentType: z.nativeEnum(CommerceFulfillmentType),
    pickupPointId: z.string().trim().nullable().optional(),
    deliveryAddress: nullableTrimmedString,
    deliveryNotes: nullableTrimmedString,
    deliveryLatitude: optionalLatitudeNumber,
    deliveryLongitude: optionalLongitudeNumber,
    deliveryPlaceId: nullableTrimmedString,
    deliveryLocationMeta: deliveryLocationMetaSchema,
    scheduledFor: z.coerce.date().nullable().optional(),
    customerNotes: nullableTrimmedString,
    paymentMethod: commercePaymentMethodSchema,
    paymentProofUrl: nullableTrimmedString,
    items: z
        .array(
            z.object({
                productId: z.string().trim().min(1),
                quantity: z.number().int().positive(),
            }),
        )
        .min(1),
});

export const startPublicCommerceGuestCheckoutSchema = z.object({
    customerName: z.string().trim().min(1),
    customerPhone: z.string().trim().min(5),
    customerPhonePrefix: z.string().trim().min(1),
    customerCountryCode: optionalTrimmedString,
    customerEmail: z.string().trim().email(),
});

export const resendPublicCommerceGuestCheckoutSchema = z.object({
    checkout_session_id: z.string().trim().min(1),
});

export const verifyPublicCommerceGuestCheckoutSchema = z.object({
    checkout_session_id: z.string().trim().min(1),
    code: z.string().trim().min(1),
});

export const submitCommercePaymentProofSchema = z.object({
    paymentProofUrl: z.string().trim().min(1),
});
