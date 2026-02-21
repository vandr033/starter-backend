import { prisma } from '../prisma/client';

/**
 * Get all categories for a company
 */
export async function getCategoriesByCompany(companyId: number) {
    return prisma.category.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
        },
        // TODO: Uncomment once database schema is updated
        // include: {
        //     global_service_type: {
        //         select: {
        //             id: true,
        //             key: true,
        //             name: true,
        //         },
        //     },
        // },
        orderBy: {
            position: 'asc',
        },
    });
}

/**
 * Get a single category by ID with ownership check
 */
export async function getCategoryById(id: number, companyId: number) {
    return prisma.category.findFirst({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
    });
}

/**
 * Check if slug is unique for the company
 */
export async function isSlugUnique(slug: string, companyId: number, excludeId?: number) {
    const category = await prisma.category.findFirst({
        where: {
            company_id: companyId,
            slug,
            deleted_at: null,
            ...(excludeId && { id: { not: excludeId } }),
        },
    });
    return !category;
}

/**
 * Get the next position for a category in a company
 */
export async function getNextPosition(companyId: number) {
    const maxPosition = await prisma.category.aggregate({
        where: {
            company_id: companyId,
            deleted_at: null,
        },
        _max: {
            position: true,
        },
    });

    return (maxPosition._max.position ?? -1) + 1;
}

/**
 * Create a new category
 */
export interface CreateCategoryData {
    company_id: number;
    name: string;
    slug: string;
    description?: string;
    position?: number;
    global_service_type_id?: number;
}

export async function createCategory(data: CreateCategoryData) {
    return prisma.category.create({
        data: {
            company_id: data.company_id,
            name: data.name,
            slug: data.slug,
            description: data.description,
            position: data.position ?? 0,
            // TODO: Uncomment once database schema is updated
            // global_service_type_id: data.global_service_type_id,
        },
    });
}

/**
 * Update a category
 */
export interface UpdateCategoryData {
    name?: string;
    slug?: string;
    description?: string;
    position?: number;
    is_active?: boolean;
    global_service_type_id?: number;
}

export async function updateCategory(id: number, companyId: number, data: UpdateCategoryData) {
    return prisma.category.updateMany({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        data,
    });
}

/**
 * Get updated category after update
 */
export async function getUpdatedCategory(id: number, companyId: number) {
    return prisma.category.findFirst({
        where: {
            id,
            company_id: companyId,
        },
    });
}

/**
 * Soft delete a category
 */
export async function softDeleteCategory(id: number, companyId: number) {
    return prisma.category.updateMany({
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

/**
 * Get a global service type by ID
 */
export async function getGlobalServiceTypeById(id: number) {
    return prisma.globalServiceType.findUnique({
        where: { id },
    });
}

/**
 * Get all global service types
 */
export async function getAllGlobalServiceTypes() {
    return prisma.globalServiceType.findMany({
        select: {
            id: true,
            key: true,
            name: true,
            description: true,
        },
        orderBy: {
            name: 'asc',
        },
    });
}
