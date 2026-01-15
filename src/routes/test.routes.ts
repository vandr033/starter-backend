import { Router } from "express";
import { requireAuth, requireCompanyAdmin, requireCompanyStaff, requireSuperAdmin } from "../middlewares/requireAuth";

const router = Router();


router.get("/test", (req, res) => {
    res.send("test");
});

router.get("/test/auth", requireAuth, (req, res) => {
    res.send("test");
});

router.get("/test/auth/company", requireAuth, requireCompanyAdmin, (req, res) => {
    res.send("test");
});

router.get("/test/auth/company/staff", requireAuth, requireCompanyStaff, (req, res) => {
    res.send("test");
});

router.get("/test/auth/company/super", requireAuth, requireSuperAdmin, (req, res) => {
    res.send("test");
});
export default router;