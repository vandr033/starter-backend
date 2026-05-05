import {
    CommerceDeliveryCostMode,
    CommerceFulfillmentMode,
    CommerceFulfillmentStatus,
    CommerceFulfillmentType,
    CommercePaymentStatus,
    CommerceProductType,
    Prisma,
} from '@prisma/client';
import { prisma } from '../prisma/client';
import { getCompanyEntitlements } from '../services/company-entitlements.service';

type Tx = Prisma.TransactionClient | typeof prisma;

export async function getOrCreateCommerceStore(companyId: number, db: Tx = prisma) {
    const existing = await db.commerceStore.findUnique({
        where: { company_id: companyId },
    });
    if (existing) return existing;

    return db.commerceStore.create({
        data: {
            company_id: companyId,
        },
    });
}

export async function findCommerceStoreByCompanyId(companyId: number, db: Tx = prisma) {
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

export async function listAdminCommercePointsOfSale(companyId: number, db: Tx = prisma) {
    return db.commercePointOfSale.findMany({
        where: { company_id: companyId },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
}

export async function getAdminCommercePointOfSale(companyId: number, pointOfSaleId: string, db: Tx = prisma) {
    return db.commercePointOfSale.findFirst({
        where: {
            id: pointOfSaleId,
            company_id: companyId,
        },
    });
}

export async function listPublicCommercePointsOfSale(companyId: number, db: Tx = prisma) {
    return db.commercePointOfSale.findMany({
        where: {
            company_id: companyId,
            is_active: true,
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
}

export async function findActiveCommerceCompanyBySlug(slug: string, db: Tx = prisma) {
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

    if (!company) return null;

    const entitlements = await getCompanyEntitlements(company.id, db as any);
    if (!entitlements.productCapabilities.COMMERCE_ACCESS) {
        return null;
    }

    return {
        ...company,
        entitlements,
    };
}

export async function listAdminCommerceCategories(companyId: number, db: Tx = prisma) {
    return db.commerceCategory.findMany({
        where: { company_id: companyId },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
}

export async function listAdminCommerceProducts(companyId: number, db: Tx = prisma) {
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

export async function getAdminCommerceProduct(companyId: number, productId: string, db: Tx = prisma) {
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

export async function listPublicCommerceCategories(companyId: number, db: Tx = prisma) {
    return db.commerceCategory.findMany({
        where: {
            company_id: companyId,
            is_active: true,
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
}

export async function listPublicCommerceProducts(companyId: number, db: Tx = prisma) {
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

export async function getPublicCommerceProductBySlug(
    companyId: number,
    productSlug: string,
    db: Tx = prisma,
) {
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

export async function listAdminCommerceOrders(
    companyId: number,
    params?: {
        assignedStaffId?: number | null;
    },
    db: Tx = prisma,
) {
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

export async function getAdminCommerceOrder(
    companyId: number,
    orderId: string,
    params?: {
        assignedStaffId?: number | null;
    },
    db: Tx = prisma,
) {
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

export async function getPublicCommerceOrderByOrderNumber(
    companyId: number,
    orderNumber: string,
    db: Tx = prisma,
) {
    return db.commerceOrder.findFirst({
        where: {
            company_id: companyId,
            order_number: orderNumber,
        },
        include: {
            pickup_point: true,
            items: {
                include: {
                    component_snapshots: true,
                },
            },
        },
    });
}

export async function listCompanyAssignableStaff(companyId: number, db: Tx = prisma) {
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

export async function buildCommerceMetrics(companyId: number, db: Tx = prisma) {
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
        .filter((order) => order.payment_status === CommercePaymentStatus.PAYMENT_CONFIRMED)
        .reduce((sum, order) => sum + Number(order.total ?? order.subtotal ?? 0), 0);

    return {
        totals: {
            orders: orders.length,
            confirmedRevenue: revenue,
            awaitingDeliveryCost: orders.filter(
                (order) => order.payment_status === CommercePaymentStatus.AWAITING_DELIVERY_COST,
            ).length,
            awaitingPayment: orders.filter(
                (order) => order.payment_status === CommercePaymentStatus.AWAITING_PAYMENT,
            ).length,
            paymentSubmitted: orders.filter(
                (order) => order.payment_status === CommercePaymentStatus.PAYMENT_SUBMITTED,
            ).length,
            readyForPickup: orders.filter(
                (order) => order.fulfillment_status === CommerceFulfillmentStatus.READY_FOR_PICKUP,
            ).length,
            outForDelivery: orders.filter(
                (order) => order.fulfillment_status === CommerceFulfillmentStatus.OUT_FOR_DELIVERY,
            ).length,
        },
        mix: {
            pickup: orders.filter((order) => order.fulfillment_type === CommerceFulfillmentType.PICKUP)
                .length,
            delivery: orders.filter((order) => order.fulfillment_type === CommerceFulfillmentType.DELIVERY)
                .length,
        },
        stock: {
            activeProducts: products.length,
            lowStock: products.filter(
                (product) =>
                    product.track_stock &&
                    product.low_stock_threshold != null &&
                    product.stock_quantity <= product.low_stock_threshold,
            ).length,
            outOfStock: products.filter(
                (product) => product.track_stock && product.stock_quantity <= 0,
            ).length,
        },
    };
}
