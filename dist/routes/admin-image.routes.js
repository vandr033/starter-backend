"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const admin_image_controller_1 = require("../controllers/admin-image.controller");
const router = (0, express_1.Router)();
// Rate limiting for image serving (100 requests per minute per IP)
const imageRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});
// GET /api/uploads/company/:company_id/:type/:filename - Serve company images
router.get('/company/:company_id/:type/:filename', imageRateLimit, admin_image_controller_1.serveCompanyImage);
exports.default = router;
