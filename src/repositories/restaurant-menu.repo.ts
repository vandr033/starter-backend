import { prisma } from '../prisma/client';

export const restaurantMenuRepo = {
  findCategory: (companyId: number, id: number) => prisma.restaurantMenuCategory.findFirst({ where: { id, company_id: companyId } }),
  listCategories: (companyId: number) => prisma.restaurantMenuCategory.findMany({
    where: { company_id: companyId }, include: { _count: { select: { items: true } } }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  }),
  findItem: (companyId: number, id: number) => prisma.restaurantMenuItem.findFirst({ where: { id, company_id: companyId, category: { company_id: companyId } }, include: { category: true } }),
  listItems: (companyId: number, input: { categoryId?: number; isActive?: boolean; isAvailable?: boolean; isFeatured?: boolean; search?: string; skip?: number; take?: number }) => prisma.restaurantMenuItem.findMany({
    where: { company_id: companyId, category: { company_id: companyId }, ...(input.categoryId ? { category_id: input.categoryId } : {}), ...(input.isActive === undefined ? {} : { is_active: input.isActive }), ...(input.isAvailable === undefined ? {} : { is_available: input.isAvailable }), ...(input.isFeatured === undefined ? {} : { is_featured: input.isFeatured }), ...(input.search ? { OR: [{ name: { contains: input.search } }, { description: { contains: input.search } }] } : {}) },
    include: { category: true }, orderBy: [{ category: { sort_order: 'asc' } }, { sort_order: 'asc' }, { id: 'asc' }], skip: input.skip, take: input.take,
  }),
};
