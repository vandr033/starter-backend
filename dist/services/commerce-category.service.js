"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCommerceCategories = listCommerceCategories;
exports.createCommerceCategory = createCommerceCategory;
exports.updateCommerceCategory = updateCommerceCategory;
exports.deleteCommerceCategory = deleteCommerceCategory;
exports.reorderCommerceCategories = reorderCommerceCategories;
const client_1 = require("../prisma/client");
async function listCommerceCategories(companyId) {
    const categories = await client_1.prisma.commerceCategory.findMany({
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
async function createCommerceCategory(companyId, input) {
    const category = await client_1.prisma.commerceCategory.create({
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
async function updateCommerceCategory(companyId, categoryId, input) {
    const existing = await client_1.prisma.commerceCategory.findFirst({
        where: { id: categoryId, company_id: companyId },
    });
    if (!existing) {
        return { code: 404, error: true, message: 'No encontramos la categoría.' };
    }
    const category = await client_1.prisma.commerceCategory.update({
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
async function deleteCommerceCategory(companyId, categoryId) {
    const existing = await client_1.prisma.commerceCategory.findFirst({
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
        await client_1.prisma.commerceProduct.updateMany({
            where: { category_id: categoryId, company_id: companyId },
            data: { category_id: null },
        });
    }
    await client_1.prisma.commerceCategory.delete({
        where: { id: categoryId },
    });
    return {
        code: 200,
        error: false,
        message: 'Categoría eliminada.',
    };
}
async function reorderCommerceCategories(companyId, ids) {
    await client_1.prisma.$transaction(ids.map((id, index) => client_1.prisma.commerceCategory.updateMany({
        where: { id, company_id: companyId },
        data: { sort_order: index },
    })));
    return {
        code: 200,
        error: false,
        message: 'Orden de categorías actualizado.',
    };
}
