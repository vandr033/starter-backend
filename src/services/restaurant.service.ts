import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { restaurantRepo } from '../repositories/restaurant.repo';

type Result = { code: number; error: boolean; message: string; data?: unknown };
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });

function prismaError(error: unknown): Result | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fail(409, 'Ya existe un registro con esos datos.');
  return null;
}

export async function getAccess(companyId: number): Promise<Result> {
  const access = await restaurantRepo.getAccess(companyId);
  if (!access) return fail(404, 'No encontramos la empresa.');
  return ok({ entitled: true, enabled: access.restaurant_enabled, plan: access.plan });
}

export async function setAccess(companyId: number, enabled: boolean): Promise<Result> {
  const access = await prisma.$transaction(async (tx) => {
    const company = await tx.company.update({ where: { id: companyId }, data: { restaurant_enabled: enabled }, select: { plan: true, restaurant_enabled: true } });
    let settings = null;
    if (enabled) {
      settings = await tx.restaurantSettings.upsert({ where: { company_id: companyId }, create: { company_id: companyId }, update: {} });
    }
    return { entitled: true, enabled: company.restaurant_enabled, plan: company.plan, settings };
  });
  return ok(access, enabled ? 'Restaurant Lite habilitado.' : 'Restaurant Lite deshabilitado.');
}

export async function getSettings(companyId: number): Promise<Result> {
  const settings = await restaurantRepo.getSettings(companyId);
  return settings ? ok(settings) : fail(404, 'La configuración de restaurante no existe todavía.');
}

export async function updateSettings(companyId: number, input: Record<string, unknown>): Promise<Result> {
  const settings = await restaurantRepo.getSettings(companyId);
  if (!settings) return fail(404, 'La configuración de restaurante no existe todavía.');
  return ok(await prisma.restaurantSettings.update({ where: { id: settings.id }, data: input }), 'Configuración actualizada.');
}

export async function listAreas(companyId: number) { return ok(await restaurantRepo.listAreas(companyId)); }
export async function createArea(companyId: number, input: any): Promise<Result> {
  try { return ok(await prisma.restaurantDiningArea.create({ data: { company_id: companyId, ...input } }), 'Área creada.', 201); }
  catch (error) { return prismaError(error) ?? fail(500, 'No pudimos crear el área.'); }
}
export async function updateArea(companyId: number, id: number, input: any): Promise<Result> {
  const area = await restaurantRepo.findArea(companyId, id);
  if (!area) return fail(404, 'No encontramos el área.');
  try { return ok(await prisma.restaurantDiningArea.update({ where: { id: area.id }, data: input }), 'Área actualizada.'); }
  catch (error) { return prismaError(error) ?? fail(500, 'No pudimos actualizar el área.'); }
}
export async function deleteArea(companyId: number, id: number): Promise<Result> {
  const area = await prisma.restaurantDiningArea.findFirst({ where: { id, company_id: companyId }, include: { tables: { select: { id: true } } } });
  if (!area) return fail(404, 'No encontramos el área.');
  if (area.tables.length) return fail(409, 'No podés eliminar un área que todavía tiene mesas. Mové, eliminá o desactivá sus mesas primero.');
  await prisma.restaurantDiningArea.delete({ where: { id: area.id } });
  return ok(null, 'Área eliminada.');
}

export async function listTables(companyId: number, diningAreaId?: number): Promise<Result> { return ok(await restaurantRepo.listTables(companyId, diningAreaId)); }
export async function createTable(companyId: number, input: any): Promise<Result> {
  const area = await restaurantRepo.findArea(companyId, input.dining_area_id);
  if (!area) return fail(404, 'No encontramos el área seleccionada.');
  try { return ok(await prisma.restaurantTable.create({ data: { company_id: companyId, ...input } }), 'Mesa creada.', 201); }
  catch (error) { return prismaError(error) ?? fail(500, 'No pudimos crear la mesa.'); }
}
export async function updateTable(companyId: number, id: number, input: any): Promise<Result> {
  const table = await restaurantRepo.findTable(companyId, id);
  if (!table) return fail(404, 'No encontramos la mesa.');
  if (input.dining_area_id !== undefined && !(await restaurantRepo.findArea(companyId, input.dining_area_id))) return fail(404, 'No encontramos el área seleccionada.');
  const minimumSeats = input.minimum_seats ?? table.minimum_seats;
  const maximumSeats = input.maximum_seats ?? table.maximum_seats;
  if (maximumSeats < minimumSeats) return fail(400, 'La capacidad máxima debe ser mayor o igual a la mínima.');
  try { return ok(await prisma.restaurantTable.update({ where: { id: table.id }, data: input }), 'Mesa actualizada.'); }
  catch (error) { return prismaError(error) ?? fail(500, 'No pudimos actualizar la mesa.'); }
}
export async function deleteTable(companyId: number, id: number): Promise<Result> {
  const table = await restaurantRepo.findTable(companyId, id);
  if (!table) return fail(404, 'No encontramos la mesa.');
  await prisma.restaurantTable.delete({ where: { id: table.id } });
  return ok(null, 'Mesa eliminada.');
}

async function validatePeriod(companyId: number, input: any, excludeId?: number): Promise<Result | null> {
  if (input.start_time >= input.end_time) return fail(400, 'La hora de fin debe ser posterior a la de inicio. Los períodos nocturnos no están disponibles en esta fase.');
  if (input.is_active === false) return null;
  const overlaps = await prisma.restaurantServicePeriod.findFirst({ where: {
    company_id: companyId, day_of_week: input.day_of_week, is_active: true,
    ...(excludeId ? { id: { not: excludeId } } : {}), start_time: { lt: input.end_time }, end_time: { gt: input.start_time },
  } });
  return overlaps ? fail(409, 'El período se superpone con otro período activo de este día.') : null;
}
export async function listPeriods(companyId: number, dayOfWeek?: number): Promise<Result> { return ok(await restaurantRepo.listPeriods(companyId, dayOfWeek)); }
export async function createPeriod(companyId: number, input: any): Promise<Result> {
  const validation = await validatePeriod(companyId, input); if (validation) return validation;
  return ok(await prisma.restaurantServicePeriod.create({ data: { company_id: companyId, ...input } }), 'Período creado.', 201);
}
export async function updatePeriod(companyId: number, id: number, input: any): Promise<Result> {
  const period = await restaurantRepo.findPeriod(companyId, id);
  if (!period) return fail(404, 'No encontramos el período.');
  const next = { ...period, ...input };
  const validation = await validatePeriod(companyId, next, id); if (validation) return validation;
  return ok(await prisma.restaurantServicePeriod.update({ where: { id: period.id }, data: input }), 'Período actualizado.');
}
export async function deletePeriod(companyId: number, id: number): Promise<Result> {
  const period = await restaurantRepo.findPeriod(companyId, id);
  if (!period) return fail(404, 'No encontramos el período.');
  await prisma.restaurantServicePeriod.delete({ where: { id: period.id } });
  return ok(null, 'Período eliminado.');
}
