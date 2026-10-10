"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCommerceProducts = listCommerceProducts;
exports.getCommerceProduct = getCommerceProduct;
exports.createCommerceProduct = createCommerceProduct;
exports.updateCommerceProduct = updateCommerceProduct;
exports.deleteCommerceProduct = deleteCommerceProduct;
exports.reorderCommerceProducts = reorderCommerceProducts;
exports.uploadCommerceProductImage = uploadCommerceProductImage;
exports.setCommerceProductPrimaryImage = setCommerceProductPrimaryImage;
exports.reorderCommerceProductImages = reorderCommerceProductImages;
exports.updateCommerceProductImage = updateCommerceProductImage;
exports.deleteCommerceProductImage = deleteCommerceProductImage;
exports.upsertCommerceProductPromotion = upsertCommerceProductPromotion;
exports.removeCommerceProductPromotion = removeCommerceProductPromotion;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const storage_service_1 = require("./storage.service");
const commerce_combo_service_1 = require("./commerce-combo.service");
const commerce_pricing_service_1 = require("./commerce-pricing.service");
const CommerceRepo = __importStar(require("../repositories/commerce.repo"));
const PRODUCT_IMAGE_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
};
const STORAGE_API_PREFIX = '/api/storage/';
const adminProductInclude = {
    category: true,
    images: {
        orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    },
    combo_items: {
        orderBy: [{ created_at: 'asc' }],
        include: {
            component_product: {
                include: {
                    category: true,
                    images: {
                        where: { is_primary: true },
                        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
                        take: 1,
                    },
                },
            },
        },
    },
};
function toStorageRelativePath(rawUrl) {
    if (!rawUrl)
        return null;
    let normalized = rawUrl.trim();
    if (!normalized)
        return null;
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        try {
            normalized = new URL(normalized).pathname;
        }
        catch {
            return null;
        }
    }
    const pathWithoutQuery = normalized.split(/[?#]/, 1)[0];
    if (!pathWithoutQuery)
        return null;
    if (pathWithoutQuery.startsWith(STORAGE_API_PREFIX)) {
        return pathWithoutQuery.slice(STORAGE_API_PREFIX.length);
    }
    const uploadsIndex = pathWithoutQuery.indexOf('/uploads/');
    if (uploadsIndex >= 0) {
        return pathWithoutQuery.slice(uploadsIndex + 1);
    }
    return null;
}
function isCompanyStorageUrl(rawUrl, companyId) {
    const relativePath = toStorageRelativePath(rawUrl);
    return relativePath?.startsWith(`uploads/${companyId}/`) ?? false;
}
function buildVersionedCommerceFilename(prefix, extension) {
    const version = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return `${prefix}-${version}.${extension}`;
}
function parseOptionalInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value))
        return value;
    if (typeof value !== 'string')
        return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
}
function parseOptionalBoolean(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true')
        return true;
    if (normalized === 'false')
        return false;
    return undefined;
}
function buildProductTypeMessage(productType) {
    return productType === client_1.CommerceProductType.COMBO ? 'combo' : 'producto';
}
function serializeComponentProduct(product) {
    if (!product)
        return null;
    return {
        ...product,
        price: product.price != null ? Number(product.price) : null,
        regular_price: product.regular_price != null ? Number(product.regular_price) : null,
        promo_price: product.promo_price != null ? Number(product.promo_price) : null,
        category_summary: product.category
            ? {
                id: product.category.id,
                name: product.category.name,
                slug: product.category.slug,
                is_active: product.category.is_active,
            }
            : null,
        primary_image: product.images?.[0]
            ? {
                id: product.images[0].id,
                image_url: product.images[0].image_url,
                alt_text: product.images[0].alt_text,
                sort_order: product.images[0].sort_order,
                is_primary: product.images[0].is_primary,
            }
            : null,
    };
}
function buildPromotionSummary(product) {
    const effective = (0, commerce_pricing_service_1.resolveEffectiveCommercePrice)({
        price: product.price,
        regularPrice: product.regular_price,
        promoPrice: product.promo_price,
        promoStartsAt: product.promo_starts_at,
        promoEndsAt: product.promo_ends_at,
        promoLabel: product.promo_label,
    });
    return {
        regular_price: effective.regularPrice ? Number(effective.regularPrice) : null,
        base_price: Number(effective.basePrice),
        final_price: Number(effective.finalPrice),
        promo_price: product.promo_price != null ? Number(product.promo_price) : null,
        promo_applied: effective.promoApplied,
        promo_label: effective.promoLabel,
        promo_starts_at: effective.promoStartsAt,
        promo_ends_at: effective.promoEndsAt,
    };
}
function buildStockSummary(product) {
    const comboAvailableUnits = product.product_type === client_1.CommerceProductType.COMBO
        ? (0, commerce_combo_service_1.computeComboAvailableUnits)({
            items: product.combo_items.map((item) => ({
                quantity: item.quantity,
                componentProduct: {
                    track_stock: item.component_product.track_stock,
                    stock_quantity: item.component_product.stock_quantity,
                    allow_out_of_stock_orders: item.component_product.allow_out_of_stock_orders,
                },
            })),
        })
        : null;
    const availableUnits = product.product_type === client_1.CommerceProductType.COMBO
        ? comboAvailableUnits
        : product.track_stock
            ? product.stock_quantity
            : null;
    const inStock = product.product_type === client_1.CommerceProductType.COMBO
        ? availableUnits == null || availableUnits > 0
        : !product.track_stock || product.allow_out_of_stock_orders || product.stock_quantity > 0;
    const lowStockValue = availableUnits ?? product.stock_quantity;
    const isLowStock = product.low_stock_threshold != null &&
        product.track_stock &&
        lowStockValue <= product.low_stock_threshold;
    return {
        track_stock: product.track_stock,
        stock_quantity: product.stock_quantity,
        low_stock_threshold: product.low_stock_threshold,
        allow_out_of_stock_orders: product.allow_out_of_stock_orders,
        available_units: availableUnits,
        in_stock: inStock,
        is_low_stock: isLowStock,
    };
}
function serializeCommerceProduct(product, detail = false) {
    const promotionSummary = buildPromotionSummary(product);
    const stockSummary = buildStockSummary(product);
    const primaryImage = product.images.find((image) => image.is_primary) ?? product.images[0] ?? null;
    return {
        ...product,
        price: Number(product.price),
        regular_price: product.regular_price != null ? Number(product.regular_price) : null,
        promo_price: product.promo_price != null ? Number(product.promo_price) : null,
        pricing: promotionSummary,
        promotion_summary: promotionSummary.promo_applied ? promotionSummary : null,
        promotion: detail ? promotionSummary : undefined,
        stock_summary: stockSummary,
        fulfillment: detail
            ? {
                available_for_pickup: product.available_for_pickup,
                available_for_delivery: product.available_for_delivery,
            }
            : undefined,
        primary_image: primaryImage
            ? {
                id: primaryImage.id,
                image_url: primaryImage.image_url,
                alt_text: primaryImage.alt_text,
                sort_order: primaryImage.sort_order,
                is_primary: primaryImage.is_primary,
            }
            : null,
        category_summary: product.category
            ? {
                id: product.category.id,
                name: product.category.name,
                slug: product.category.slug,
                is_active: product.category.is_active,
            }
            : null,
        images: product.images.map((image) => ({
            ...image,
        })),
        combo_items: product.combo_items.map((item) => ({
            ...item,
            component_product: serializeComponentProduct(item.component_product),
        })),
    };
}
async function getProductRecord(companyId, productId, expectedType, tx = client_2.prisma) {
    return tx.commerceProduct.findFirst({
        where: {
            id: productId,
            company_id: companyId,
            ...(expectedType ? { product_type: expectedType } : {}),
        },
        include: adminProductInclude,
    });
}
async function ensureCategoryBelongsToCompany(tx, companyId, categoryId) {
    if (!categoryId)
        return null;
    const category = await tx.commerceCategory.findFirst({
        where: { id: categoryId, company_id: companyId },
        select: { id: true },
    });
    if (!category) {
        throw new Error('La categoría no existe o no pertenece a esta empresa.');
    }
    return category.id;
}
async function ensureUniqueProductSlug(tx, companyId, slug, excludeProductId) {
    if (!slug?.trim())
        return;
    const existing = await tx.commerceProduct.findFirst({
        where: {
            company_id: companyId,
            slug: slug.trim(),
            ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
        },
        select: { id: true },
    });
    if (existing) {
        throw new Error('Ya existe un producto o combo con este slug.');
    }
}
function validateFulfillmentFlags(input) {
    if (!input.available_for_pickup && !input.available_for_delivery) {
        return 'Debes habilitar pickup, delivery o ambos.';
    }
    return null;
}
function validateImagesOwnership(companyId, images) {
    if (!images)
        return null;
    for (const image of images) {
        if (!image.image_url?.trim()) {
            return 'Cada imagen debe tener una URL válida.';
        }
        if (!isCompanyStorageUrl(image.image_url, companyId)) {
            return 'Las imágenes del catálogo deben venir del almacenamiento de esta empresa.';
        }
    }
    return null;
}
async function replaceProductImages(tx, productId, images) {
    await tx.commerceProductImage.deleteMany({
        where: { product_id: productId },
    });
    if (images.length === 0)
        return;
    const normalized = images.map((image, index) => ({
        image_url: image.image_url,
        alt_text: image.alt_text ?? null,
        sort_order: image.sort_order ?? index,
        is_primary: image.is_primary ?? false,
    }));
    const hasPrimary = normalized.some((image) => image.is_primary);
    if (!hasPrimary) {
        normalized[0].is_primary = true;
    }
    await tx.commerceProductImage.createMany({
        data: normalized.map((image) => ({
            product_id: productId,
            image_url: image.image_url,
            alt_text: image.alt_text,
            sort_order: image.sort_order,
            is_primary: image.is_primary,
        })),
    });
}
async function replaceComboItems(tx, companyId, productId, items) {
    await tx.commerceComboItem.deleteMany({
        where: { combo_product_id: productId },
    });
    if (items.length === 0)
        return;
    const componentProducts = await tx.commerceProduct.findMany({
        where: {
            id: { in: items.map((item) => item.componentProductId) },
            company_id: companyId,
        },
        select: {
            id: true,
            name: true,
            product_type: true,
            is_active: true,
            track_stock: true,
            stock_quantity: true,
            allow_out_of_stock_orders: true,
        },
    });
    const comboError = (0, commerce_combo_service_1.validateCommerceComboDefinition)({
        comboProductId: productId,
        companyId,
        items,
        componentProducts,
    });
    if (comboError) {
        throw new Error(comboError);
    }
    await tx.commerceComboItem.createMany({
        data: items.map((item) => ({
            combo_product_id: productId,
            component_product_id: item.componentProductId,
            quantity: item.quantity,
        })),
    });
}
function buildProductUpdateData(input) {
    const data = {};
    if (Object.prototype.hasOwnProperty.call(input, 'category_id')) {
        data.category_id = input.category_id ?? null;
    }
    if (input.name !== undefined)
        data.name = input.name;
    if (input.slug !== undefined)
        data.slug = input.slug;
    if (Object.prototype.hasOwnProperty.call(input, 'description')) {
        data.description = input.description ?? null;
    }
    if (input.product_type !== undefined)
        data.product_type = input.product_type;
    if (input.price !== undefined)
        data.price = input.price;
    if (Object.prototype.hasOwnProperty.call(input, 'regular_price')) {
        data.regular_price = input.regular_price ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'promo_price')) {
        data.promo_price = input.promo_price ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'promo_starts_at')) {
        data.promo_starts_at = input.promo_starts_at ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'promo_ends_at')) {
        data.promo_ends_at = input.promo_ends_at ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'promo_label')) {
        data.promo_label = input.promo_label ?? null;
    }
    if (input.is_active !== undefined)
        data.is_active = input.is_active;
    if (input.is_featured !== undefined)
        data.is_featured = input.is_featured;
    if (input.track_stock !== undefined)
        data.track_stock = input.track_stock;
    if (input.stock_quantity !== undefined)
        data.stock_quantity = input.stock_quantity;
    if (Object.prototype.hasOwnProperty.call(input, 'low_stock_threshold')) {
        data.low_stock_threshold = input.low_stock_threshold ?? null;
    }
    if (input.allow_out_of_stock_orders !== undefined) {
        data.allow_out_of_stock_orders = input.allow_out_of_stock_orders;
    }
    if (input.available_for_pickup !== undefined) {
        data.available_for_pickup = input.available_for_pickup;
    }
    if (input.available_for_delivery !== undefined) {
        data.available_for_delivery = input.available_for_delivery;
    }
    if (input.sort_order !== undefined)
        data.sort_order = input.sort_order;
    return data;
}
function normalizeStockFields(input, existing) {
    const trackStock = input.track_stock ?? existing?.track_stock ?? true;
    return {
        track_stock: trackStock,
        stock_quantity: input.stock_quantity !== undefined
            ? input.stock_quantity
            : existing?.stock_quantity ?? 0,
        low_stock_threshold: Object.prototype.hasOwnProperty.call(input, 'low_stock_threshold')
            ? input.low_stock_threshold ?? null
            : existing?.low_stock_threshold ?? null,
        allow_out_of_stock_orders: input.allow_out_of_stock_orders ?? existing?.allow_out_of_stock_orders ?? false,
    };
}
function normalizeComboItemsForCreate(input) {
    return input.combo_items ?? [];
}
async function listCommerceProducts(companyId, filters = {}) {
    const where = {
        company_id: companyId,
        ...(filters.search
            ? {
                name: {
                    contains: filters.search,
                },
            }
            : {}),
        ...(filters.category_id ? { category_id: filters.category_id } : {}),
        ...(filters.status === 'ACTIVE'
            ? { is_active: true }
            : filters.status === 'INACTIVE'
                ? { is_active: false }
                : {}),
        ...(filters.product_type ? { product_type: filters.product_type } : {}),
    };
    const shouldPaginate = filters.page !== undefined || filters.limit !== undefined;
    const page = shouldPaginate ? Math.max(1, filters.page ?? 1) : 1;
    const limit = shouldPaginate ? Math.min(100, Math.max(1, filters.limit ?? 20)) : undefined;
    const skip = shouldPaginate && limit ? (page - 1) * limit : undefined;
    const [products, total] = await Promise.all([
        client_2.prisma.commerceProduct.findMany({
            where,
            include: adminProductInclude,
            orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
            ...(limit ? { skip, take: limit } : {}),
        }),
        shouldPaginate ? client_2.prisma.commerceProduct.count({ where }) : Promise.resolve(0),
    ]);
    return {
        code: 200,
        error: false,
        message: 'Productos obtenidos correctamente.',
        data: products.map((product) => serializeCommerceProduct(product)),
        ...(shouldPaginate && limit
            ? {
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                },
            }
            : {}),
    };
}
async function getCommerceProduct(companyId, productId, expectedType) {
    const product = await getProductRecord(companyId, productId, expectedType);
    if (!product) {
        return {
            code: 404,
            error: true,
            message: `No encontramos el ${buildProductTypeMessage(expectedType ?? client_1.CommerceProductType.SIMPLE)}.`,
        };
    }
    return {
        code: 200,
        error: false,
        message: 'Producto obtenido correctamente.',
        data: serializeCommerceProduct(product, true),
    };
}
async function createCommerceProduct(companyId, input, forcedType) {
    const nextProductType = forcedType ?? input.product_type ?? client_1.CommerceProductType.SIMPLE;
    const price = input.price;
    if (price === undefined) {
        return { code: 400, error: true, message: 'El precio es obligatorio.' };
    }
    const promoError = (0, commerce_pricing_service_1.validateCommercePromoWindow)({
        price,
        regularPrice: input.regular_price,
        promoPrice: input.promo_price,
        promoStartsAt: input.promo_starts_at,
        promoEndsAt: input.promo_ends_at,
    });
    if (promoError) {
        return { code: 400, error: true, message: promoError };
    }
    const imageOwnershipError = validateImagesOwnership(companyId, input.images);
    if (imageOwnershipError) {
        return { code: 400, error: true, message: imageOwnershipError };
    }
    const fulfillmentError = validateFulfillmentFlags({
        available_for_pickup: input.available_for_pickup ?? true,
        available_for_delivery: input.available_for_delivery ?? true,
    });
    if (fulfillmentError) {
        return { code: 400, error: true, message: fulfillmentError };
    }
    if (!input.slug?.trim()) {
        return { code: 400, error: true, message: 'El slug es obligatorio.' };
    }
    if (!input.name?.trim()) {
        return { code: 400, error: true, message: 'El nombre es obligatorio.' };
    }
    if (nextProductType !== client_1.CommerceProductType.COMBO && (input.combo_items?.length ?? 0) > 0) {
        return { code: 400, error: true, message: 'Solo los combos pueden tener componentes.' };
    }
    if (nextProductType === client_1.CommerceProductType.COMBO && normalizeComboItemsForCreate(input).length === 0) {
        return { code: 400, error: true, message: 'Un combo necesita al menos un componente.' };
    }
    try {
        const product = await client_2.prisma.$transaction(async (tx) => {
            const store = await CommerceRepo.getOrCreateCommerceStore(companyId, tx);
            const categoryId = await ensureCategoryBelongsToCompany(tx, companyId, input.category_id);
            await ensureUniqueProductSlug(tx, companyId, input.slug);
            const stockFields = normalizeStockFields(input);
            const created = await tx.commerceProduct.create({
                data: {
                    company_id: companyId,
                    store_id: store.id,
                    category_id: categoryId,
                    name: input.name.trim(),
                    slug: input.slug.trim(),
                    description: input.description ?? null,
                    product_type: nextProductType,
                    price,
                    regular_price: input.regular_price ?? null,
                    promo_price: input.promo_price ?? null,
                    promo_starts_at: input.promo_starts_at ?? null,
                    promo_ends_at: input.promo_ends_at ?? null,
                    promo_label: input.promo_label ?? null,
                    is_active: input.is_active ?? true,
                    is_featured: input.is_featured ?? false,
                    track_stock: stockFields.track_stock,
                    stock_quantity: stockFields.track_stock ? stockFields.stock_quantity : 0,
                    low_stock_threshold: stockFields.track_stock ? stockFields.low_stock_threshold : null,
                    allow_out_of_stock_orders: stockFields.allow_out_of_stock_orders,
                    available_for_pickup: input.available_for_pickup ?? true,
                    available_for_delivery: input.available_for_delivery ?? true,
                    sort_order: input.sort_order ?? 0,
                },
            });
            await replaceProductImages(tx, created.id, input.images ?? []);
            if (nextProductType === client_1.CommerceProductType.COMBO) {
                await replaceComboItems(tx, companyId, created.id, normalizeComboItemsForCreate(input));
            }
            return getProductRecord(companyId, created.id, undefined, tx);
        });
        if (!product) {
            return { code: 500, error: true, message: 'No pudimos cargar el producto creado.' };
        }
        return {
            code: 201,
            error: false,
            message: 'Producto creado correctamente.',
            data: serializeCommerceProduct(product, true),
        };
    }
    catch (error) {
        return {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'No pudimos crear el producto.',
        };
    }
}
async function updateCommerceProduct(companyId, productId, input, expectedType) {
    const existing = await getProductRecord(companyId, productId, expectedType);
    if (!existing) {
        return {
            code: 404,
            error: true,
            message: `No encontramos el ${buildProductTypeMessage(expectedType ?? client_1.CommerceProductType.SIMPLE)}.`,
        };
    }
    const nextProductType = forcedProductType(expectedType, input.product_type, existing.product_type);
    const mergedPrice = input.price ?? Number(existing.price);
    const mergedRegularPrice = Object.prototype.hasOwnProperty.call(input, 'regular_price')
        ? input.regular_price ?? null
        : existing.regular_price != null
            ? Number(existing.regular_price)
            : null;
    const mergedPromoPrice = Object.prototype.hasOwnProperty.call(input, 'promo_price')
        ? input.promo_price ?? null
        : existing.promo_price != null
            ? Number(existing.promo_price)
            : null;
    const mergedPromoStartsAt = Object.prototype.hasOwnProperty.call(input, 'promo_starts_at')
        ? input.promo_starts_at ?? null
        : existing.promo_starts_at;
    const mergedPromoEndsAt = Object.prototype.hasOwnProperty.call(input, 'promo_ends_at')
        ? input.promo_ends_at ?? null
        : existing.promo_ends_at;
    const fulfillmentError = validateFulfillmentFlags({
        available_for_pickup: input.available_for_pickup ?? existing.available_for_pickup,
        available_for_delivery: input.available_for_delivery ?? existing.available_for_delivery,
    });
    if (fulfillmentError) {
        return { code: 400, error: true, message: fulfillmentError };
    }
    const promoError = (0, commerce_pricing_service_1.validateCommercePromoWindow)({
        price: mergedPrice,
        regularPrice: mergedRegularPrice,
        promoPrice: mergedPromoPrice,
        promoStartsAt: mergedPromoStartsAt,
        promoEndsAt: mergedPromoEndsAt,
    });
    if (promoError) {
        return { code: 400, error: true, message: promoError };
    }
    const imageOwnershipError = validateImagesOwnership(companyId, input.images);
    if (imageOwnershipError) {
        return { code: 400, error: true, message: imageOwnershipError };
    }
    const comboItemsProvided = Object.prototype.hasOwnProperty.call(input, 'combo_items');
    const nextComboItems = comboItemsProvided ? input.combo_items ?? [] : existing.combo_items.map((item) => ({
        componentProductId: item.component_product_id,
        quantity: item.quantity,
    }));
    if (nextProductType !== client_1.CommerceProductType.COMBO && nextComboItems.length > 0 && comboItemsProvided) {
        return { code: 400, error: true, message: 'Solo los combos pueden tener componentes.' };
    }
    if (nextProductType === client_1.CommerceProductType.COMBO &&
        existing.product_type !== client_1.CommerceProductType.COMBO &&
        nextComboItems.length === 0) {
        return { code: 400, error: true, message: 'Un combo necesita al menos un componente.' };
    }
    try {
        const product = await client_2.prisma.$transaction(async (tx) => {
            const categoryId = Object.prototype.hasOwnProperty.call(input, 'category_id')
                ? await ensureCategoryBelongsToCompany(tx, companyId, input.category_id)
                : existing.category_id;
            await ensureUniqueProductSlug(tx, companyId, input.slug ?? existing.slug, productId);
            const stockFields = normalizeStockFields(input, existing);
            await tx.commerceProduct.update({
                where: { id: productId },
                data: {
                    ...buildProductUpdateData(input),
                    category_id: categoryId,
                    product_type: nextProductType,
                    track_stock: stockFields.track_stock,
                    stock_quantity: stockFields.track_stock ? stockFields.stock_quantity : 0,
                    low_stock_threshold: stockFields.track_stock ? stockFields.low_stock_threshold : null,
                    allow_out_of_stock_orders: stockFields.allow_out_of_stock_orders,
                },
            });
            if (input.images) {
                await replaceProductImages(tx, productId, input.images);
            }
            if (nextProductType === client_1.CommerceProductType.COMBO) {
                if (comboItemsProvided) {
                    await replaceComboItems(tx, companyId, productId, nextComboItems);
                }
            }
            else if (existing.product_type === client_1.CommerceProductType.COMBO || comboItemsProvided) {
                await tx.commerceComboItem.deleteMany({
                    where: { combo_product_id: productId },
                });
            }
            return getProductRecord(companyId, productId, undefined, tx);
        });
        if (!product) {
            return { code: 500, error: true, message: 'No pudimos cargar el producto actualizado.' };
        }
        return {
            code: 200,
            error: false,
            message: 'Producto actualizado.',
            data: serializeCommerceProduct(product, true),
        };
    }
    catch (error) {
        return {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'No pudimos actualizar el producto.',
        };
    }
}
function forcedProductType(expectedType, requestedType, existingType) {
    if (expectedType)
        return expectedType;
    return requestedType ?? existingType;
}
async function deleteCommerceProduct(companyId, productId, expectedType) {
    const existing = await getProductRecord(companyId, productId, expectedType);
    if (!existing) {
        return {
            code: 404,
            error: true,
            message: `No encontramos el ${buildProductTypeMessage(expectedType ?? client_1.CommerceProductType.SIMPLE)}.`,
        };
    }
    const updated = await client_2.prisma.commerceProduct.update({
        where: { id: productId },
        data: {
            is_active: false,
            is_featured: false,
        },
        include: adminProductInclude,
    });
    return {
        code: 200,
        error: false,
        message: expectedType === client_1.CommerceProductType.COMBO
            ? 'Combo desactivado correctamente.'
            : 'Producto desactivado correctamente.',
        data: serializeCommerceProduct(updated, true),
    };
}
async function reorderCommerceProducts(companyId, ids, expectedType) {
    const existingProducts = await client_2.prisma.commerceProduct.findMany({
        where: {
            id: { in: ids },
            company_id: companyId,
            ...(expectedType ? { product_type: expectedType } : {}),
        },
        select: { id: true },
    });
    if (existingProducts.length !== ids.length) {
        return {
            code: 400,
            error: true,
            message: 'Uno o más productos no existen o no pertenecen a esta empresa.',
        };
    }
    await client_2.prisma.$transaction(ids.map((id, index) => client_2.prisma.commerceProduct.update({
        where: { id },
        data: { sort_order: index },
    })));
    return {
        code: 200,
        error: false,
        message: 'Orden de productos actualizado.',
    };
}
async function uploadCommerceProductImage(companyId, productId, file, input, expectedType) {
    if (!file) {
        return { code: 400, error: true, message: 'No se recibió ninguna imagen.' };
    }
    const product = await getProductRecord(companyId, productId, expectedType);
    if (!product) {
        return {
            code: 404,
            error: true,
            message: `No encontramos el ${buildProductTypeMessage(expectedType ?? client_1.CommerceProductType.SIMPLE)}.`,
        };
    }
    const extension = PRODUCT_IMAGE_EXTENSIONS[file.mimetype];
    if (!extension) {
        return {
            code: 400,
            error: true,
            message: 'Tipo de imagen no válido. Solo se permiten JPEG, PNG, WebP y GIF.',
        };
    }
    const relativePath = await storage_service_1.StorageService.saveFile(companyId, 'commerce-products', buildVersionedCommerceFilename(`product-${productId}`, extension), file.buffer);
    const imageUrl = storage_service_1.StorageService.getFileUrl(relativePath);
    try {
        const savedImage = await client_2.prisma.$transaction(async (tx) => {
            const images = await tx.commerceProductImage.findMany({
                where: { product_id: productId },
                orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
            });
            const isPrimary = parseOptionalBoolean(input.is_primary) ?? images.length === 0;
            const sortOrder = parseOptionalInteger(input.sort_order) ?? images.length;
            if (isPrimary) {
                await tx.commerceProductImage.updateMany({
                    where: { product_id: productId },
                    data: { is_primary: false },
                });
            }
            return tx.commerceProductImage.create({
                data: {
                    product_id: productId,
                    image_url: imageUrl,
                    alt_text: input.alt_text?.trim() || null,
                    sort_order: Math.max(0, sortOrder),
                    is_primary: isPrimary,
                },
            });
        });
        const refreshed = await getProductRecord(companyId, productId, expectedType);
        return {
            code: 201,
            error: false,
            message: 'Imagen subida correctamente.',
            data: {
                image: savedImage,
                product: refreshed ? serializeCommerceProduct(refreshed, true) : undefined,
                url: imageUrl,
                image_url: imageUrl,
            },
        };
    }
    catch (error) {
        await storage_service_1.StorageService.deleteFile(relativePath).catch(() => undefined);
        return {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'No pudimos subir la imagen.',
        };
    }
}
async function getProductImageForCompany(companyId, productId, imageId, expectedType, tx = client_2.prisma) {
    return tx.commerceProductImage.findFirst({
        where: {
            id: imageId,
            product_id: productId,
            product: {
                company_id: companyId,
                ...(expectedType ? { product_type: expectedType } : {}),
            },
        },
    });
}
async function setCommerceProductPrimaryImage(companyId, productId, imageId, expectedType) {
    const image = await getProductImageForCompany(companyId, productId, imageId, expectedType);
    if (!image) {
        return { code: 404, error: true, message: 'No encontramos la imagen del producto.' };
    }
    await client_2.prisma.$transaction(async (tx) => {
        await tx.commerceProductImage.updateMany({
            where: { product_id: productId },
            data: { is_primary: false },
        });
        await tx.commerceProductImage.update({
            where: { id: imageId },
            data: { is_primary: true },
        });
    });
    const product = await getProductRecord(companyId, productId, expectedType);
    return {
        code: 200,
        error: false,
        message: 'Imagen principal actualizada.',
        data: product ? serializeCommerceProduct(product, true) : null,
    };
}
async function reorderCommerceProductImages(companyId, productId, imageIds, expectedType) {
    const images = await client_2.prisma.commerceProductImage.findMany({
        where: {
            product_id: productId,
            id: { in: imageIds },
            product: {
                company_id: companyId,
                ...(expectedType ? { product_type: expectedType } : {}),
            },
        },
        select: { id: true },
    });
    if (images.length !== imageIds.length || new Set(imageIds).size !== imageIds.length) {
        return {
            code: 400,
            error: true,
            message: 'La lista de imágenes no es válida para este producto.',
        };
    }
    await client_2.prisma.$transaction(imageIds.map((id, index) => client_2.prisma.commerceProductImage.update({
        where: { id },
        data: { sort_order: index },
    })));
    const product = await getProductRecord(companyId, productId, expectedType);
    return {
        code: 200,
        error: false,
        message: 'Orden de imágenes actualizado.',
        data: product ? serializeCommerceProduct(product, true) : null,
    };
}
async function updateCommerceProductImage(companyId, productId, imageId, input, expectedType) {
    const image = await getProductImageForCompany(companyId, productId, imageId, expectedType);
    if (!image) {
        return { code: 404, error: true, message: 'No encontramos la imagen del producto.' };
    }
    await client_2.prisma.commerceProductImage.update({
        where: { id: imageId },
        data: {
            alt_text: input.alt_text ?? null,
        },
    });
    const product = await getProductRecord(companyId, productId, expectedType);
    return {
        code: 200,
        error: false,
        message: 'Texto alternativo actualizado.',
        data: product ? serializeCommerceProduct(product, true) : null,
    };
}
async function deleteCommerceProductImage(companyId, productId, imageId, expectedType) {
    const image = await getProductImageForCompany(companyId, productId, imageId, expectedType);
    if (!image) {
        return { code: 404, error: true, message: 'No encontramos la imagen del producto.' };
    }
    await client_2.prisma.$transaction(async (tx) => {
        await tx.commerceProductImage.delete({
            where: { id: imageId },
        });
        if (image.is_primary) {
            const nextPrimary = await tx.commerceProductImage.findFirst({
                where: { product_id: productId },
                orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
            });
            if (nextPrimary) {
                await tx.commerceProductImage.update({
                    where: { id: nextPrimary.id },
                    data: { is_primary: true },
                });
            }
        }
    });
    const relativePath = toStorageRelativePath(image.image_url);
    if (relativePath && relativePath.startsWith(`uploads/${companyId}/`)) {
        await storage_service_1.StorageService.deleteFile(relativePath).catch(() => undefined);
    }
    const product = await getProductRecord(companyId, productId, expectedType);
    return {
        code: 200,
        error: false,
        message: 'Imagen eliminada correctamente.',
        data: product ? serializeCommerceProduct(product, true) : null,
    };
}
async function upsertCommerceProductPromotion(companyId, productId, input, expectedType) {
    const existing = await getProductRecord(companyId, productId, expectedType);
    if (!existing) {
        return {
            code: 404,
            error: true,
            message: `No encontramos el ${buildProductTypeMessage(expectedType ?? client_1.CommerceProductType.SIMPLE)}.`,
        };
    }
    const promoError = (0, commerce_pricing_service_1.validateCommercePromoWindow)({
        price: Number(existing.price),
        regularPrice: Object.prototype.hasOwnProperty.call(input, 'regular_price')
            ? input.regular_price ?? null
            : existing.regular_price != null
                ? Number(existing.regular_price)
                : null,
        promoPrice: input.promo_price,
        promoStartsAt: input.promo_starts_at,
        promoEndsAt: input.promo_ends_at,
    });
    if (promoError) {
        return { code: 400, error: true, message: promoError };
    }
    const updated = await client_2.prisma.commerceProduct.update({
        where: { id: productId },
        data: {
            ...(Object.prototype.hasOwnProperty.call(input, 'regular_price')
                ? { regular_price: input.regular_price ?? null }
                : {}),
            promo_price: input.promo_price,
            promo_starts_at: input.promo_starts_at ?? null,
            promo_ends_at: input.promo_ends_at ?? null,
            promo_label: input.promo_label ?? null,
        },
        include: adminProductInclude,
    });
    return {
        code: 200,
        error: false,
        message: 'Promoción actualizada correctamente.',
        data: serializeCommerceProduct(updated, true),
    };
}
async function removeCommerceProductPromotion(companyId, productId, expectedType) {
    const existing = await getProductRecord(companyId, productId, expectedType);
    if (!existing) {
        return {
            code: 404,
            error: true,
            message: `No encontramos el ${buildProductTypeMessage(expectedType ?? client_1.CommerceProductType.SIMPLE)}.`,
        };
    }
    const updated = await client_2.prisma.commerceProduct.update({
        where: { id: productId },
        data: {
            promo_price: null,
            promo_starts_at: null,
            promo_ends_at: null,
            promo_label: null,
        },
        include: adminProductInclude,
    });
    return {
        code: 200,
        error: false,
        message: 'Promoción eliminada correctamente.',
        data: serializeCommerceProduct(updated, true),
    };
}
