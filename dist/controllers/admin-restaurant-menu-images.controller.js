"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategoryImage = exports.uploadCategoryImage = exports.deleteItemImage = exports.uploadItemImage = exports.restaurantMenuUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const client_1 = require("../prisma/client");
const storage_service_1 = require("../services/storage.service");
exports.restaurantMenuUpload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, done) => done(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) }).single('file');
const getId = (value) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; };
const companyId = (req) => Number(req.companyID);
const ext = (name) => name.split('.').pop()?.toLowerCase();
const safeFile = (recordId, extension) => `${recordId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
const allowedMimeByExtension = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
/** Multer's MIME field is client supplied. Verify the binary signature before writing. */
function hasValidImageSignature(buffer, extension) {
    if (extension === 'jpg' || extension === 'jpeg')
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (extension === 'png')
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}
function trustedRestaurantMenuPath(value, cid) {
    if (!value)
        return null;
    const relative = storage_service_1.StorageService.toRelativeStoragePath(value);
    if (!relative || path_1.default.posix.normalize(relative) !== relative)
        return null;
    return new RegExp(`^uploads/${cid}/restaurant-menu/(?:items|categories)/[A-Za-z0-9._-]+$`).test(relative) ? relative : null;
}
async function imageAction(req, res, kind, remove = false) {
    const cid = companyId(req);
    const recordId = getId(req.params.id);
    if (!Number.isInteger(cid) || !recordId)
        return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' });
    const row = kind === 'item'
        ? await client_1.prisma.restaurantMenuItem.findFirst({ where: { id: recordId, company_id: cid }, select: { id: true, image_url: true } })
        : await client_1.prisma.restaurantMenuCategory.findFirst({ where: { id: recordId, company_id: cid }, select: { id: true, image_url: true } });
    if (!row)
        return res.status(404).json({ code: 404, error: true, message: kind === 'item' ? 'No encontramos el producto.' : 'No encontramos la categoría.' });
    if (remove) {
        const changed = kind === 'item'
            ? await client_1.prisma.restaurantMenuItem.updateMany({ where: { id: recordId, company_id: cid }, data: { image_url: null } })
            : await client_1.prisma.restaurantMenuCategory.updateMany({ where: { id: recordId, company_id: cid }, data: { image_url: null } });
        if (!changed.count)
            return res.status(409).json({ code: 409, error: true, message: 'El registro cambió de empresa o ya no está disponible.' });
        const previous = trustedRestaurantMenuPath(row.image_url, cid);
        if (previous)
            await storage_service_1.StorageService.deleteFile(previous).catch(() => undefined);
        return res.json({ code: 200, error: false, message: 'Imagen eliminada.', data: { imageUrl: null } });
    }
    if (!req.file)
        return res.status(400).json({ code: 400, error: true, message: 'Seleccioná una imagen JPEG, PNG o WebP de hasta 5 MB.' });
    const extension = ext(req.file.originalname);
    if (!extension || !allowedMimeByExtension[extension] || req.file.mimetype !== allowedMimeByExtension[extension] || !hasValidImageSignature(req.file.buffer, extension))
        return res.status(400).json({ code: 400, error: true, message: 'El archivo no contiene una imagen JPEG, PNG o WebP válida.' });
    const relativePath = await storage_service_1.StorageService.saveFile(cid, kind === 'item' ? 'restaurant-menu-items' : 'restaurant-menu-categories', safeFile(recordId, extension), req.file.buffer);
    const imageUrl = storage_service_1.StorageService.getFileUrl(relativePath);
    const changed = kind === 'item'
        ? await client_1.prisma.restaurantMenuItem.updateMany({ where: { id: recordId, company_id: cid }, data: { image_url: imageUrl } })
        : await client_1.prisma.restaurantMenuCategory.updateMany({ where: { id: recordId, company_id: cid }, data: { image_url: imageUrl } });
    if (!changed.count) {
        await storage_service_1.StorageService.deleteFile(relativePath).catch(() => undefined);
        return res.status(409).json({ code: 409, error: true, message: 'El registro cambió de empresa o ya no está disponible.' });
    }
    const previous = trustedRestaurantMenuPath(row.image_url, cid);
    if (previous && previous !== relativePath)
        await storage_service_1.StorageService.deleteFile(previous).catch(() => undefined);
    return res.json({ code: 200, error: false, message: 'Imagen actualizada.', data: { imageUrl } });
}
const uploadItemImage = (req, res) => imageAction(req, res, 'item');
exports.uploadItemImage = uploadItemImage;
const deleteItemImage = (req, res) => imageAction(req, res, 'item', true);
exports.deleteItemImage = deleteItemImage;
const uploadCategoryImage = (req, res) => imageAction(req, res, 'category');
exports.uploadCategoryImage = uploadCategoryImage;
const deleteCategoryImage = (req, res) => imageAction(req, res, 'category', true);
exports.deleteCategoryImage = deleteCategoryImage;
