import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import {
  getServiceTypes,
  createServiceType,
  updateServiceType,
  deleteServiceType,
} from "../controllers/admin-super-service-types.controller";

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get("/service-types", getServiceTypes);

router.post("/service-types", createServiceType);

router.put("/service-types/:id", updateServiceType);

router.delete("/service-types/:id", deleteServiceType);

export default router;
