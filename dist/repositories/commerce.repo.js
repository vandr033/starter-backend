"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateCommerceStore = getOrCreateCommerceStore;
exports.findCommerceStoreByCompanyId = findCommerceStoreByCompanyId;
exports.listAdminCommercePointsOfSale = listAdminCommercePointsOfSale;
exports.getAdminCommercePointOfSale = getAdminCommercePointOfSale;
exports.listPublicCommercePointsOfSale = listPublicCommercePointsOfSale;
exports.findActiveCommerceCompanyBySlug = findActiveCommerceCompanyBySlug;
exports.listAdminCommerceCategories = listAdminCommerceCategories;
exports.listAdminCommerceProducts = listAdminCommerceProducts;
exports.getAdminCommerceProduct = getAdminCommerceProduct;
exports.listPublicCommerceCategories = listPublicCommerceCategories;
exports.listPublicCommerceProducts = listPublicCommerceProducts;
exports.getPublicCommerceProductBySlug = getPublicCommerceProductBySlug;
exports.listAdminCommerceOrders = listAdminCommerceOrders;
exports.getAdminCommerceOrder = getAdminCommerceOrder;
exports.getPublicCommerceOrderByOrderNumber = getPublicCommerceOrderByOrderNumber;
exports.listCompanyAssignableStaff = listCompanyAssignableStaff;
exports.buildCommerceMetrics = buildCommerceMetrics;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const company_entitlements_service_1 = require("../services/company-entitlements.service");
async function getOrCreateCommerceStore(companyId, db = client_2.prisma) {
    const existing = await db.commerceStore.findUnique({
        where: { company_id: companyId },
    });
    if (existing)
        return existing;
    return db.commerceStore.create({
        data: {
            company_id: companyId,
        },
    });
}
async function findCommerceStoreByCompanyId(companyId, db = client_2.prisma) {
    return db.commerceStore.findUnique({
        where: { company_id: companyId },
        include: {
            order_schedule_slots: {
                where: { is_active: true },
                orderBy: [{ day_of_week: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
            },
        },
    });
}
async function listAdminCommercePointsOfSale(companyId, db = client_2.prisma) {
    return db.commercePointOfSale.findMany({
        where: { company_id: companyId },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
}
async function getAdminCommercePointOfSale(companyId, pointOfSaleId, db = client_2.prisma) {
    return db.commercePointOfSale.findFirst({
        where: {
            id: pointOfSaleId,
            company_id: companyId,
        },
    });
}
async function listPublicCommercePointsOfSale(companyId, db = client_2.prisma) {
    return db.commercePointOfSale.findMany({
        where: {
            company_id: companyId,
            is_active: true,
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
}
async function findActiveCommerceCompanyBySlug(slug, db = client_2.prisma) {
    const company = await db.company.findFirst({
        where: {
            slug,
            is_active: true,
            deleted_at: null,
        },
        select: {
            id: true,
            slug: true,
            name: true,
            currency: true,
            country_code: true,
            phone_prefix: true,
            timezone: true,
            availableUntil: true,
            is_active: true,
            logo_url: true,
        },
    });
    if (!company)
        return null;
    const entitlements = await (0, company_entitlements_service_1.getCompanyEntitlements)(company.id, db);
    if (!entitlements.productCapabilities.COMMERCE_ACCESS) {
        return null;
    }
    return {
        ...company,
        entitlements,
    };
}
async function listAdminCommerceCategories(companyId, db = client_2.prisma) {
    return db.commerceCategory.findMany({
        where: { company_id: companyId },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
}
async function listAdminCommerceProducts(companyId, db = client_2.prisma) {
    return db.commerceProduct.findMany({
        where: { company_id: companyId },
        include: {
            category: true,
            images: {
                orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
            },
            combo_items: {
                include: {
                    component_product: true,
                },
            },
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
}
async function getAdminCommerceProduct(companyId, productId, db = client_2.prisma) {
    return db.commerceProduct.findFirst({
        where: {
            id: productId,
            company_id: companyId,
        },
        include: {
            category: true,
            images: {
                orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
            },
            combo_items: {
                include: {
                    component_product: true,
                },
            },
        },
    });
}
async function listPublicCommerceCategories(companyId, db = client_2.prisma) {
    return db.commerceCategory.findMany({
        where: {
            company_id: companyId,
            is_active: true,
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
}
async function listPublicCommerceProducts(companyId, db = client_2.prisma) {
    return db.commerceProduct.findMany({
        where: {
            company_id: companyId,
            is_active: true,
        },
        include: {
            category: true,
            images: {
                where: { is_primary: true },
                orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
                take: 1,
            },
            combo_items: {
                include: {
                    component_product: true,
                },
            },
        },
        orderBy: [{ is_featured: 'desc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    });
}
async function getPublicCommerceProductBySlug(companyId, productSlug, db = client_2.prisma) {
    return db.commerceProduct.findFirst({
        where: {
            company_id: companyId,
            slug: productSlug,
            is_active: true,
        },
        include: {
            category: true,
            images: {
                orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
            },
            combo_items: {
                include: {
                    component_product: true,
                },
            },
        },
    });
}
async function listAdminCommerceOrders(companyId, params, db = client_2.prisma) {
    return db.commerceOrder.findMany({
        where: {
            company_id: companyId,
            ...(params?.assignedStaffId != null ? { assigned_staff_id: params.assignedStaffId } : {}),
        },
        include: {
            customer_profile: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phoneNumber: true,
                            phone_prefix: true,
                        },
                    },
                },
            },
            assigned_staff: {
                select: {
                    id: true,
                    display_name: true,
                    image_url: true,
                },
            },
            pickup_point: true,
            items: {
                include: {
                    component_snapshots: true,
                },
            },
        },
        orderBy: [{ scheduled_for: 'asc' }, { created_at: 'desc' }],
    });
}
async function getAdminCommerceOrder(companyId, orderId, params, db = client_2.prisma) {
    return db.commerceOrder.findFirst({
        where: {
            id: orderId,
            company_id: companyId,
            ...(params?.assignedStaffId != null ? { assigned_staff_id: params.assignedStaffId } : {}),
        },
        include: {
            customer_profile: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phoneNumber: true,
                            phone_prefix: true,
                        },
                    },
                },
            },
            assigned_staff: {
                select: {
                    id: true,
                    display_name: true,
                    image_url: true,
                    user_id: true,
                },
            },
            pickup_point: true,
            items: {
                include: {
                    component_snapshots: true,
                },
            },
            status_history: {
                orderBy: [{ created_at: 'desc' }],
            },
        },
    });
}
async function getPublicCommerceOrderByOrderNumber(companyId, orderNumber, db = client_2.prisma) {
    return db.commerceOrder.findFirst({
        where: {
            company_id: companyId,
            order_number: orderNumber,
        },
        include: {
            customer_profile: {
                select: {
                    id: true,
                    user_id: true,
                },
            },
            pickup_point: true,
            items: {
                include: {
                    component_snapshots: true,
                },
            },
        },
    });
}
async function listCompanyAssignableStaff(companyId, db = client_2.prisma) {
    return db.staffProfile.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
            status: 'ACTIVE',
        },
        select: {
            id: true,
            display_name: true,
            image_url: true,
        },
        orderBy: [{ display_name: 'asc' }],
    });
}
async function buildCommerceMetrics(companyId, db = client_2.prisma) {
    const [orders, products] = await Promise.all([
        db.commerceOrder.findMany({
            where: { company_id: companyId },
            select: {
                id: true,
                payment_status: true,
                fulfillment_status: true,
                fulfillment_type: true,
                total: true,
                subtotal: true,
                created_at: true,
            },
        }),
        db.commerceProduct.findMany({
            where: { company_id: companyId, is_active: true },
            select: {
                id: true,
                track_stock: true,
                stock_quantity: true,
                low_stock_threshold: true,
            },
        }),
    ]);
    const revenue = orders
        .filter((order) => order.payment_status === client_1.CommercePaymentStatus.PAYMENT_CONFIRMED)
        .reduce((sum, order) => sum + Number(order.total ?? order.subtotal ?? 0), 0);
    return {
        totals: {
            orders: orders.length,
            confirmedRevenue: revenue,
            awaitingDeliveryCost: orders.filter((order) => order.payment_status === client_1.CommercePaymentStatus.AWAITING_DELIVERY_COST).length,
            awaitingPayment: orders.filter((order) => order.payment_status === client_1.CommercePaymentStatus.AWAITING_PAYMENT).length,
            paymentSubmitted: orders.filter((order) => order.payment_status === client_1.CommercePaymentStatus.PAYMENT_SUBMITTED).length,
            readyForPickup: orders.filter((order) => order.fulfillment_status === client_1.CommerceFulfillmentStatus.READY_FOR_PICKUP).length,
            outForDelivery: orders.filter((order) => order.fulfillment_status === client_1.CommerceFulfillmentStatus.OUT_FOR_DELIVERY).length,
        },
        mix: {
            pickup: orders.filter((order) => order.fulfillment_type === client_1.CommerceFulfillmentType.PICKUP)
                .length,
            delivery: orders.filter((order) => order.fulfillment_type === client_1.CommerceFulfillmentType.DELIVERY)
                .length,
        },
        stock: {
            activeProducts: products.length,
            lowStock: products.filter((product) => product.track_stock &&
                product.low_stock_threshold != null &&
                product.stock_quantity <= product.low_stock_threshold).length,
            outOfStock: products.filter((product) => product.track_stock && product.stock_quantity <= 0).length,
        },
    };
}
