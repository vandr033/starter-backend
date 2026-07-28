import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as Menu from '../services/restaurant-menu.service';

const companyId = (req: AuthenticatedRequest, res: Response) => {
  const value = Number((req as any).companyID); if (!Number.isInteger(value) || value <= 0) { res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' }); return null; } return value;
};
const id = (value: unknown) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; };
const respond = async (res: Response, result: Promise<{ code: number } & Record<string, unknown>>) => { const payload = await result; return res.status(payload.code).json(payload); };
const bool = (value: unknown) => value === undefined ? undefined : String(value) === 'true';

export async function listCategories(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, Menu.listCategories(cid)); }
export async function createCategory(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, Menu.createCategory(cid, (req as any).validated)); }
export async function getCategory(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.getCategory(cid, recordId)); }
export async function updateCategory(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.updateCategory(cid, recordId, (req as any).validated)); }
export async function deleteCategory(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.deleteCategory(cid, recordId)); }
export async function reorderCategories(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, Menu.reorderCategories(cid, (req as any).validated.items)); }

export async function listItems(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (!cid) return; const categoryId = req.query.categoryId === undefined ? undefined : id(req.query.categoryId); if (categoryId === null) return res.status(400).json({ code: 400, error: true, message: 'categoryId inválido.' }); return respond(res, Menu.listItems(cid, { categoryId, isActive: bool(req.query.isActive), isAvailable: bool(req.query.isAvailable), isFeatured: bool(req.query.isFeatured), search: typeof req.query.search === 'string' ? req.query.search.trim() || undefined : undefined, page: id(req.query.page) || 1, limit: id(req.query.limit) || 50 })); }
export async function createItem(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, Menu.createItem(cid, (req as any).validated)); }
export async function getItem(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.getItem(cid, recordId)); }
export async function updateItem(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.updateItem(cid, recordId, (req as any).validated)); }
export async function deleteItem(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid) return; if (!recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.deleteItem(cid, recordId)); }
export async function reorderItems(req: AuthenticatedRequest, res: Response) { const cid = companyId(req, res); if (cid) return respond(res, Menu.reorderItems(cid, (req as any).validated.items)); }
