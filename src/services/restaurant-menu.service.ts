import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { restaurantMenuRepo } from '../repositories/restaurant-menu.repo';

type Result = { code: number; error: boolean; message: string; data?: unknown };
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });
const duplicate = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export async function listCategories(companyId: number) { return ok(await restaurantMenuRepo.listCategories(companyId)); }
export async function createCategory(companyId: number, input: any): Promise<Result> {
  try { return ok(await prisma.restaurantMenuCategory.create({ data: { company_id: companyId, ...input } }), 'Categoría creada.', 201); }
  catch (error) { return duplicate(error) ? fail(409, 'Ya existe una categoría con ese nombre.') : fail(500, 'No pudimos crear la categoría.'); }
}
export async function getCategory(companyId: number, id: number): Promise<Result> { const row = await restaurantMenuRepo.findCategory(companyId, id); return row ? ok(row) : fail(404, 'No encontramos la categoría.'); }
export async function updateCategory(companyId: number, id: number, input: any): Promise<Result> {
  const row = await restaurantMenuRepo.findCategory(companyId, id); if (!row) return fail(404, 'No encontramos la categoría.');
  try {
    const changed = await prisma.restaurantMenuCategory.updateMany({ where: { id: row.id, company_id: companyId }, data: input });
    if (!changed.count) return fail(409, 'La categoría cambió de empresa o ya no está disponible.');
    return ok(await restaurantMenuRepo.findCategory(companyId, row.id), 'Categoría actualizada.');
  }
  catch (error) { return duplicate(error) ? fail(409, 'Ya existe una categoría con ese nombre.') : fail(500, 'No pudimos actualizar la categoría.'); }
}
export async function deleteCategory(companyId: number, id: number): Promise<Result> {
  const row = await prisma.restaurantMenuCategory.findFirst({ where: { id, company_id: companyId }, include: { _count: { select: { items: true } } } });
  if (!row) return fail(404, 'No encontramos la categoría.');
  if (row._count.items) return fail(409, 'No se puede eliminar esta categoría porque todavía contiene productos.');
  const deleted = await prisma.restaurantMenuCategory.deleteMany({ where: { id: row.id, company_id: companyId } });
  if (!deleted.count) return fail(409, 'La categoría cambió de empresa o ya no está disponible.');
  return ok(null, 'Categoría eliminada.');
}
export async function reorderCategories(companyId: number, items: Array<{ id: number; sortOrder: number }>): Promise<Result> {
  const ids = items.map((item) => item.id); const count = await prisma.restaurantMenuCategory.count({ where: { company_id: companyId, id: { in: ids } } });
  if (count !== ids.length) return fail(404, 'Una o más categorías no pertenecen a esta empresa.');
  await prisma.$transaction(items.map((item) => prisma.restaurantMenuCategory.updateMany({ where: { id: item.id, company_id: companyId }, data: { sort_order: item.sortOrder } })));
  return ok(null, 'Orden de categorías actualizado.');
}

export async function listItems(companyId: number, input: any): Promise<Result> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100); const page = Math.max(input.page ?? 1, 1);
  const filter = { ...input, skip: (page - 1) * limit, take: limit };
  const [items, total] = await Promise.all([restaurantMenuRepo.listItems(companyId, filter), prisma.restaurantMenuItem.count({ where: { company_id: companyId, category: { company_id: companyId }, ...(input.categoryId ? { category_id: input.categoryId } : {}) } })]);
  return ok({ items, pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total } });
}
export async function createItem(companyId: number, input: any): Promise<Result> {
  const category = await restaurantMenuRepo.findCategory(companyId, input.category_id); if (!category) return fail(404, 'No encontramos la categoría seleccionada.');
  return ok(await prisma.restaurantMenuItem.create({ data: { company_id: companyId, ...input } }), 'Producto creado.', 201);
}
export async function getItem(companyId: number, id: number): Promise<Result> { const row = await restaurantMenuRepo.findItem(companyId, id); return row ? ok(row) : fail(404, 'No encontramos el producto.'); }
export async function updateItem(companyId: number, id: number, input: any): Promise<Result> {
  const row = await restaurantMenuRepo.findItem(companyId, id); if (!row) return fail(404, 'No encontramos el producto.');
  if (input.category_id && !(await restaurantMenuRepo.findCategory(companyId, input.category_id))) return fail(404, 'No encontramos la categoría seleccionada.');
  const changed = await prisma.restaurantMenuItem.updateMany({ where: { id: row.id, company_id: companyId, category: { company_id: companyId } }, data: input });
  if (!changed.count) return fail(409, 'El producto cambió de empresa o ya no está disponible.');
  return ok(await restaurantMenuRepo.findItem(companyId, row.id), 'Producto actualizado.');
}
export async function deleteItem(companyId: number, id: number): Promise<Result> {
  const row = await restaurantMenuRepo.findItem(companyId, id); if (!row) return fail(404, 'No encontramos el producto.');
  const changed = await prisma.restaurantMenuItem.updateMany({ where: { id: row.id, company_id: companyId, category: { company_id: companyId } }, data: { is_active: false } });
  if (!changed.count) return fail(409, 'El producto cambió de empresa o ya no está disponible.');
  return ok(null, 'Producto desactivado.');
}
export async function reorderItems(companyId: number, items: Array<{ id: number; sortOrder: number }>): Promise<Result> {
  const ids = items.map((item) => item.id); const rows = await prisma.restaurantMenuItem.findMany({ where: { company_id: companyId, id: { in: ids } }, select: { id: true, category_id: true } });
  if (rows.length !== ids.length) return fail(404, 'Uno o más productos no pertenecen a esta empresa.');
  if (new Set(rows.map((row) => row.category_id)).size > 1) return fail(400, 'Los productos deben pertenecer a la misma categoría para reordenarse.');
  await prisma.$transaction(items.map((item) => prisma.restaurantMenuItem.updateMany({ where: { id: item.id, company_id: companyId, category: { company_id: companyId } }, data: { sort_order: item.sortOrder } })));
  return ok(null, 'Orden de productos actualizado.');
}
