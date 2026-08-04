import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as ShiftService from '../services/restaurant-shift.service';

function companyId(req: AuthenticatedRequest, res: Response): number | null {
  const value = (req as any).companyID as number | undefined;
  if (!value) { res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' }); return null; }
  return value;
}
function actor(req: AuthenticatedRequest, res: Response): string | null {
  const value = req.authUser?.id as string | undefined;
  if (!value) { res.status(401).json({ code: 401, error: true, message: 'Sesión no válida.' }); return null; }
  return value;
}
function recordId(value: string | string[] | undefined): number | null { const parsed = Number(Array.isArray(value) ? value[0] : value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
async function respond(res: Response, result: Promise<{ code: number } & Record<string, any>>) { const payload = await result; return res.status(payload.code).json(payload); }

export async function list(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (!cid) return; return respond(res, ShiftService.listShifts(cid, (req as any).validatedQuery || {})); }
export async function get(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), id = recordId(req.params.id); if (!cid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.getShift(cid, id)); }
export async function create(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res); if (!cid || !uid) return; return respond(res, ShiftService.createShift(cid, uid, (req as any).validated)); }
export async function update(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.updateShift(cid, id, uid, (req as any).validated)); }
export async function remove(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.deleteDraftShift(cid, id, uid)); }
export async function open(req: AuthenticatedRequest, res: Response) { return changeStatus(req, res, ShiftService.openShift); }
export async function close(req: AuthenticatedRequest, res: Response) { return changeStatus(req, res, ShiftService.closeShift); }
export async function cancel(req: AuthenticatedRequest, res: Response) { return changeStatus(req, res, ShiftService.cancelShift); }
async function changeStatus(req: AuthenticatedRequest, res: Response, operation: (companyId: number, shiftId: number, actorUserId: string) => Promise<any>) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, operation(cid, id, uid)); }
export async function members(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.replaceMembers(cid, id, uid, (req as any).validated.members)); }
export async function areas(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.replaceDiningAreas(cid, id, uid, (req as any).validated.dining_area_ids)); }
export async function assignments(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.replaceAssignments(cid, id, uid, (req as any).validated.assignments)); }
export async function setup(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); const input = (req as any).validated; return respond(res, ShiftService.replaceSetup(cid, id, uid, input)); }
export async function copy(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.copyShift(cid, id, uid, (req as any).validated)); }
export async function saveTemplate(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid) return; if (!id) return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.saveTemplate(cid, id, uid, (req as any).validated.name)); }
export async function listTemplates(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, ShiftService.listTemplates(cid)); }
export async function useTemplate(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid) return respond(res, ShiftService.useTemplate(cid, uid, (req as any).validated)); }
export async function mine(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid) return respond(res, ShiftService.myShifts(cid, uid)); }
