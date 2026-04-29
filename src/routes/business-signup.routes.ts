import { Router } from 'express';
import {
    createBusinessSignup,
    listBusinessSignupOptions,
} from '../controllers/business-signup.controller';

const router = Router();

router.get('/options', listBusinessSignupOptions);
router.post('/', createBusinessSignup);

export default router;
