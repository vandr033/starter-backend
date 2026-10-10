"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restaurantRepo = void 0;
const client_1 = require("../prisma/client");
exports.restaurantRepo = {
    getAccess: (companyId) => client_1.prisma.company.findUnique({ where: { id: companyId }, select: { plan: true, restaurant_enabled: true } }),
    getSettings: (companyId) => client_1.prisma.restaurantSettings.findFirst({ where: { company_id: companyId } }),
    listAreas: (companyId) => client_1.prisma.restaurantDiningArea.findMany({ where: { company_id: companyId }, orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] }),
    findArea: (companyId, id) => client_1.prisma.restaurantDiningArea.findFirst({ where: { id, company_id: companyId } }),
    listTables: (companyId, diningAreaId) => client_1.prisma.restaurantTable.findMany({ where: { company_id: companyId, ...(diningAreaId ? { dining_area_id: diningAreaId } : {}) }, include: { dining_area: true }, orderBy: [{ dining_area: { sort_order: 'asc' } }, { sort_order: 'asc' }, { name: 'asc' }] }),
    findTable: (companyId, id) => client_1.prisma.restaurantTable.findFirst({ where: { id, company_id: companyId } }),
    listPeriods: (companyId, dayOfWeek) => client_1.prisma.restaurantServicePeriod.findMany({ where: { company_id: companyId, ...(dayOfWeek === undefined ? {} : { day_of_week: dayOfWeek }) }, orderBy: [{ day_of_week: 'asc' }, { sort_order: 'asc' }, { start_time: 'asc' }] }),
    findPeriod: (companyId, id) => client_1.prisma.restaurantServicePeriod.findFirst({ where: { id, company_id: companyId } }),
};
