"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCommerceComboDefinition = validateCommerceComboDefinition;
exports.computeComboAvailableUnits = computeComboAvailableUnits;
exports.buildCommerceComponentSnapshots = buildCommerceComponentSnapshots;
const client_1 = require("@prisma/client");
function validateCommerceComboDefinition(params) {
    if (params.items.length === 0) {
        return 'Un combo necesita al menos un componente.';
    }
    const componentProductsById = new Map(params.componentProducts.map((product) => [product.id, product]));
    const seen = new Set();
    for (const item of params.items) {
        if (!item.componentProductId) {
            return 'Cada componente del combo debe tener un producto.';
        }
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            return 'La cantidad de cada componente debe ser un entero positivo.';
        }
        if (item.componentProductId === params.comboProductId) {
            return 'Un combo no puede incluirse a sí mismo.';
        }
        if (seen.has(item.componentProductId)) {
            return 'No repitas el mismo componente dentro del combo.';
        }
        if (!componentProductsById.has(item.componentProductId)) {
            return 'Uno de los componentes no existe o no pertenece a esta empresa.';
        }
        seen.add(item.componentProductId);
    }
    for (const product of params.componentProducts) {
        if (product.product_type !== client_1.CommerceProductType.SIMPLE) {
            return 'En V1, un combo solo puede contener productos simples.';
        }
    }
    return null;
}
function computeComboAvailableUnits(params) {
    const limits = params.items
        .filter((item) => item.componentProduct.track_stock)
        .map((item) => {
        if (item.componentProduct.allow_out_of_stock_orders)
            return Number.POSITIVE_INFINITY;
        return Math.floor(item.componentProduct.stock_quantity / item.quantity);
    });
    if (limits.length === 0)
        return null;
    const min = Math.min(...limits);
    return Number.isFinite(min) ? min : null;
}
function buildCommerceComponentSnapshots(params) {
    return params.items.map((item) => ({
        componentProductId: item.componentProduct.id,
        componentNameSnapshot: item.componentProduct.name,
        componentQuantityPerCombo: item.quantity,
        totalComponentQuantity: item.quantity * params.quantity,
    }));
}
