import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { serveCompanyImage } from '../controllers/admin-image.controller';

const router = Router();

// Rate limiting for image serving (100 requests per minute per IP)
const imageRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/uploads/company/:company_id/:type/:filename - Serve company images
router.get(
  '/company/:company_id/:type/:filename',
  imageRateLimit,
  serveCompanyImage
);

export default router;
