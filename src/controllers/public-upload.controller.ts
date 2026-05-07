import { Response } from 'express';
import { Request } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import { StorageService } from '../services/storage.service';
import { logger } from '../config/logger';
import multer from 'multer';
import { buildStorageDeleteToken, verifyStorageDeleteToken } from '../utils/storageDeleteToken';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Export the upload middleware to be used in routes
export const uploadMiddleware = upload.single('image');

let mensaje: MensajeApi;

/**
 * POST /api/upload/qr
 * Upload QR code payment proof (no auth required)
 */
export async function uploadQRImage(req: Request, res: Response) {
    try {
        if (!req.file) {
            mensaje = {
                code: 400,
                message: 'No file uploaded',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        
        // Validate file type (image or PDF)
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            mensaje = {
                code: 400,
                message: 'Invalid file type. Only JPEG, PNG, WebP images, or PDF files are allowed',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        
        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (req.file.size > maxSize) {
            mensaje = {
                code: 400,
                message: 'File too large. Maximum size is 5MB',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        
        // Get company_id from request body (required for organizing files)
        let { company_id } = req.body;
        company_id = parseInt(company_id);
        if (!company_id || typeof company_id !== 'number') {
            mensaje = {
                code: 400,
                message: 'company_id is required and must be a number',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        
        // Generate unique filename
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = req.file.originalname.split('.').pop();
        const filename = `qr-${timestamp}-${random}.${extension}`;
        
        // Save file using StorageService
        const relativePath = await StorageService.saveFile(
            company_id,
            'qr',
            filename,
            req.file.buffer
        );

        // Return the URL
        const url = StorageService.getFileUrl(relativePath);

        return res.json({
            code: 200,
            error: false,
            message: 'QR code uploaded successfully',
            data: {
                url: url,
                deleteToken: buildStorageDeleteToken(relativePath),
                filename: filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
            },
        });
    } catch (error) {
        logger.error('Error uploading QR code:', error as any);
        mensaje = {
            code: 500,
            message: 'Internal server error',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}

/**
 * DELETE /api/upload/qr
 * Delete QR code payment proof (no auth required)
 * Note: In production, you might want to add some form of authorization
 * to prevent unauthorized deletion of QR codes
 */
export async function deleteQRImage(req: Request, res: Response) {
    try {
        const { url, deleteToken } = req.body;

        if (!url || typeof url !== 'string') {
            mensaje = {
                code: 400,
                message: 'url is required and must be a string',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (!deleteToken || typeof deleteToken !== 'string') {
            mensaje = {
                code: 401,
                message: 'deleteToken is required',
                error: true,
            };
            return res.status(401).json(mensaje);
        }

        const relativePath = StorageService.toRelativeStoragePath(url);
        if (!relativePath) {
            mensaje = {
                code: 400,
                message: 'Invalid URL format',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Validate that it's a QR code path
        if (!relativePath.includes('/qr/')) {
            mensaje = {
                code: 400,
                message: 'Invalid QR code URL',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (!verifyStorageDeleteToken(deleteToken, relativePath)) {
            mensaje = {
                code: 403,
                message: 'Invalid delete token',
                error: true,
            };
            return res.status(403).json(mensaje);
        }

        // Delete file using StorageService
        await StorageService.deleteFile(relativePath);

        return res.json({
            code: 200,
            error: false,
            message: 'QR code deleted successfully',
        });
    } catch (error) {
        logger.error('Error deleting QR code:', error as any);
        mensaje = {
            code: 500,
            message: 'Internal server error',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}
