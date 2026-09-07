import { prisma } from '../prisma/client';
import * as CommerceRepo from '../repositories/commerce.repo';
import { getValidCoordinates } from '../utils/coordinates';

type ServiceResult = {
    code: number;
    error: boolean;
    message: string;
    data?: any;
};

function serializePointOfSale(pointOfSale: any) {
    const coordinates = getValidCoordinates(pointOfSale.latitude, pointOfSale.longitude);
    return {
        ...pointOfSale,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
    };
}

export async function listAdminCommercePointsOfSale(companyId: number): Promise<ServiceResult> {
    const points = await CommerceRepo.listAdminCommercePointsOfSale(companyId);
    return {
        code: 200,
        error: false,
        message: 'Puntos de venta obtenidos correctamente.',
        data: points.map(serializePointOfSale),
    };
}

export async function createAdminCommercePointOfSale(
    companyId: number,
    input: {
        name: string;
        address: string;
        opening_time: string;
        closing_time: string;
        latitude: number;
        longitude: number;
        google_maps_url: string;
        notes?: string | null;
        is_active?: boolean;
        sort_order?: number;
    },
): Promise<ServiceResult> {
    const store = await CommerceRepo.getOrCreateCommerceStore(companyId);
    const created = await prisma.commercePointOfSale.create({
        data: {
            company_id: companyId,
            store_id: store.id,
            name: input.name.trim(),
            address: input.address.trim(),
            opening_time: input.opening_time.trim(),
            closing_time: input.closing_time.trim(),
            latitude: input.latitude,
            longitude: input.longitude,
            google_maps_url: input.google_maps_url.trim(),
            notes: input.notes?.trim() || null,
            is_active: input.is_active ?? true,
            sort_order: input.sort_order ?? 0,
        },
    });

    return {
        code: 201,
        error: false,
        message: 'Punto de venta creado correctamente.',
        data: serializePointOfSale(created),
    };
}

export async function updateAdminCommercePointOfSale(
    companyId: number,
    pointOfSaleId: string,
    input: {
        name?: string;
        address?: string;
        opening_time?: string;
        closing_time?: string;
        latitude?: number;
        longitude?: number;
        google_maps_url?: string;
        notes?: string | null;
        is_active?: boolean;
        sort_order?: number;
    },
): Promise<ServiceResult> {
    const existing = await CommerceRepo.getAdminCommercePointOfSale(companyId, pointOfSaleId);
    if (!existing) {
        return { code: 404, error: true, message: 'No encontramos el punto de venta.' };
    }

    const updated = await prisma.commercePointOfSale.update({
        where: { id: existing.id },
        data: {
            name: input.name?.trim(),
            address: input.address?.trim(),
            opening_time: input.opening_time?.trim(),
            closing_time: input.closing_time?.trim(),
            latitude: input.latitude,
            longitude: input.longitude,
            google_maps_url: input.google_maps_url?.trim(),
            notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
            is_active: input.is_active,
            sort_order: input.sort_order,
        },
    });

    return {
        code: 200,
        error: false,
        message: 'Punto de venta actualizado correctamente.',
        data: serializePointOfSale(updated),
    };
}

export async function deleteAdminCommercePointOfSale(companyId: number, pointOfSaleId: string): Promise<ServiceResult> {
    const existing = await CommerceRepo.getAdminCommercePointOfSale(companyId, pointOfSaleId);
    if (!existing) {
        return { code: 404, error: true, message: 'No encontramos el punto de venta.' };
    }

    await prisma.commercePointOfSale.delete({
        where: { id: existing.id },
    });

    return {
        code: 200,
        error: false,
        message: 'Punto de venta eliminado correctamente.',
        data: { id: existing.id },
    };
}
