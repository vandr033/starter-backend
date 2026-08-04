import { Response } from 'express';
import { RestaurantReservationStatus, RestaurantTableOperationalStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as StaffService from '../services/restaurant-staff.service';

function companyId(req: AuthenticatedRequest, res: Response): number | null { const value = (req as any).companyID as number | undefined; if (!value) { res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' }); return null; } return value; }
function actor(req: AuthenticatedRequest, res: Response): string | null { const value = req.authUser?.id as string | undefined; if (!value) { res.status(401).json({ code: 401, error: true, message: 'Sesión no válida.' }); return null; } return value; }
function id(value: string | string[] | undefined): number | null { const parsed = Number(Array.isArray(value) ? value[0] : value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
async function respond(res: Response, result: Promise<{ code: number } & Record<string, any>>) { const payload = await result; return res.status(payload.code).json(payload); }
export async function currentShift(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid) return respond(res, StaffService.myShift(cid, uid)); }
export async function upcomingShifts(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid) return respond(res, StaffService.myUpcomingShifts(cid, uid)); }
export async function tableStatus(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), tableId = id(req.params.id); if (!cid || !uid) return; if (!tableId) return res.status(400).json({ code: 400, error: true, message: 'ID de mesa inválido.' }); const input = (req as any).validated; return respond(res, StaffService.updateWaiterTableStatus(cid, uid, tableId, input.status as RestaurantTableOperationalStatus, input.blocked_reason)); }
export async function reservationStatus(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res), reservationId = id(req.params.id); if (!cid || !uid) return; if (!reservationId) return res.status(400).json({ code: 400, error: true, message: 'ID de reserva inválido.' }); return respond(res, StaffService.updateWaiterReservationStatus(cid, uid, reservationId, (req as any).validated.status as RestaurantReservationStatus)); }
export async function note(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid) return respond(res, StaffService.addInternalNote(cid, uid, (req as any).validated)); }
