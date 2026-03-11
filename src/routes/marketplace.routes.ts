import { Router } from 'express';
import * as MarketplaceController from '../controllers/marketplace.controller';

const router = Router();

// GET /api/marketplace/search
router.get('/search', MarketplaceController.searchMarketplace);

// POST /api/marketplace/events/click
router.post('/events/click', MarketplaceController.trackMarketplaceClick);
// POST /api/marketplace/events
router.post('/events', MarketplaceController.trackMarketplaceEvent);

export default router;
