"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitCommercePaymentProofSchema = exports.verifyPublicCommerceGuestCheckoutSchema = exports.resendPublicCommerceGuestCheckoutSchema = exports.startPublicCommerceGuestCheckoutSchema = exports.createPublicCommerceOrderSchema = exports.updateCommerceOrderNotesSchema = exports.updateCommerceOrderAssignSchema = exports.updateCommerceOrderDeliveryCostSchema = exports.updateCommerceOrderStatusSchema = exports.adminCommerceCatalogQuerySchema = exports.updateCommerceProductImageSchema = exports.reorderCommerceProductImagesSchema = exports.upsertCommercePromotionSchema = exports.updateCommerceComboSchema = exports.createCommerceComboSchema = exports.updateCommerceProductSchema = exports.createCommerceProductSchema = exports.reorderCommerceEntitiesSchema = exports.updateCommerceCategorySchema = exports.createCommerceCategorySchema = exports.updateCommercePointOfSaleSchema = exports.createCommercePointOfSaleSchema = exports.upsertCommerceStoreSchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const optionalTrimmedString = zod_1.z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional();
const nullableTrimmedString = zod_1.z
    .string()
    .trim()
    .transform((value) => value || null)
    .nullable()
    .optional();
const nullableIdString = zod_1.z
    .string()
    .trim()
    .transform((value) => value || null)
    .nullable()
    .optional();
const decimalNumber = zod_1.z.number().finite().nonnegative();
const optionalLatitudeNumber = zod_1.z.number().finite().min(-90).max(90).nullable().optional();
const optionalLongitudeNumber = zod_1.z.number().finite().min(-180).max(180).nullable().optional();
const commercePaymentMethodSchema = zod_1.z.enum(['CASH', 'QR', 'MANUAL']);
const commerceStatusFilterSchema = zod_1.z.enum(['ALL', 'ACTIVE', 'INACTIVE']);
const timeOfDaySchema = zod_1.z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'Hora inválida.');
const deliveryLocationMetaSchema = zod_1.z
    .object({
    provider: nullableTrimmedString,
    source: nullableTrimmedString,
    formattedAddress: nullableTrimmedString,
    mapboxPlaceId: nullableTrimmedString,
})
    .nullable()
    .optional();
