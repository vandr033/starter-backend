import { Router } from 'express';
import { serveFile } from '../controllers/storage.controller';

const router = Router();

// GET /api/storage/* - Serve uploaded files
router.use((req, res, next) => {
  // Re-route to serveFile with the full path
  req.params.filePath = req.path.substring(1); // Remove leading slash
  serveFile(req as any, res);
});

export default router;
