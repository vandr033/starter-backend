import { Router } from 'express';
import { uploadBookingProof, uploadCommerceQrProof, uploadMiddleware } from '../controllers/public-upload.controller';

const router = Router();

router.post('/booking-proof', uploadMiddleware, uploadBookingProof);
router.post('/qr', uploadMiddleware, uploadCommerceQrProof);

export default router;
