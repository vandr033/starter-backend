import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as RestaurantService from '../services/restaurant.service';

function companyId(req: AuthenticatedRequest, res: Response): number | null {
  const id = (req as any).companyID as number | undefined;
  if (!id) { res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' }); return null; }
  return id;
}
function id(value: string | string[] | undefined): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function optionalNumber(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined) return undefined;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
async function respond(res: Response, result: Promise<{ code: number } & Record<string, any>>) { const payload = await result; return res.status(payload.code).json(payload); }

export async function getAccess(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, RestaurantService.getAccess(cid)); }
export async function updateAccess(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, RestaurantService.setAccess(cid, (req as any).validated.enabled)); }
export async function getSettings(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, RestaurantService.getSettings(cid)); }
export async function updateSettings(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, RestaurantService.updateSettings(cid, (req as any).validated)); }
export async function listAreas(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, RestaurantService.listAreas(cid)); }
export async function createArea(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, RestaurantService.createArea(cid, (req as any).validated)); }
export async function updateArea(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.updateArea(cid, recordId, (req as any).validated)); }
export async function deleteArea(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.deleteArea(cid, recordId)); }
export async function listTables(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), areaId = optionalNumber(req.query.diningAreaId, 1, Number.MAX_SAFE_INTEGER); if (!cid) return; if (areaId === null) return res.status(400).json({ code: 400, error: true, message: 'diningAreaId inválido.' }); return respond(res, RestaurantService.listTables(cid, areaId)); }
export async function createTable(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, RestaurantService.createTable(cid, (req as any).validated)); }
export async function updateTable(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.updateTable(cid, recordId, (req as any).validated)); }
export async function deleteTable(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.deleteTable(cid, recordId)); }
export async function listPeriods(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), day = optionalNumber(req.query.dayOfWeek, 0, 6); if (!cid) return; if (day === null) return res.status(400).json({ code: 400, error: true, message: 'dayOfWeek inválido. Usá 0 (domingo) a 6 (sábado).' }); return respond(res, RestaurantService.listPeriods(cid, day)); }
export async function createPeriod(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, RestaurantService.createPeriod(cid, (req as any).validated)); }
export async function updatePeriod(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.updatePeriod(cid, recordId, (req as any).validated)); }
export async function deletePeriod(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.deletePeriod(cid, recordId)); }
