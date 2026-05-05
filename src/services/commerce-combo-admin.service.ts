import { CommerceProductType } from '@prisma/client';
import * as CommerceProductService from './commerce-product.service';

type ComboFilters = {
    search?: string;
    category_id?: string;
    status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
    page?: number;
    limit?: number;
};

type ComboInput = {
    category_id?: string | null;
    name?: string;
    slug?: string;
    description?: string | null;
    price?: number;
    regular_price?: number | null;
    promo_price?: number | null;
    promo_starts_at?: Date | null;
    promo_ends_at?: Date | null;
    promo_label?: string | null;
    is_active?: boolean;
    is_featured?: boolean;
    track_stock?: boolean;
    stock_quantity?: number;
    low_stock_threshold?: number | null;
    allow_out_of_stock_orders?: boolean;
    available_for_pickup?: boolean;
    available_for_delivery?: boolean;
    sort_order?: number;
    items?: Array<{
        productId: string;
        quantity: number;
    }>;
};

function mapComboItems(items?: ComboInput['items']) {
    return items?.map((item) => ({
        componentProductId: item.productId,
        quantity: item.quantity,
    }));
}

export async function listCommerceCombos(companyId: number, filters: ComboFilters = {}) {
    const result = await CommerceProductService.listCommerceProducts(companyId, {
        ...filters,
        product_type: CommerceProductType.COMBO,
    });

    return {
        ...result,
        message: 'Combos obtenidos correctamente.',
    };
}

export async function getCommerceCombo(companyId: number, comboId: string) {
    const result = await CommerceProductService.getCommerceProduct(
        companyId,
        comboId,
        CommerceProductType.COMBO,
    );

    return result.error
        ? result
        : {
              ...result,
              message: 'Combo obtenido correctamente.',
          };
}

export async function createCommerceCombo(companyId: number, input: ComboInput) {
    return CommerceProductService.createCommerceProduct(
        companyId,
        {
            ...input,
            product_type: CommerceProductType.COMBO,
            combo_items: mapComboItems(input.items),
        },
        CommerceProductType.COMBO,
    );
}

export async function updateCommerceCombo(companyId: number, comboId: string, input: ComboInput) {
    return CommerceProductService.updateCommerceProduct(
        companyId,
        comboId,
        {
            ...input,
            product_type: CommerceProductType.COMBO,
            combo_items: mapComboItems(input.items),
        },
        CommerceProductType.COMBO,
    );
}

export async function deleteCommerceCombo(companyId: number, comboId: string) {
    return CommerceProductService.deleteCommerceProduct(
        companyId,
        comboId,
        CommerceProductType.COMBO,
    );
}
