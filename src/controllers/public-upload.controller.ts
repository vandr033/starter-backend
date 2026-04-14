import { Response, Request } from 'express';
import multer from 'multer';
import { logger } from '../config/logger';
import { StorageService } from '../services/storage.service';
import { verifyPublicUploadToken } from '../utils/public-upload-token';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

export const uploadMiddleware = upload.single('image');

const allowedTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export async function uploadBookingProof(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'No file uploaded',
      });
    }

    if (!allowedTypes.has(req.file.mimetype)) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed',
      });
    }

    const companyId = Number.parseInt(String(req.body?.company_id), 10);
    const uploadToken = typeof req.body?.upload_token === 'string' ? req.body.upload_token.trim() : '';

    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'company_id is required and must be a positive number',
      });
    }

    if (!uploadToken) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'upload_token is required',
      });
    }

    const tokenResult = verifyPublicUploadToken(uploadToken, {
      companyId,
      purpose: 'BOOKING_PROOF',
    });

    if (!tokenResult.ok) {
      return res.status(403).json({
        code: 403,
        error: true,
        message: tokenResult.reason,
      });
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const extension = req.file.originalname.split('.').pop() || 'png';
    const filename = `booking-proof-${timestamp}-${random}.${extension}`;

    const relativePath = await StorageService.saveFile(
      companyId,
      'booking-proofs',
      filename,
      req.file.buffer,
    );

    return res.json({
      code: 200,
      error: false,
      message: 'Booking proof uploaded successfully',
      data: {
        url: StorageService.getFileUrl(relativePath),
        filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    logger.error('Error uploading booking proof:', error as any);
    return res.status(500).json({
      code: 500,
      error: true,
      message: 'Internal server error',
    });
  }
}

export async function uploadCommerceQrProof(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, error: true, message: 'No file uploaded' });
    }

    if (!allowedTypes.has(req.file.mimetype)) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed',
      });
    }

    const companyId = Number.parseInt(String(req.body?.company_id), 10);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'company_id is required and must be a positive number',
      });
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const extension = req.file.originalname.split('.').pop() || 'png';
    const filename = `qr-proof-${timestamp}-${random}.${extension}`;

    const relativePath = await StorageService.saveFile(
      companyId,
      'qr',
      filename,
      req.file.buffer,
    );

    return res.json({
      code: 200,
      error: false,
      message: 'QR proof uploaded successfully',
      data: {
        url: StorageService.getFileUrl(relativePath),
        filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    logger.error('Error uploading QR proof:', error as any);
    return res.status(500).json({ code: 500, error: true, message: 'Internal server error' });
  }
}
