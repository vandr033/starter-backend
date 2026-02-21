import { prisma } from '../prisma/client';

/**
 * Get all services for a company, ordered by category position then service position
 */
export async function getServicesByCompany(companyId: number) {
    return prisma.service.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
        },
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    position: true,
                },
            },
        },
        orderBy: [
            { category: { position: 'asc' } },
            { position: 'asc' },
        ],
    });
}

/**
 * Get a single service by ID with ownership check
 */
export async function getServiceById(id: number, companyId: number) {
    return prisma.service.findFirst({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                },
            },
        },
    });
}

/**
 * Get category by ID with company ownership check
 */
export async function getCategoryById(categoryId: number, companyId: number) {
    return prisma.category.findFirst({
        where: {
            id: categoryId,
            company_id: companyId,
            deleted_at: null,
        },
    });
}

/**
 * Get the next position for a service in a category
 */
export async function getNextPosition(categoryId: number) {
    const maxPosition = await prisma.service.aggregate({
        where: {
            category_id: categoryId,
            deleted_at: null,
        },
        _max: {
            position: true,
        },
    });

    return (maxPosition._max.position ?? -1) + 1;
}

/**
 * Create a new service
 */
export interface CreateServiceData {
    company_id: number;
    category_id: number;
    name: string;
    description?: string;
    price_cents: number;
    duration_minutes: number;
    position?: number;
    global_type_id?: number;
}

export async function createService(data: CreateServiceData) {
    return prisma.service.create({
        data: {
            company_id: data.company_id,
            category_id: data.category_id,
            name: data.name,
            description: data.description,
            price_cents: data.price_cents,
            duration_minutes: data.duration_minutes,
            position: data.position ?? 0,
            global_type_id: data.global_type_id,
        },
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                },
            },
        },
    });
}

/**
 * Update a service
 */
export interface UpdateServiceData {
    name?: string;
    description?: string;
    price_cents?: number;
    duration_minutes?: number;
    position?: number;
    is_active?: boolean;
    category_id?: number;
    global_type_id?: number;
}

export async function updateService(id: number, companyId: number, data: UpdateServiceData) {
    return prisma.service.updateMany({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        data,
    });
}

/**
 * Get updated service after update
 */
export async function getUpdatedService(id: number, companyId: number) {
    return prisma.service.findFirst({
        where: {
            id,
            company_id: companyId,
        },
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                },
            },
        },
    });
}

/**
 * Soft delete a service
 */
export async function softDeleteService(id: number, companyId: number) {
    return prisma.service.updateMany({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        data: {
            deleted_at: new Date(),
        },
    });
}
