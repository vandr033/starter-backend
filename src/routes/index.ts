import { Router } from 'express';
import authRoutes from './auth.routes';
// import userRoutes from './user.routes';
import companyRoutes from './company.routes';
import homeRoutes from './home.routes';
import testRoutes from './test.routes';
export const router = Router();
router.use('/auth', authRoutes);
// router.use('/user', userRoutes);
router.use('/company', companyRoutes);
router.use('/test', testRoutes);

router.use('/home', homeRoutes);