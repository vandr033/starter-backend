"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serveCompanyImage = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const client_1 = require("../prisma/client");
const env_1 = require("../config/env");
const serveCompanyImage = async (req, res) => {
    try {
        const { company_id, type, filename } = req.params;
        // Handle string array types from Express
        const companyIdStr = Array.isArray(company_id) ? company_id[0] : company_id;
        const typeStr = Array.isArray(type) ? type[0] : type;
        const filenameStr = Array.isArray(filename) ? filename[0] : filename;
        // Validate company_id
        const companyId = parseInt(companyIdStr);
        if (isNaN(companyId)) {
            return res.status(400).json({ error: 'Invalid company ID' });
        }
        // Check if company exists
        const company = await client_1.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true },
        });
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }
        // Validate type
        const allowedTypes = ['logo', 'hero', 'about', 'staff', 'gallery'];
        if (!allowedTypes.includes(typeStr)) {
            return res.status(400).json({ error: 'Invalid type' });
        }
        // Sanitize filename to prevent directory traversal
        const sanitizedFilename = filenameStr.replace(/[^a-zA-Z0-9.-]/g, '');
        if (!sanitizedFilename || sanitizedFilename !== filenameStr) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        // Construct file path
        const filePath = path_1.default.join(env_1.env.storagePath, 'uploads', companyIdStr, typeStr, filenameStr);
        // Ensure the path is within the storage directory
        const resolvedPath = path_1.default.resolve(filePath);
        const storageDir = path_1.default.resolve(env_1.env.storagePath);
        if (!resolvedPath.startsWith(storageDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Check if file exists and get stats for ETag
        let stats;
        try {
            stats = await fs_1.promises.stat(resolvedPath);
        }
        catch {
            return res.status(404).json({ error: 'File not found' });
        }
        // Get file extension to determine content type
        const ext = path_1.default.extname(filename).toLowerCase();
        const contentType = getContentType(ext);
        // ETag based on file modification time and size (changes on re-upload)
        const etag = `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;
        // Check if client has cached version
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === etag) {
            return res.status(304).send();
        }
        // Revalidate on every request so replaced images with the same URL are shown immediately.
        res.set({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=0, must-revalidate',
            'ETag': etag,
        });
        // Send file
        res.sendFile(resolvedPath);
    }
    catch (error) {
        console.error('Error serving image:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.serveCompanyImage = serveCompanyImage;
function getContentType(ext) {
    const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
    };
    return contentTypes[ext] || 'application/octet-stream';
}
