import { Response } from 'express';
import { Request } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import { StorageService } from '../services/storage.service';
import { logger } from '../config/logger';
import multer from 'multer';

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

        
        // Validate file type (should be an image)
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            mensaje = {
                code: 400,
                message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed',
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
        console.log(req.body)
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
        const { url } = req.body;

        if (!url || typeof url !== 'string') {
            mensaje = {
                code: 400,
                message: 'url is required and must be a string',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Extract relative path from URL
        // URL format: /api/storage/uploads/{company_id}/qr/{filename}
        const urlParts = url.split('/api/storage/');
        if (urlParts.length !== 2) {
            mensaje = {
                code: 400,
                message: 'Invalid URL format',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        const relativePath = urlParts[1];

        // Validate that it's a QR code path
        if (!relativePath.includes('/qr/')) {
            mensaje = {
                code: 400,
                message: 'Invalid QR code URL',
                error: true,
            };
            return res.status(400).json(mensaje);
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
