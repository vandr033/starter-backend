import { prisma } from '../prisma/client';

type ServiceResult = {
    code: number;
    error: boolean;
    message: string;
    data?: any;
};

export async function listCommerceCategories(companyId: number): Promise<ServiceResult> {
    const categories = await prisma.commerceCategory.findMany({
        where: { company_id: companyId },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });

    return {
        code: 200,
        error: false,
        message: 'Categorías obtenidas correctamente.',
        data: categories,
    };
}

export async function createCommerceCategory(
    companyId: number,
    input: {
        name: string;
        slug: string;
        description?: string | null;
        image_url?: string | null;
        is_active?: boolean;
        sort_order?: number;
    },
): Promise<ServiceResult> {
    const category = await prisma.commerceCategory.create({
        data: {
            company_id: companyId,
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            image_url: input.image_url ?? null,
            is_active: input.is_active ?? true,
            sort_order: input.sort_order ?? 0,
        },
    });

    return {
        code: 201,
        error: false,
        message: 'Categoría creada correctamente.',
        data: category,
    };
}

export async function updateCommerceCategory(
    companyId: number,
    categoryId: string,
    input: {
        name?: string;
        slug?: string;
        description?: string | null;
        image_url?: string | null;
        is_active?: boolean;
        sort_order?: number;
    },
): Promise<ServiceResult> {
    const existing = await prisma.commerceCategory.findFirst({
        where: { id: categoryId, company_id: companyId },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'No encontramos la categoría.' };
    }

    const category = await prisma.commerceCategory.update({
        where: { id: categoryId },
        data: input,
    });

    return {
        code: 200,
        error: false,
        message: 'Categoría actualizada.',
        data: category,
    };
}

export async function deleteCommerceCategory(
    companyId: number,
    categoryId: string,
): Promise<ServiceResult> {
    const existing = await prisma.commerceCategory.findFirst({
        where: { id: categoryId, company_id: companyId },
        include: {
            products: {
                select: { id: true },
            },
        },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'No encontramos la categoría.' };
    }

    if (existing.products.length > 0) {
        await prisma.commerceProduct.updateMany({
            where: { category_id: categoryId, company_id: companyId },
            data: { category_id: null },
        });
    }

    await prisma.commerceCategory.delete({
        where: { id: categoryId },
    });

    return {
        code: 200,
        error: false,
        message: 'Categoría eliminada.',
    };
}

export async function reorderCommerceCategories(
    companyId: number,
    ids: string[],
): Promise<ServiceResult> {
    await prisma.$transaction(
        ids.map((id, index) =>
            prisma.commerceCategory.updateMany({
                where: { id, company_id: companyId },
                data: { sort_order: index },
            }),
        ),
    );

    return {
        code: 200,
        error: false,
        message: 'Orden de categorías actualizado.',
    };
}
