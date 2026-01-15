import { Router } from 'express';

import { getAllCompanies } from '../controllers/company.controller';

const router = Router();

router.get('/', getAllCompanies);

export default router;
