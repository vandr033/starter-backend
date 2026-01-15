import { Router } from "express";
import * as homeController from '../controllers/home.controller';
const router = Router();

router.get('/service-types', homeController.getServiceTypes)
router.get('/cities', homeController.getCities)
router.get('/categories', homeController.getCategories)

router.get('/top-shops', homeController.getTopShops)
router.get('/faq', homeController.getFaq)

router.get('/search', homeController.search)
export default router