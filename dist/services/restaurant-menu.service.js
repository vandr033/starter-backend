"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCategories = listCategories;
exports.createCategory = createCategory;
exports.getCategory = getCategory;
exports.updateCategory = updateCategory;
exports.deleteCategory = deleteCategory;
exports.reorderCategories = reorderCategories;
exports.listItems = listItems;
exports.createItem = createItem;
exports.getItem = getItem;
exports.updateItem = updateItem;
exports.deleteItem = deleteItem;
exports.reorderItems = reorderItems;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const restaurant_menu_repo_1 = require("../repositories/restaurant-menu.repo");
const ok = (data, message = 'Operación realizada correctamente.', code = 200) => ({ code, error: false, message, data });
const fail = (code, message) => ({ code, error: true, message });
const duplicate = (error) => error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
async function listCategories(companyId) { return ok(await restaurant_menu_repo_1.restaurantMenuRepo.listCategories(companyId)); }
async function createCategory(companyId, input) {
    try {
        return ok(await client_2.prisma.restaurantMenuCategory.create({ data: { company_id: companyId, ...input } }), 'Categoría creada.', 201);
    }
    catch (error) {
        return duplicate(error) ? fail(409, 'Ya existe una categoría con ese nombre.') : fail(500, 'No pudimos crear la categoría.');
    }
}
async function getCategory(companyId, id) { const row = await restaurant_menu_repo_1.restaurantMenuRepo.findCategory(companyId, id); return row ? ok(row) : fail(404, 'No encontramos la categoría.'); }
async function updateCategory(companyId, id, input) {
    const row = await restaurant_menu_repo_1.restaurantMenuRepo.findCategory(companyId, id);
    if (!row)
        return fail(404, 'No encontramos la categoría.');
    try {
        const changed = await client_2.prisma.restaurantMenuCategory.updateMany({ where: { id: row.id, company_id: companyId }, data: input });
        if (!changed.count)
            return fail(409, 'La categoría cambió de empresa o ya no está disponible.');
        return ok(await restaurant_menu_repo_1.restaurantMenuRepo.findCategory(companyId, row.id), 'Categoría actualizada.');
    }
    catch (error) {
        return duplicate(error) ? fail(409, 'Ya existe una categoría con ese nombre.') : fail(500, 'No pudimos actualizar la categoría.');
    }
}
async function deleteCategory(companyId, id) {
    const row = await client_2.prisma.restaurantMenuCategory.findFirst({ where: { id, company_id: companyId }, include: { _count: { select: { items: true } } } });
    if (!row)
        return fail(404, 'No encontramos la categoría.');
    if (row._count.items)
        return fail(409, 'No se puede eliminar esta categoría porque todavía contiene productos.');
    const deleted = await client_2.prisma.restaurantMenuCategory.deleteMany({ where: { id: row.id, company_id: companyId } });
    if (!deleted.count)
        return fail(409, 'La categoría cambió de empresa o ya no está disponible.');
    return ok(null, 'Categoría eliminada.');
}
async function reorderCategories(companyId, items) {
    const ids = items.map((item) => item.id);
    const count = await client_2.prisma.restaurantMenuCategory.count({ where: { company_id: companyId, id: { in: ids } } });
    if (count !== ids.length)
        return fail(404, 'Una o más categorías no pertenecen a esta empresa.');
    await client_2.prisma.$transaction(items.map((item) => client_2.prisma.restaurantMenuCategory.updateMany({ where: { id: item.id, company_id: companyId }, data: { sort_order: item.sortOrder } })));
    return ok(null, 'Orden de categorías actualizado.');
}
async function listItems(companyId, input) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const filter = { ...input, skip: (page - 1) * limit, take: limit };
    const [items, total] = await Promise.all([restaurant_menu_repo_1.restaurantMenuRepo.listItems(companyId, filter), client_2.prisma.restaurantMenuItem.count({ where: { company_id: companyId, category: { company_id: companyId }, ...(input.categoryId ? { category_id: input.categoryId } : {}) } })]);
    return ok({ items, pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total } });
}
async function createItem(companyId, input) {
    const category = await restaurant_menu_repo_1.restaurantMenuRepo.findCategory(companyId, input.category_id);
    if (!category)
        return fail(404, 'No encontramos la categoría seleccionada.');
    return ok(await client_2.prisma.restaurantMenuItem.create({ data: { company_id: companyId, ...input } }), 'Producto creado.', 201);
}
async function getItem(companyId, id) { const row = await restaurant_menu_repo_1.restaurantMenuRepo.findItem(companyId, id); return row ? ok(row) : fail(404, 'No encontramos el producto.'); }
async function updateItem(companyId, id, input) {
    const row = await restaurant_menu_repo_1.restaurantMenuRepo.findItem(companyId, id);
    if (!row)
        return fail(404, 'No encontramos el producto.');
    if (input.category_id && !(await restaurant_menu_repo_1.restaurantMenuRepo.findCategory(companyId, input.category_id)))
        return fail(404, 'No encontramos la categoría seleccionada.');
    const changed = await client_2.prisma.restaurantMenuItem.updateMany({ where: { id: row.id, company_id: companyId, category: { company_id: companyId } }, data: input });
    if (!changed.count)
        return fail(409, 'El producto cambió de empresa o ya no está disponible.');
    return ok(await restaurant_menu_repo_1.restaurantMenuRepo.findItem(companyId, row.id), 'Producto actualizado.');
}
async function deleteItem(companyId, id) {
    const row = await restaurant_menu_repo_1.restaurantMenuRepo.findItem(companyId, id);
    if (!row)
        return fail(404, 'No encontramos el producto.');
    const changed = await client_2.prisma.restaurantMenuItem.updateMany({ where: { id: row.id, company_id: companyId, category: { company_id: companyId } }, data: { is_active: false } });
    if (!changed.count)
        return fail(409, 'El producto cambió de empresa o ya no está disponible.');
    return ok(null, 'Producto desactivado.');
}
async function reorderItems(companyId, items) {
    const ids = items.map((item) => item.id);
    const rows = await client_2.prisma.restaurantMenuItem.findMany({ where: { company_id: companyId, id: { in: ids } }, select: { id: true, category_id: true } });
    if (rows.length !== ids.length)
        return fail(404, 'Uno o más productos no pertenecen a esta empresa.');
    if (new Set(rows.map((row) => row.category_id)).size > 1)
        return fail(400, 'Los productos deben pertenecer a la misma categoría para reordenarse.');
    await client_2.prisma.$transaction(items.map((item) => client_2.prisma.restaurantMenuItem.updateMany({ where: { id: item.id, company_id: companyId, category: { company_id: companyId } }, data: { sort_order: item.sortOrder } })));
    return ok(null, 'Orden de productos actualizado.');
}
