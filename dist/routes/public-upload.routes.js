"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const public_upload_controller_1 = require("../controllers/public-upload.controller");
const optionalAuth_1 = require("../middlewares/optionalAuth");
const demo_session_middleware_1 = require("../middlewares/demo-session.middleware");
const router = (0, express_1.Router)();
const uploadRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: Number.parseInt(process.env.UPLOAD_RATE_LIMIT_MAX_PER_MINUTE || '30', 10) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
        code: 429,
        error: true,
        errorCode: 'UPLOAD_RATE_LIMITED',
        reason: 'UPLOAD_RATE_LIMITED',
        message: 'Se alcanzó el límite temporal de cargas.',
    }),
});
// The slug is the server-side tenant selector; company_id is never accepted as attribution.
router.post('/intents/:slug', demo_session_middleware_1.demoCompanySlugWriteGuard, uploadRateLimit, optionalAuth_1.optionalAuth, public_upload_controller_1.createUploadIntent);
router.post('/qr', uploadRateLimit, public_upload_controller_1.uploadMiddleware, public_upload_controller_1.uploadQRImage);
router.delete('/qr', public_upload_controller_1.deleteQRImage);
router.delete('/file', public_upload_controller_1.deleteUploadedFile);
exports.default = router;
