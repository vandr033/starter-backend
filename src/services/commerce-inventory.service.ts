import { CommercePaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { computeComboAvailableUnits } from './commerce-combo.service';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

type InventoryProduct = {
    id: string;
    name?: string;
    track_stock: boolean;
    stock_quantity: number;
    allow_out_of_stock_orders: boolean;
};

type StockValidationResult = {
    available: boolean;
    message: string | null;
    availableUnits: number | null;
    tracked: boolean;
};

export async function assertCommerceStockAvailable(
    tx: Tx,
    items: Array<{
        productId: string | null;
        quantity: number;
        componentSnapshots: Array<{
            componentProductId: string | null;
            totalComponentQuantity: number;
        }>;
    }>,
): Promise<string | null> {
    const productIds = new Set<string>();
    for (const item of items) {
        if (item.productId) productIds.add(item.productId);
        for (const snapshot of item.componentSnapshots) {
            if (snapshot.componentProductId) productIds.add(snapshot.componentProductId);
        }
    }

    if (productIds.size === 0) return null;

    const products = await tx.commerceProduct.findMany({
        where: { id: { in: Array.from(productIds) } },
        select: {
            id: true,
            name: true,
            track_stock: true,
            stock_quantity: true,
            allow_out_of_stock_orders: true,
        },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    const required = new Map<string, number>();
    for (const item of items) {
        if (item.componentSnapshots.length > 0) {
            for (const snapshot of item.componentSnapshots) {
                if (!snapshot.componentProductId) continue;
                required.set(
                    snapshot.componentProductId,
                    (required.get(snapshot.componentProductId) ?? 0) + snapshot.totalComponentQuantity,
                );
            }
            continue;
        }

        if (item.productId) {
            required.set(item.productId, (required.get(item.productId) ?? 0) + item.quantity);
        }
    }

    for (const [productId, quantity] of required) {
        const product = byId.get(productId);
        if (!product || !product.track_stock || product.allow_out_of_stock_orders) continue;
        if (product.stock_quantity < quantity) {
            return `No hay stock suficiente para ${product.name}.`;
        }
    }

    return null;
}

async function applyStockDelta(
    tx: Tx,
    productId: string,
    delta: number,
): Promise<void> {
    const product = await tx.commerceProduct.findUnique({
        where: { id: productId },
        select: {
            id: true,
            track_stock: true,
            stock_quantity: true,
            allow_out_of_stock_orders: true,
        },
    });

    if (!product || !product.track_stock) return;
    if (delta < 0 && !product.allow_out_of_stock_orders && product.stock_quantity + delta < 0) {
        throw new Error('No hay stock suficiente para completar el pedido.');
    }

    await tx.commerceProduct.update({
        where: { id: productId },
        data: {
            stock_quantity: {
                increment: delta,
            },
        },
    });
}

async function getCompanyInventoryProduct(
    db: Db,
    companyId: number,
    productId: string,
) {
    return db.commerceProduct.findFirst({
        where: {
            id: productId,
            company_id: companyId,
        },
        select: {
            id: true,
            name: true,
            product_type: true,
            track_stock: true,
            stock_quantity: true,
            allow_out_of_stock_orders: true,
        },
    });
}

export async function validateCommerceProductStockAvailability(
    db: Db,
    params: {
        companyId: number;
        productId: string;
        quantity: number;
    },
): Promise<StockValidationResult> {
    const product = await getCompanyInventoryProduct(db, params.companyId, params.productId);
    if (!product) {
        return {
            available: false,
            message: 'El producto no existe o no pertenece a esta empresa.',
            availableUnits: null,
            tracked: false,
        };
    }

    if (!product.track_stock || product.allow_out_of_stock_orders) {
        return {
            available: true,
            message: null,
            availableUnits: null,
            tracked: product.track_stock,
        };
    }

    return {
        available: product.stock_quantity >= params.quantity,
        message:
            product.stock_quantity >= params.quantity
                ? null
                : `No hay stock suficiente para ${product.name}.`,
        availableUnits: product.stock_quantity,
        tracked: true,
    };
}

export async function validateCommerceComboStockAvailability(
    db: Db,
    params: {
        companyId: number;
        comboProductId: string;
        quantity: number;
    },
): Promise<StockValidationResult> {
    const combo = await db.commerceProduct.findFirst({
        where: {
            id: params.comboProductId,
            company_id: params.companyId,
            product_type: 'COMBO',
        },
        select: {
            id: true,
            name: true,
            combo_items: {
                include: {
                    component_product: {
                        select: {
                            id: true,
                            name: true,
                            track_stock: true,
                            stock_quantity: true,
                            allow_out_of_stock_orders: true,
                        },
                    },
                },
            },
        },
    });

    if (!combo) {
        return {
            available: false,
            message: 'El combo no existe o no pertenece a esta empresa.',
            availableUnits: null,
            tracked: false,
        };
    }

    if (combo.combo_items.length === 0) {
        return {
            available: false,
            message: 'El combo no tiene componentes configurados.',
            availableUnits: 0,
            tracked: false,
        };
    }

    const availableUnits = computeComboAvailableUnits({
        items: combo.combo_items.map((item) => ({
            quantity: item.quantity,
            componentProduct: {
                track_stock: item.component_product.track_stock,
                stock_quantity: item.component_product.stock_quantity,
                allow_out_of_stock_orders: item.component_product.allow_out_of_stock_orders,
            },
        })),
    });

    const insufficientComponent = combo.combo_items.find((item) => {
        if (!item.component_product.track_stock || item.component_product.allow_out_of_stock_orders) {
            return false;
        }
        return item.component_product.stock_quantity < item.quantity * params.quantity;
    });

    if (insufficientComponent) {
        return {
            available: false,
            message: `No hay stock suficiente para ${insufficientComponent.component_product.name}.`,
            availableUnits,
            tracked: true,
        };
    }

    return {
        available: true,
        message: null,
        availableUnits,
        tracked: combo.combo_items.some((item) => item.component_product.track_stock),
    };
}

export async function deductCommerceProductStock(
    tx: Tx,
    params: {
        companyId: number;
        productId: string;
        quantity: number;
    },
): Promise<void> {
    const validation = await validateCommerceProductStockAvailability(tx, params);
    if (!validation.available) {
        throw new Error(validation.message ?? 'No hay stock suficiente para completar el pedido.');
    }

    await applyStockDelta(tx, params.productId, -params.quantity);
}

export async function deductCommerceComboChildProductStock(
    tx: Tx,
    params: {
        companyId: number;
        comboProductId: string;
        quantity: number;
    },
): Promise<void> {
    const combo = await tx.commerceProduct.findFirst({
        where: {
            id: params.comboProductId,
            company_id: params.companyId,
            product_type: 'COMBO',
        },
        select: {
            id: true,
            combo_items: {
                include: {
                    component_product: {
                        select: {
                            id: true,
                            name: true,
                            track_stock: true,
                            stock_quantity: true,
                            allow_out_of_stock_orders: true,
                        },
                    },
                },
            },
        },
    });

    if (!combo) {
        throw new Error('El combo no existe o no pertenece a esta empresa.');
    }

    const validation = await validateCommerceComboStockAvailability(tx, params);
    if (!validation.available) {
        throw new Error(validation.message ?? 'No hay stock suficiente para completar el combo.');
    }

    for (const item of combo.combo_items) {
        await applyStockDelta(tx, item.component_product.id, -(item.quantity * params.quantity));
    }
}

export async function deductCommerceOrderStock(tx: Tx, orderId: string): Promise<void> {
    const order = await tx.commerceOrder.findUnique({
        where: { id: orderId },
        include: {
            items: {
                include: {
                    component_snapshots: true,
                },
            },
        },
    });

    if (!order || order.stock_deducted_at) return;

    const stockError = await assertCommerceStockAvailable(
        tx,
        order.items.map((item) => ({
            productId: item.product_id,
            quantity: item.quantity,
            componentSnapshots: item.component_snapshots.map((snapshot) => ({
                componentProductId: snapshot.component_product_id,
                totalComponentQuantity: snapshot.total_component_quantity,
            })),
        })),
    );
    if (stockError) {
        throw new Error(stockError);
    }

    for (const item of order.items) {
        if (item.component_snapshots.length > 0) {
            for (const snapshot of item.component_snapshots) {
                if (!snapshot.component_product_id) continue;
                await applyStockDelta(tx, snapshot.component_product_id, -snapshot.total_component_quantity);
            }
            continue;
        }

        if (item.product_id) {
            await applyStockDelta(tx, item.product_id, -item.quantity);
        }
    }

    await tx.commerceOrder.update({
        where: { id: orderId },
        data: {
            stock_deducted_at: new Date(),
            stock_restored_at: null,
        },
    });
}

export async function restoreCommerceOrderStock(tx: Tx, orderId: string): Promise<void> {
    const order = await tx.commerceOrder.findUnique({
        where: { id: orderId },
        include: {
            items: {
                include: {
                    component_snapshots: true,
                },
            },
        },
    });

    if (!order || !order.stock_deducted_at || order.stock_restored_at) return;

    for (const item of order.items) {
        if (item.component_snapshots.length > 0) {
            for (const snapshot of item.component_snapshots) {
                if (!snapshot.component_product_id) continue;
                await applyStockDelta(tx, snapshot.component_product_id, snapshot.total_component_quantity);
            }
            continue;
        }

        if (item.product_id) {
            await applyStockDelta(tx, item.product_id, item.quantity);
        }
    }

    await tx.commerceOrder.update({
        where: { id: orderId },
        data: {
            stock_restored_at: new Date(),
        },
    });
}

export function shouldDeductCommerceStock(params: {
    previousPaymentStatus?: CommercePaymentStatus | null;
    newPaymentStatus?: CommercePaymentStatus | null;
}): boolean {
    return (
        params.previousPaymentStatus !== CommercePaymentStatus.PAYMENT_CONFIRMED &&
        params.newPaymentStatus === CommercePaymentStatus.PAYMENT_CONFIRMED
    );
}
