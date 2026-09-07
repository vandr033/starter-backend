import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createUploadIntent, uploadQRImage, deleteQRImage, deleteUploadedFile, uploadMiddleware } from '../controllers/public-upload.controller';
import { optionalAuth } from '../middlewares/optionalAuth';

const router = Router();

const uploadRateLimit = rateLimit({
  windowMs: 60_000,
  max: Number.parseInt(process.env.UPLOAD_RATE_LIMIT_MAX_PER_MINUTE || '30', 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    code: 429,
    error: true,
    errorCode: 'UPLOAD_RATE_LIMITED',
    reason: 'UPLOAD_RATE_LIMITED',
    message: 'Se alcanzó el límite temporal de cargas.',
  }),
});

// The slug is the server-side tenant selector; company_id is never accepted as attribution.
router.post('/intents/:slug', uploadRateLimit, optionalAuth, createUploadIntent);
router.post('/qr', uploadRateLimit, uploadMiddleware, uploadQRImage);

router.delete('/qr', deleteQRImage);
router.delete('/file', deleteUploadedFile);

export default router;
