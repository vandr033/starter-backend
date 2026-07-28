import type { Response } from 'express';
import multer from 'multer';
import path from 'path';
import type { AuthenticatedRequest } from '../middlewares/requireAuth';
import { prisma } from '../prisma/client';
import { StorageService } from '../services/storage.service';

export const restaurantMenuUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, done) => done(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) }).single('file');
const getId = (value: unknown) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; };
const companyId = (req: AuthenticatedRequest) => Number((req as any).companyID);
const ext = (name: string) => name.split('.').pop()?.toLowerCase();
const safeFile = (recordId: number, extension: string) => `${recordId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
const allowedMimeByExtension: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Multer's MIME field is client supplied. Verify the binary signature before writing. */
function hasValidImageSignature(buffer: Buffer, extension: string) {
  if (extension === 'jpg' || extension === 'jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === 'png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

function trustedRestaurantMenuPath(value: string | null | undefined, cid: number) {
  if (!value) return null;
  const relative = StorageService.toRelativeStoragePath(value);
  if (!relative || path.posix.normalize(relative) !== relative) return null;
  return new RegExp(`^uploads/${cid}/restaurant-menu/(?:items|categories)/[A-Za-z0-9._-]+$`).test(relative) ? relative : null;
}
async function imageAction(req: AuthenticatedRequest, res: Response, kind: 'category' | 'item', remove = false) {
  const cid = companyId(req); const recordId = getId(req.params.id);
  if (!Number.isInteger(cid) || !recordId) return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' });
  const row = kind === 'item'
    ? await prisma.restaurantMenuItem.findFirst({ where: { id: recordId, company_id: cid }, select: { id: true, image_url: true } })
    : await prisma.restaurantMenuCategory.findFirst({ where: { id: recordId, company_id: cid }, select: { id: true, image_url: true } });
  if (!row) return res.status(404).json({ code: 404, error: true, message: kind === 'item' ? 'No encontramos el producto.' : 'No encontramos la categoría.' });
  if (remove) {
    if (kind === 'item') await prisma.restaurantMenuItem.update({ where: { id: recordId }, data: { image_url: null } });
    else await prisma.restaurantMenuCategory.update({ where: { id: recordId }, data: { image_url: null } });
    const previous = trustedRestaurantMenuPath(row.image_url, cid);
    if (previous) await StorageService.deleteFile(previous).catch(() => undefined);
    return res.json({ code: 200, error: false, message: 'Imagen eliminada.', data: { imageUrl: null } });
  }
  if (!req.file) return res.status(400).json({ code: 400, error: true, message: 'Seleccioná una imagen JPEG, PNG o WebP de hasta 5 MB.' });
  const extension = ext(req.file.originalname); if (!extension || !allowedMimeByExtension[extension] || req.file.mimetype !== allowedMimeByExtension[extension] || !hasValidImageSignature(req.file.buffer, extension)) return res.status(400).json({ code: 400, error: true, message: 'El archivo no contiene una imagen JPEG, PNG o WebP válida.' });
  const relativePath = await StorageService.saveFile(cid, kind === 'item' ? 'restaurant-menu-items' : 'restaurant-menu-categories', safeFile(recordId, extension), req.file.buffer);
  const imageUrl = StorageService.getFileUrl(relativePath);
  if (kind === 'item') await prisma.restaurantMenuItem.update({ where: { id: recordId }, data: { image_url: imageUrl } });
  else await prisma.restaurantMenuCategory.update({ where: { id: recordId }, data: { image_url: imageUrl } });
  const previous = trustedRestaurantMenuPath(row.image_url, cid);
  if (previous && previous !== relativePath) await StorageService.deleteFile(previous).catch(() => undefined);
  return res.json({ code: 200, error: false, message: 'Imagen actualizada.', data: { imageUrl } });
}
export const uploadItemImage = (req: AuthenticatedRequest, res: Response) => imageAction(req, res, 'item');
export const deleteItemImage = (req: AuthenticatedRequest, res: Response) => imageAction(req, res, 'item', true);
export const uploadCategoryImage = (req: AuthenticatedRequest, res: Response) => imageAction(req, res, 'category');
export const deleteCategoryImage = (req: AuthenticatedRequest, res: Response) => imageAction(req, res, 'category', true);
