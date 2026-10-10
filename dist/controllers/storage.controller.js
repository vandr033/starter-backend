"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serveFile = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const storage_service_1 = require("../services/storage.service");
const serveFile = async (req, res) => {
    try {
        const { filePath } = req.params;
        // Handle string array type from Express
        const pathStr = Array.isArray(filePath) ? filePath[0] : filePath;
        const relativePath = storage_service_1.StorageService.toRelativeStoragePath(pathStr);
        if (!relativePath || storage_service_1.StorageService.isPrivateRelativePath(relativePath))
            return res.status(404).json({ error: 'File not found' });
        // Check if file exists and get stats for ETag
        let stats;
        let resolvedPath;
        try {
            resolvedPath = await storage_service_1.StorageService.getFilePath(relativePath);
            stats = await fs_1.promises.stat(resolvedPath);
        }
        catch {
            return res.status(404).json({ error: 'File not found' });
        }
        // Get file extension to determine content type
        const ext = path_1.default.extname(resolvedPath).toLowerCase();
        const contentType = getContentType(ext);
        // ETag based on file modification time and size
        const etag = `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;
        // Check if client has cached version
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === etag) {
            return res.status(304).send();
        }
        // Revalidate on every request so replaced images with the same URL are shown immediately.
        res.set({
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=0, must-revalidate',
            'ETag': etag,
        });
        // Send file
        res.sendFile(resolvedPath);
    }
    catch (error) {
        console.error('Error serving file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.serveFile = serveFile;
function getContentType(ext) {
    const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
    };
    return contentTypes[ext] || 'application/octet-stream';
}
