"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccess = getAccess;
exports.setAccess = setAccess;
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
exports.listAreas = listAreas;
exports.createArea = createArea;
exports.updateArea = updateArea;
exports.deleteArea = deleteArea;
exports.listTables = listTables;
exports.createTable = createTable;
exports.updateTable = updateTable;
exports.deleteTable = deleteTable;
exports.listPeriods = listPeriods;
exports.createPeriod = createPeriod;
exports.updatePeriod = updatePeriod;
exports.deletePeriod = deletePeriod;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const restaurant_repo_1 = require("../repositories/restaurant.repo");
const ok = (data, message = 'Operación realizada correctamente.', code = 200) => ({ code, error: false, message, data });
const fail = (code, message) => ({ code, error: true, message });
function prismaError(error) {
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return fail(409, 'Ya existe un registro con esos datos.');
    return null;
}
async function getAccess(companyId) {
    const access = await restaurant_repo_1.restaurantRepo.getAccess(companyId);
    if (!access)
        return fail(404, 'No encontramos la empresa.');
    return ok({ entitled: true, enabled: access.restaurant_enabled, plan: access.plan });
}
async function setAccess(companyId, enabled) {
    const access = await client_2.prisma.$transaction(async (tx) => {
        const company = await tx.company.update({ where: { id: companyId }, data: { restaurant_enabled: enabled }, select: { plan: true, restaurant_enabled: true } });
        let settings = null;
        if (enabled) {
            settings = await tx.restaurantSettings.upsert({ where: { company_id: companyId }, create: { company_id: companyId }, update: {} });
        }
        return { entitled: true, enabled: company.restaurant_enabled, plan: company.plan, settings };
    });
    return ok(access, enabled ? 'Restaurant Lite habilitado.' : 'Restaurant Lite deshabilitado.');
}
async function getSettings(companyId) {
    const settings = await restaurant_repo_1.restaurantRepo.getSettings(companyId);
    return settings ? ok(settings) : fail(404, 'La configuración de restaurante no existe todavía.');
}
async function updateSettings(companyId, input) {
    const settings = await restaurant_repo_1.restaurantRepo.getSettings(companyId);
    if (!settings)
        return fail(404, 'La configuración de restaurante no existe todavía.');
    const changed = await client_2.prisma.restaurantSettings.updateMany({ where: { id: settings.id, company_id: companyId }, data: input });
    if (!changed.count)
        return fail(409, 'La configuración cambió de empresa o ya no está disponible.');
    return ok(await restaurant_repo_1.restaurantRepo.getSettings(companyId), 'Configuración actualizada.');
}
async function listAreas(companyId) { return ok(await restaurant_repo_1.restaurantRepo.listAreas(companyId)); }
async function createArea(companyId, input) {
    try {
        return ok(await client_2.prisma.restaurantDiningArea.create({ data: { company_id: companyId, ...input } }), 'Área creada.', 201);
    }
    catch (error) {
        return prismaError(error) ?? fail(500, 'No pudimos crear el área.');
    }
}
async function updateArea(companyId, id, input) {
    const area = await restaurant_repo_1.restaurantRepo.findArea(companyId, id);
    if (!area)
        return fail(404, 'No encontramos el área.');
    try {
        const changed = await client_2.prisma.restaurantDiningArea.updateMany({ where: { id: area.id, company_id: companyId }, data: input });
        if (!changed.count)
            return fail(409, 'El área cambió de empresa o ya no está disponible.');
        return ok(await restaurant_repo_1.restaurantRepo.findArea(companyId, area.id), 'Área actualizada.');
    }
    catch (error) {
        return prismaError(error) ?? fail(500, 'No pudimos actualizar el área.');
    }
}
async function deleteArea(companyId, id) {
    const area = await client_2.prisma.restaurantDiningArea.findFirst({ where: { id, company_id: companyId }, include: { tables: { select: { id: true } } } });
    if (!area)
        return fail(404, 'No encontramos el área.');
    if (area.tables.length)
        return fail(409, 'No podés eliminar un área que todavía tiene mesas. Mové, eliminá o desactivá sus mesas primero.');
    const deleted = await client_2.prisma.restaurantDiningArea.deleteMany({ where: { id: area.id, company_id: companyId } });
    if (!deleted.count)
        return fail(409, 'El área cambió de empresa o ya no está disponible.');
    return ok(null, 'Área eliminada.');
}
async function listTables(companyId, diningAreaId) { return ok(await restaurant_repo_1.restaurantRepo.listTables(companyId, diningAreaId)); }
async function createTable(companyId, input) {
    const area = await restaurant_repo_1.restaurantRepo.findArea(companyId, input.dining_area_id);
    if (!area)
        return fail(404, 'No encontramos el área seleccionada.');
    try {
        return ok(await client_2.prisma.restaurantTable.create({ data: { company_id: companyId, ...input } }), 'Mesa creada.', 201);
    }
    catch (error) {
        return prismaError(error) ?? fail(500, 'No pudimos crear la mesa.');
    }
}
async function updateTable(companyId, id, input) {
    const table = await restaurant_repo_1.restaurantRepo.findTable(companyId, id);
    if (!table)
        return fail(404, 'No encontramos la mesa.');
    if (input.dining_area_id !== undefined && !(await restaurant_repo_1.restaurantRepo.findArea(companyId, input.dining_area_id)))
        return fail(404, 'No encontramos el área seleccionada.');
    const minimumSeats = input.minimum_seats ?? table.minimum_seats;
    const maximumSeats = input.maximum_seats ?? table.maximum_seats;
    if (maximumSeats < minimumSeats)
        return fail(400, 'La capacidad máxima debe ser mayor o igual a la mínima.');
    try {
        const changed = await client_2.prisma.restaurantTable.updateMany({ where: { id: table.id, company_id: companyId }, data: input });
        if (!changed.count)
            return fail(409, 'La mesa cambió de empresa o ya no está disponible.');
        return ok(await restaurant_repo_1.restaurantRepo.findTable(companyId, table.id), 'Mesa actualizada.');
    }
    catch (error) {
        return prismaError(error) ?? fail(500, 'No pudimos actualizar la mesa.');
    }
}
async function deleteTable(companyId, id) {
    const table = await restaurant_repo_1.restaurantRepo.findTable(companyId, id);
    if (!table)
        return fail(404, 'No encontramos la mesa.');
    const deleted = await client_2.prisma.restaurantTable.deleteMany({ where: { id: table.id, company_id: companyId } });
    if (!deleted.count)
        return fail(409, 'La mesa cambió de empresa o ya no está disponible.');
    return ok(null, 'Mesa eliminada.');
}
async function validatePeriod(companyId, input, excludeId) {
    if (input.start_time >= input.end_time)
        return fail(400, 'La hora de fin debe ser posterior a la de inicio. Los períodos nocturnos no están disponibles en esta fase.');
    if (input.is_active === false)
        return null;
    const overlaps = await client_2.prisma.restaurantServicePeriod.findFirst({ where: {
            company_id: companyId, day_of_week: input.day_of_week, is_active: true,
            ...(excludeId ? { id: { not: excludeId } } : {}), start_time: { lt: input.end_time }, end_time: { gt: input.start_time },
        } });
    return overlaps ? fail(409, 'El período se superpone con otro período activo de este día.') : null;
}
async function companyHoursOverrideWarning(companyId, dayOfWeek) {
    const hours = await client_2.prisma.hours.findMany({ where: { company_id: companyId, day_of_week: dayOfWeek } });
    if (hours.length === 0)
        return null;
    const hasOpenCompanyHours = hours.some((hour) => {
        if (hour.is_closed || !hour.open_time || !hour.close_time)
            return false;
        return hour.open_time < hour.close_time;
    });
    return hasOpenCompanyHours
        ? null
        : 'El período de servicio queda fuera del horario general del negocio; el restaurante lo publicará y lo usará para reservas.';
}
async function listPeriods(companyId, dayOfWeek) { return ok(await restaurant_repo_1.restaurantRepo.listPeriods(companyId, dayOfWeek)); }
async function createPeriod(companyId, input) {
    const validation = await validatePeriod(companyId, input);
    if (validation)
        return validation;
    const period = await client_2.prisma.restaurantServicePeriod.create({ data: { company_id: companyId, ...input } });
    const warning = input.is_active === false ? null : await companyHoursOverrideWarning(companyId, input.day_of_week);
    return ok(period, warning ? `Período creado. ${warning}` : 'Período creado.', 201);
}
async function updatePeriod(companyId, id, input) {
    const period = await restaurant_repo_1.restaurantRepo.findPeriod(companyId, id);
    if (!period)
        return fail(404, 'No encontramos el período.');
    const next = { ...period, ...input };
    const validation = await validatePeriod(companyId, next, id);
    if (validation)
        return validation;
    const changed = await client_2.prisma.restaurantServicePeriod.updateMany({ where: { id: period.id, company_id: companyId }, data: input });
    if (!changed.count)
        return fail(409, 'El período cambió de empresa o ya no está disponible.');
    const warning = next.is_active === false ? null : await companyHoursOverrideWarning(companyId, next.day_of_week);
    return ok(await restaurant_repo_1.restaurantRepo.findPeriod(companyId, period.id), warning ? `Período actualizado. ${warning}` : 'Período actualizado.');
}
async function deletePeriod(companyId, id) {
    const period = await restaurant_repo_1.restaurantRepo.findPeriod(companyId, id);
    if (!period)
        return fail(404, 'No encontramos el período.');
    const deleted = await client_2.prisma.restaurantServicePeriod.deleteMany({ where: { id: period.id, company_id: companyId } });
    if (!deleted.count)
        return fail(409, 'El período cambió de empresa o ya no está disponible.');
    return ok(null, 'Período eliminado.');
}
