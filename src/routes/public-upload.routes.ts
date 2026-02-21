import { Router } from 'express';
import { uploadQRImage, deleteQRImage, uploadMiddleware } from '../controllers/public-upload.controller';

const router = Router();

// POST /api/upload/qr - Upload QR code payment proof (no auth required)
router.post('/qr', uploadMiddleware, uploadQRImage);

// DELETE /api/upload/qr - Delete QR code payment proof (no auth required)
router.delete('/qr', deleteQRImage);

export default router;