function pickFirstDefined(...values) {
    for (const value of values) {
        if (value !== undefined)
            return value;
    }
    return undefined;
}
function getNormalizedActiveFlag(input) {
    return pickFirstDefined(input.is_active, input.active, input.visible);
}
function addActiveFlagConflictIssue(input, ctx) {
    const definedFlags = [input.is_active, input.active, input.visible].filter((value) => value !== undefined);
    if (definedFlags.length > 1 && new Set(definedFlags).size > 1) {
        ctx.addIssue({
            code: 'custom',
            message: 'active, visible e is_active no pueden tener valores distintos.',
            path: ['active'],
        });
    }
}
const rawCommercePromotionFieldsSchema = zod_1.z.object({
    regular_price: decimalNumber.nullable().optional(),
    regularPrice: decimalNumber.nullable().optional(),
    promo_price: decimalNumber.nullable().optional(),
    promoPrice: decimalNumber.nullable().optional(),
    promo_starts_at: zod_1.z.coerce.date().nullable().optional(),
    promoStartsAt: zod_1.z.coerce.date().nullable().optional(),
    promo_ends_at: zod_1.z.coerce.date().nullable().optional(),
    promoEndsAt: zod_1.z.coerce.date().nullable().optional(),
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
const commerceImageInputSchema = zod_1.z
    .object({
    id: zod_1.z.string().trim().optional(),
    image_url: zod_1.z.string().trim().min(1).optional(),
    imageUrl: zod_1.z.string().trim().min(1).optional(),
    alt_text: nullableTrimmedString,
    altText: nullableTrimmedString,
    sort_order: zod_1.z.number().int().nonnegative().optional(),
    sortOrder: zod_1.z.number().int().nonnegative().optional(),
    is_primary: zod_1.z.boolean().optional(),
    isPrimary: zod_1.z.boolean().optional(),
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
    image_url: pickFirstDefined(input.image_url, input.imageUrl),
    alt_text: pickFirstDefined(input.alt_text, input.altText),
    sort_order: pickFirstDefined(input.sort_order, input.sortOrder),
    is_primary: pickFirstDefined(input.is_primary, input.isPrimary),
}));
const commerceProductComboItemSchema = zod_1.z
    .object({
    componentProductId: zod_1.z.string().trim().min(1).optional(),
    productId: zod_1.z.string().trim().min(1).optional(),
    quantity: zod_1.z.number().int().positive(),
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
    componentProductId: pickFirstDefined(input.componentProductId, input.productId),
    quantity: input.quantity,
}));
const commerceComboItemSchema = zod_1.z
    .object({
    productId: zod_1.z.string().trim().min(1).optional(),
    componentProductId: zod_1.z.string().trim().min(1).optional(),
    quantity: zod_1.z.number().int().positive(),
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
    productId: pickFirstDefined(input.productId, input.componentProductId),
    quantity: input.quantity,
}));
const baseCommerceProductSchema = zod_1.z
    .object({
    category_id: nullableIdString,
    categoryId: nullableIdString,
    name: optionalTrimmedString,
    slug: optionalTrimmedString,
    description: nullableTrimmedString,
    product_type: zod_1.z.nativeEnum(client_1.CommerceProductType).optional(),
    productType: zod_1.z.nativeEnum(client_1.CommerceProductType).optional(),
    price: decimalNumber.optional(),
    regular_price: decimalNumber.nullable().optional(),
    regularPrice: decimalNumber.nullable().optional(),
    promo_price: decimalNumber.nullable().optional(),
    promoPrice: decimalNumber.nullable().optional(),
    promo_starts_at: zod_1.z.coerce.date().nullable().optional(),
    promoStartsAt: zod_1.z.coerce.date().nullable().optional(),
    promo_ends_at: zod_1.z.coerce.date().nullable().optional(),
    promoEndsAt: zod_1.z.coerce.date().nullable().optional(),
    promo_label: nullableTrimmedString,
    promoLabel: nullableTrimmedString,
    promotion: commercePromotionFieldsSchema.optional(),
    is_active: zod_1.z.boolean().optional(),
    active: zod_1.z.boolean().optional(),
    visible: zod_1.z.boolean().optional(),
    is_featured: zod_1.z.boolean().optional(),
    featured: zod_1.z.boolean().optional(),
    track_stock: zod_1.z.boolean().optional(),
    trackStock: zod_1.z.boolean().optional(),
    stock_quantity: zod_1.z.number().int().optional(),
    stockQuantity: zod_1.z.number().int().optional(),
    low_stock_threshold: zod_1.z.number().int().nonnegative().nullable().optional(),
    lowStockThreshold: zod_1.z.number().int().nonnegative().nullable().optional(),
    allow_out_of_stock_orders: zod_1.z.boolean().optional(),
    allowOutOfStockOrders: zod_1.z.boolean().optional(),
    available_for_pickup: zod_1.z.boolean().optional(),
    availableForPickup: zod_1.z.boolean().optional(),
    available_for_delivery: zod_1.z.boolean().optional(),
    availableForDelivery: zod_1.z.boolean().optional(),
    sort_order: zod_1.z.number().int().nonnegative().optional(),
    sortOrder: zod_1.z.number().int().nonnegative().optional(),
    images: zod_1.z.array(commerceImageInputSchema).optional(),
    combo_items: zod_1.z.array(commerceProductComboItemSchema).optional(),
    comboItems: zod_1.z.array(commerceProductComboItemSchema).optional(),
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
        regular_price: pickFirstDefined(input.regular_price, input.regularPrice, promotion?.regular_price),
        promo_price: pickFirstDefined(input.promo_price, input.promoPrice, promotion?.promo_price),
        promo_starts_at: pickFirstDefined(input.promo_starts_at, input.promoStartsAt, promotion?.promo_starts_at),
        promo_ends_at: pickFirstDefined(input.promo_ends_at, input.promoEndsAt, promotion?.promo_ends_at),
        promo_label: pickFirstDefined(input.promo_label, input.promoLabel, promotion?.promo_label),
        is_active: getNormalizedActiveFlag(input),
        is_featured: pickFirstDefined(input.is_featured, input.featured),
        track_stock: pickFirstDefined(input.track_stock, input.trackStock),
        stock_quantity: pickFirstDefined(input.stock_quantity, input.stockQuantity),
        low_stock_threshold: pickFirstDefined(input.low_stock_threshold, input.lowStockThreshold),
        allow_out_of_stock_orders: pickFirstDefined(input.allow_out_of_stock_orders, input.allowOutOfStockOrders),
        available_for_pickup: pickFirstDefined(input.available_for_pickup, input.availableForPickup),
        available_for_delivery: pickFirstDefined(input.available_for_delivery, input.availableForDelivery),
        sort_order: pickFirstDefined(input.sort_order, input.sortOrder),
        images: input.images,
        combo_items: pickFirstDefined(input.combo_items, input.comboItems),
    };
});
const baseCommerceComboSchema = zod_1.z
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
    promo_starts_at: zod_1.z.coerce.date().nullable().optional(),
    promoStartsAt: zod_1.z.coerce.date().nullable().optional(),
    promo_ends_at: zod_1.z.coerce.date().nullable().optional(),
    promoEndsAt: zod_1.z.coerce.date().nullable().optional(),
    promo_label: nullableTrimmedString,
    promoLabel: nullableTrimmedString,
    promotion: commercePromotionFieldsSchema.optional(),
    is_active: zod_1.z.boolean().optional(),
    active: zod_1.z.boolean().optional(),
    visible: zod_1.z.boolean().optional(),
    is_featured: zod_1.z.boolean().optional(),
    featured: zod_1.z.boolean().optional(),
    track_stock: zod_1.z.boolean().optional(),
    trackStock: zod_1.z.boolean().optional(),
    stock_quantity: zod_1.z.number().int().optional(),
    stockQuantity: zod_1.z.number().int().optional(),
    low_stock_threshold: zod_1.z.number().int().nonnegative().nullable().optional(),
    lowStockThreshold: zod_1.z.number().int().nonnegative().nullable().optional(),
    allow_out_of_stock_orders: zod_1.z.boolean().optional(),
    allowOutOfStockOrders: zod_1.z.boolean().optional(),
    available_for_pickup: zod_1.z.boolean().optional(),
    availableForPickup: zod_1.z.boolean().optional(),
    available_for_delivery: zod_1.z.boolean().optional(),
    availableForDelivery: zod_1.z.boolean().optional(),
    sort_order: zod_1.z.number().int().nonnegative().optional(),
    sortOrder: zod_1.z.number().int().nonnegative().optional(),
    items: zod_1.z.array(commerceComboItemSchema).optional(),
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
        regular_price: pickFirstDefined(input.regular_price, input.regularPrice, promotion?.regular_price),
        promo_price: pickFirstDefined(input.promo_price, input.promoPrice, promotion?.promo_price),
        promo_starts_at: pickFirstDefined(input.promo_starts_at, input.promoStartsAt, promotion?.promo_starts_at),
        promo_ends_at: pickFirstDefined(input.promo_ends_at, input.promoEndsAt, promotion?.promo_ends_at),
        promo_label: pickFirstDefined(input.promo_label, input.promoLabel, promotion?.promo_label),
        is_active: getNormalizedActiveFlag(input),
        is_featured: pickFirstDefined(input.is_featured, input.featured),
        track_stock: pickFirstDefined(input.track_stock, input.trackStock),
        stock_quantity: pickFirstDefined(input.stock_quantity, input.stockQuantity),
        low_stock_threshold: pickFirstDefined(input.low_stock_threshold, input.lowStockThreshold),
        allow_out_of_stock_orders: pickFirstDefined(input.allow_out_of_stock_orders, input.allowOutOfStockOrders),
        available_for_pickup: pickFirstDefined(input.available_for_pickup, input.availableForPickup),
        available_for_delivery: pickFirstDefined(input.available_for_delivery, input.availableForDelivery),
        sort_order: pickFirstDefined(input.sort_order, input.sortOrder),
        items: input.items,
    };
});
exports.upsertCommerceStoreSchema = zod_1.z.object({
    is_active: zod_1.z.boolean().optional(),
    fulfillment_mode: zod_1.z.nativeEnum(client_1.CommerceFulfillmentMode).optional(),
    scheduled_orders_enabled: zod_1.z.boolean().optional(),
    min_preparation_minutes: zod_1.z.number().int().nonnegative().nullable().optional(),
    max_schedule_days_ahead: zod_1.z.number().int().nonnegative().nullable().optional(),
    order_slots_enabled: zod_1.z.boolean().optional(),
    allow_cash_payment: zod_1.z.boolean().optional(),
    allow_qr_payment: zod_1.z.boolean().optional(),
    allow_manual_payment: zod_1.z.boolean().optional(),
    qr_image_url: nullableTrimmedString,
    payment_instructions: nullableTrimmedString,
    payment_proof_required: zod_1.z.boolean().optional(),
    payment_review_required: zod_1.z.boolean().optional(),
    delivery_cost_mode: zod_1.z.nativeEnum(client_1.CommerceDeliveryCostMode).optional(),
    fixed_delivery_cost: decimalNumber.nullable().optional(),
    delivery_instructions: nullableTrimmedString,
    pickup_points: zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().trim().optional(),
        name: zod_1.z.string().trim().min(1),
        address: nullableTrimmedString,
        map_url: nullableTrimmedString,
        instructions: nullableTrimmedString,
        is_active: zod_1.z.boolean().optional(),
        sort_order: zod_1.z.number().int().nonnegative().optional(),
    }))
        .optional(),
    order_schedule_slots: zod_1.z
        .array(zod_1.z
        .object({
        id: zod_1.z.string().trim().optional(),
        day_of_week: zod_1.z.number().int().min(0).max(6),
        start_time: timeOfDaySchema,
        end_time: timeOfDaySchema,
        is_active: zod_1.z.boolean().optional(),
        sort_order: zod_1.z.number().int().nonnegative().optional(),
    })
        .superRefine((input, ctx) => {
        if (input.start_time >= input.end_time) {
            ctx.addIssue({
                code: 'custom',
                message: 'La hora de fin debe ser mayor a la hora de inicio.',
                path: ['end_time'],
            });
        }
    }))
        .optional(),
});
const baseCommercePointOfSaleSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1),
    address: zod_1.z.string().trim().min(1),
    opening_time: timeOfDaySchema,
    closing_time: timeOfDaySchema,
    latitude: zod_1.z.number().finite().min(-90).max(90),
    longitude: zod_1.z.number().finite().min(-180).max(180),
    google_maps_url: zod_1.z.string().trim().url(),
    notes: nullableTrimmedString,
    is_active: zod_1.z.boolean().optional(),
    sort_order: zod_1.z.number().int().nonnegative().optional(),
});
function addPointOfSaleHoursIssue(input, ctx) {
    if (!input.opening_time || !input.closing_time)
        return;
    if (input.closing_time <= input.opening_time) {
        ctx.addIssue({
            code: 'custom',
            message: 'La hora de cierre debe ser mayor a la hora de apertura.',
            path: ['closing_time'],
        });
    }
}
exports.createCommercePointOfSaleSchema = baseCommercePointOfSaleSchema.superRefine(addPointOfSaleHoursIssue);
exports.updateCommercePointOfSaleSchema = baseCommercePointOfSaleSchema.partial().superRefine(addPointOfSaleHoursIssue);
exports.createCommerceCategorySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1),
    slug: zod_1.z.string().trim().min(1),
    description: nullableTrimmedString,
    image_url: nullableTrimmedString,
    is_active: zod_1.z.boolean().optional(),
    sort_order: zod_1.z.number().int().nonnegative().optional(),
});
exports.updateCommerceCategorySchema = exports.createCommerceCategorySchema.partial();
exports.reorderCommerceEntitiesSchema = zod_1.z.object({
    ids: zod_1.z.array(zod_1.z.string().trim().min(1)).min(1),
});
exports.createCommerceProductSchema = baseCommerceProductSchema.superRefine((input, ctx) => {
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
exports.updateCommerceProductSchema = baseCommerceProductSchema;
exports.createCommerceComboSchema = baseCommerceComboSchema.superRefine((input, ctx) => {
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
exports.updateCommerceComboSchema = baseCommerceComboSchema;
exports.upsertCommercePromotionSchema = rawCommercePromotionFieldsSchema
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
exports.reorderCommerceProductImagesSchema = zod_1.z
    .object({
    image_ids: zod_1.z.array(zod_1.z.string().trim().min(1)).min(1).optional(),
    imageIds: zod_1.z.array(zod_1.z.string().trim().min(1)).min(1).optional(),
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
    image_ids: pickFirstDefined(input.image_ids, input.imageIds),
}));
exports.updateCommerceProductImageSchema = zod_1.z
    .object({
    alt_text: nullableTrimmedString,
    altText: nullableTrimmedString,
})
    .transform((input) => ({
    alt_text: pickFirstDefined(input.alt_text, input.altText),
}));
exports.adminCommerceCatalogQuerySchema = zod_1.z
    .object({
    search: optionalTrimmedString,
    category_id: zod_1.z.string().trim().min(1).optional(),
    categoryId: zod_1.z.string().trim().min(1).optional(),
    status: commerceStatusFilterSchema.optional(),
    product_type: zod_1.z.nativeEnum(client_1.CommerceProductType).optional(),
    productType: zod_1.z.nativeEnum(client_1.CommerceProductType).optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional(),
})
    .transform((input) => ({
    search: input.search,
    category_id: pickFirstDefined(input.category_id, input.categoryId),
    status: input.status,
    product_type: pickFirstDefined(input.product_type, input.productType),
    page: input.page,
    limit: input.limit,
}));
exports.updateCommerceOrderStatusSchema = zod_1.z.object({
    payment_status: zod_1.z.nativeEnum(client_1.CommercePaymentStatus).nullable().optional(),
    fulfillment_status: zod_1.z.nativeEnum(client_1.CommerceFulfillmentStatus).nullable().optional(),
    note: nullableTrimmedString,
});
exports.updateCommerceOrderDeliveryCostSchema = zod_1.z.object({
    deliveryCost: decimalNumber,
    note: nullableTrimmedString,
});
exports.updateCommerceOrderAssignSchema = zod_1.z.object({
    assignedStaffId: zod_1.z.number().int().positive().nullable().optional(),
    note: nullableTrimmedString,
});
exports.updateCommerceOrderNotesSchema = zod_1.z.object({
    internal_notes: nullableTrimmedString,
});
exports.createPublicCommerceOrderSchema = zod_1.z.object({
    customerName: zod_1.z.string().trim().min(1),
    customerPhone: zod_1.z.string().trim().min(5),
    customerPhonePrefix: zod_1.z.string().trim().min(1),
    customerCountryCode: optionalTrimmedString,
    customerEmail: zod_1.z.string().trim().email(),
    fulfillmentType: zod_1.z.nativeEnum(client_1.CommerceFulfillmentType),
    pickupPointId: zod_1.z.string().trim().nullable().optional(),
    deliveryAddress: nullableTrimmedString,
    deliveryNotes: nullableTrimmedString,
    deliveryLatitude: optionalLatitudeNumber,
    deliveryLongitude: optionalLongitudeNumber,
    deliveryPlaceId: nullableTrimmedString,
    deliveryLocationMeta: deliveryLocationMetaSchema,
    scheduledFor: zod_1.z.coerce.date().nullable().optional(),
    customerNotes: nullableTrimmedString,
    paymentMethod: commercePaymentMethodSchema,
    paymentProofUrl: nullableTrimmedString,
    items: zod_1.z
        .array(zod_1.z.object({
        productId: zod_1.z.string().trim().min(1),
        quantity: zod_1.z.number().int().positive(),
    }))
        .min(1),
});
exports.startPublicCommerceGuestCheckoutSchema = zod_1.z.object({
    customerName: zod_1.z.string().trim().min(1),
    customerPhone: zod_1.z.string().trim().min(5),
    customerPhonePrefix: zod_1.z.string().trim().min(1),
    customerCountryCode: optionalTrimmedString,
    customerEmail: zod_1.z.string().trim().email(),
});
exports.resendPublicCommerceGuestCheckoutSchema = zod_1.z.object({
    checkout_session_id: zod_1.z.string().trim().min(1),
});
exports.verifyPublicCommerceGuestCheckoutSchema = zod_1.z.object({
    checkout_session_id: zod_1.z.string().trim().min(1),
    code: zod_1.z.string().trim().min(1),
});
exports.submitCommercePaymentProofSchema = zod_1.z.object({
    paymentProofUrl: zod_1.z.string().trim().min(1),
});
