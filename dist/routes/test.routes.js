"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
router.get("/test", (req, res) => {
    res.send("test");
});
router.get("/test/auth", requireAuth_1.requireAuth, (req, res) => {
    res.send("test");
});
router.get("/test/auth/company", requireAuth_1.requireAuth, requireAuth_1.requireCompanyAdmin, (req, res) => {
    res.send("test");
});
router.get("/test/auth/company/staff", requireAuth_1.requireAuth, requireAuth_1.requireCompanyStaff, (req, res) => {
    res.send("test");
});
router.get("/test/auth/company/super", requireAuth_1.requireAuth, requireAuth_1.requireSuperAdmin, (req, res) => {
    res.send("test");
});
exports.default = router;
