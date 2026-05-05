import { CommerceProductType, Prisma } from '@prisma/client';

type ComboComponent = {
    id: string;
    name: string;
    product_type: CommerceProductType;
    is_active: boolean;
    track_stock: boolean;
    stock_quantity: number;
    allow_out_of_stock_orders: boolean;
};

type ComboItemInput = {
    componentProductId: string;
    quantity: number;
};

export function validateCommerceComboDefinition(params: {
    comboProductId: string;
    companyId: number;
    items: ComboItemInput[];
    componentProducts: ComboComponent[];
}): string | null {
    if (params.items.length === 0) {
        return 'Un combo necesita al menos un componente.';
    }

    const componentProductsById = new Map(
        params.componentProducts.map((product) => [product.id, product] as const),
    );

    const seen = new Set<string>();
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
        if (product.product_type !== CommerceProductType.SIMPLE) {
            return 'En V1, un combo solo puede contener productos simples.';
        }
    }

    return null;
}

export function computeComboAvailableUnits(params: {
    items: Array<{
        quantity: number;
        componentProduct: Pick<
            ComboComponent,
            'track_stock' | 'stock_quantity' | 'allow_out_of_stock_orders'
        >;
    }>;
}): number | null {
    const limits = params.items
        .filter((item) => item.componentProduct.track_stock)
        .map((item) => {
            if (item.componentProduct.allow_out_of_stock_orders) return Number.POSITIVE_INFINITY;
            return Math.floor(item.componentProduct.stock_quantity / item.quantity);
        });

    if (limits.length === 0) return null;

    const min = Math.min(...limits);
    return Number.isFinite(min) ? min : null;
}

export type CommerceComponentSnapshotInput = {
    componentProductId: string;
    componentNameSnapshot: string;
    componentQuantityPerCombo: number;
    totalComponentQuantity: number;
};

export function buildCommerceComponentSnapshots(params: {
    quantity: number;
    items: Array<{
        quantity: number;
        componentProduct: { id: string; name: string };
    }>;
}): CommerceComponentSnapshotInput[] {
    return params.items.map((item) => ({
        componentProductId: item.componentProduct.id,
        componentNameSnapshot: item.componentProduct.name,
        componentQuantityPerCombo: item.quantity,
        totalComponentQuantity: item.quantity * params.quantity,
    }));
}
