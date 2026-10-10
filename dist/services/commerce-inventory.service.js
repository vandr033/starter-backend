"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommerceInventoryStateError = exports.CommerceInsufficientStockError = void 0;
exports.assertCommerceStockAvailable = assertCommerceStockAvailable;
exports.validateCommerceProductStockAvailability = validateCommerceProductStockAvailability;
exports.validateCommerceComboStockAvailability = validateCommerceComboStockAvailability;
exports.deductCommerceProductStock = deductCommerceProductStock;
exports.deductCommerceComboChildProductStock = deductCommerceComboChildProductStock;
exports.deductCommerceOrderStock = deductCommerceOrderStock;
exports.restoreCommerceOrderStock = restoreCommerceOrderStock;
exports.shouldDeductCommerceStock = shouldDeductCommerceStock;
const client_1 = require("@prisma/client");
const commerce_combo_service_1 = require("./commerce-combo.service");
class CommerceInsufficientStockError extends Error {
    constructor(message = 'No hay stock suficiente para completar el pedido.', productId = null) {
        super(message);
        this.errorCode = 'INSUFFICIENT_STOCK';
        this.name = 'CommerceInsufficientStockError';
        this.productId = productId;
    }
}
exports.CommerceInsufficientStockError = CommerceInsufficientStockError;
class CommerceInventoryStateError extends Error {
    constructor(message = 'No pudimos completar la actualización del inventario.') {
        super(message);
        this.errorCode = 'INVENTORY_STATE_ERROR';
        this.name = 'CommerceInventoryStateError';
    }
}
exports.CommerceInventoryStateError = CommerceInventoryStateError;
async function assertCommerceStockAvailable(tx, items) {
    const productIds = new Set();
    for (const item of items) {
        if (item.productId)
            productIds.add(item.productId);
        for (const snapshot of item.componentSnapshots) {
            if (snapshot.componentProductId)
                productIds.add(snapshot.componentProductId);
        }
    }
    if (productIds.size === 0)
        return null;
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
    const required = new Map();
    for (const item of items) {
        if (item.componentSnapshots.length > 0) {
            for (const snapshot of item.componentSnapshots) {
                if (!snapshot.componentProductId)
                    continue;
                required.set(snapshot.componentProductId, (required.get(snapshot.componentProductId) ?? 0) + snapshot.totalComponentQuantity);
            }
            continue;
        }
        if (item.productId) {
            required.set(item.productId, (required.get(item.productId) ?? 0) + item.quantity);
        }
    }
    for (const [productId, quantity] of required) {
        const product = byId.get(productId);
        if (!product || !product.track_stock || product.allow_out_of_stock_orders)
            continue;
        if (product.stock_quantity < quantity) {
            return `No hay stock suficiente para ${product.name}.`;
        }
    }
    return null;
}
async function applyStockDelta(tx, companyId, productId, delta) {
    if (!Number.isInteger(delta) || delta === 0)
        return;
    const product = await tx.commerceProduct.findFirst({
        where: { id: productId, company_id: companyId },
        select: {
            id: true,
            name: true,
            track_stock: true,
            allow_out_of_stock_orders: true,
        },
    });
    if (!product) {
        throw new CommerceInventoryStateError('El producto de inventario ya no está disponible.');
    }
    if (delta < 0 && !product.track_stock)
        return;
    const affectedRows = delta < 0
        ? await tx.$executeRaw `
            UPDATE \`commerce_product\`
            SET \`stock_quantity\` = \`stock_quantity\` + ${delta}
            WHERE \`id\` = ${productId}
              AND \`company_id\` = ${companyId}
              AND \`track_stock\` = 1
              AND (
                \`allow_out_of_stock_orders\` = 1
                OR \`stock_quantity\` >= ${Math.abs(delta)}
              )
        `
        : await tx.$executeRaw `
            UPDATE \`commerce_product\`
            SET \`stock_quantity\` = \`stock_quantity\` + ${delta}
            WHERE \`id\` = ${productId}
              AND \`company_id\` = ${companyId}
        `;
    if (affectedRows !== 1) {
        if (delta < 0) {
            throw new CommerceInsufficientStockError(`No hay stock suficiente para ${product.name}.`, productId);
        }
        throw new CommerceInventoryStateError('El producto de inventario ya no está disponible.');
    }
}
async function getCompanyInventoryProduct(db, companyId, productId) {
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
async function validateCommerceProductStockAvailability(db, params) {
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
        message: product.stock_quantity >= params.quantity
            ? null
            : `No hay stock suficiente para ${product.name}.`,
        availableUnits: product.stock_quantity,
        tracked: true,
    };
}
async function validateCommerceComboStockAvailability(db, params) {
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
    const availableUnits = (0, commerce_combo_service_1.computeComboAvailableUnits)({
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
async function deductCommerceProductStock(tx, params) {
    await applyStockDelta(tx, params.companyId, params.productId, -params.quantity);
}
async function deductCommerceComboChildProductStock(tx, params) {
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
    for (const item of [...combo.combo_items].sort((left, right) => left.component_product.id.localeCompare(right.component_product.id))) {
        await applyStockDelta(tx, params.companyId, item.component_product.id, -(item.quantity * params.quantity));
    }
}
async function deductCommerceOrderStock(tx, orderId) {
    await tx.$queryRaw `SELECT id FROM \`commerce_order\` WHERE id = ${orderId} FOR UPDATE`;
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
    if (!order || (order.stock_deducted_at && !order.stock_restored_at))
        return;
    const required = new Map();
    for (const item of order.items) {
        if (item.component_snapshots.length > 0) {
            for (const snapshot of item.component_snapshots) {
                if (!snapshot.component_product_id)
                    continue;
                required.set(snapshot.component_product_id, (required.get(snapshot.component_product_id) ?? 0) + snapshot.total_component_quantity);
            }
            continue;
        }
        if (item.product_id) {
            required.set(item.product_id, (required.get(item.product_id) ?? 0) + item.quantity);
        }
    }
    for (const [productId, quantity] of [...required.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        await applyStockDelta(tx, order.company_id, productId, -quantity);
    }
    await tx.commerceOrder.update({
        where: { id: orderId },
        data: {
            stock_deducted_at: new Date(),
            stock_restored_at: null,
        },
    });
}
async function restoreCommerceOrderStock(tx, orderId) {
    await tx.$queryRaw `SELECT id FROM \`commerce_order\` WHERE id = ${orderId} FOR UPDATE`;
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
    if (!order || !order.stock_deducted_at || order.stock_restored_at)
        return;
    const required = new Map();
    for (const item of order.items) {
        if (item.component_snapshots.length > 0) {
            for (const snapshot of item.component_snapshots) {
                if (!snapshot.component_product_id)
                    continue;
                required.set(snapshot.component_product_id, (required.get(snapshot.component_product_id) ?? 0) + snapshot.total_component_quantity);
            }
            continue;
        }
        if (item.product_id) {
            required.set(item.product_id, (required.get(item.product_id) ?? 0) + item.quantity);
        }
    }
    for (const [productId, quantity] of [...required.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        await applyStockDelta(tx, order.company_id, productId, quantity);
    }
    await tx.commerceOrder.update({
        where: { id: orderId },
        data: {
            stock_restored_at: new Date(),
        },
    });
}
function shouldDeductCommerceStock(params) {
    return (params.previousPaymentStatus !== client_1.CommercePaymentStatus.PAYMENT_CONFIRMED &&
        params.newPaymentStatus === client_1.CommercePaymentStatus.PAYMENT_CONFIRMED);
}
