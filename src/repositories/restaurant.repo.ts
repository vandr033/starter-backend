import { prisma } from '../prisma/client';

export const restaurantRepo = {
  getAccess: (companyId: number) => prisma.company.findUnique({ where: { id: companyId }, select: { plan: true, restaurant_enabled: true } }),
  getSettings: (companyId: number) => prisma.restaurantSettings.findFirst({ where: { company_id: companyId } }),
  listAreas: (companyId: number) => prisma.restaurantDiningArea.findMany({ where: { company_id: companyId }, orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] }),
  findArea: (companyId: number, id: number) => prisma.restaurantDiningArea.findFirst({ where: { id, company_id: companyId } }),
  listTables: (companyId: number, diningAreaId?: number) => prisma.restaurantTable.findMany({ where: { company_id: companyId, ...(diningAreaId ? { dining_area_id: diningAreaId } : {}) }, include: { dining_area: true }, orderBy: [{ dining_area: { sort_order: 'asc' } }, { sort_order: 'asc' }, { name: 'asc' }] }),
  findTable: (companyId: number, id: number) => prisma.restaurantTable.findFirst({ where: { id, company_id: companyId } }),
  listPeriods: (companyId: number, dayOfWeek?: number) => prisma.restaurantServicePeriod.findMany({ where: { company_id: companyId, ...(dayOfWeek === undefined ? {} : { day_of_week: dayOfWeek }) }, orderBy: [{ day_of_week: 'asc' }, { sort_order: 'asc' }, { start_time: 'asc' }] }),
  findPeriod: (companyId: number, id: number) => prisma.restaurantServicePeriod.findFirst({ where: { id, company_id: companyId } }),
};
