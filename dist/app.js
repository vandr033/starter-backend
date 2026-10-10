"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = require("./routes");
const auth_1 = require("./config/auth");
const importEsm_1 = require("./utils/importEsm");
const error_1 = require("./middlewares/error");
const demo_session_middleware_1 = require("./middlewares/demo-session.middleware");
const app = (0, express_1.default)();
app.set("trust proxy", 1);
function readPositiveIntEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const rateLimitHandler = (_req, res) => {
    res.status(429).json({
        code: 429,
        error: true,
        message: "Too many requests. Please wait a moment and try again.",
    });
};
const generalApiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: readPositiveIntEnv("RATE_LIMIT_MAX_PER_MINUTE", 600),
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: readPositiveIntEnv("AUTH_RATE_LIMIT_MAX_PER_MINUTE", 60),
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});
const bookingAvailabilityLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: readPositiveIntEnv("BOOKING_AVAILABILITY_RATE_LIMIT_MAX_PER_MINUTE", 1200),
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});
const bookingWriteLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: readPositiveIntEnv("BOOKING_WRITE_RATE_LIMIT_MAX_PER_MINUTE", 30),
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});
const bookingAvailabilityPaths = new Set([
    "/api/booking/available-dates",
    "/api/booking/slots",
]);
const restaurantAvailabilityPathPattern = /^\/api\/restaurant\/public\/[^/]+\/availability$/;
const restaurantPublicWritePattern = /^\/api\/restaurant\/public\/(?:[^/]+\/reservations|[^/]+\/reservations\/[^/]+\/deposit-proof|reservations\/[^/]+\/cancel)$/;
const bookingWritePathPattern = /^\/api\/booking(?:\/public|\/customer|\/\d+(?:\/cancel)?)?$/;
function parseOriginList(value) {
    if (!value)
        return [];
    return value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
}
function buildCorsOrigins() {
    const defaults = [
        "http://localhost:3000",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://g0kc8cgg40oso4c800s8ks80.89.167.82.92.sslip.io",
        "http://ow0ggc084gkkk844s4s8gow8.89.167.82.92.sslip.io",
        "https://priconpri.com",
        "https://www.priconpri.com",
    ];
    const configured = [
        process.env.FRONTEND_URL,
        process.env.NEXT_PUBLIC_FRONTEND_URL,
        ...parseOriginList(process.env.CORS_ORIGINS),
    ];
    return Array.from(new Set([...defaults, ...configured]
        .map((origin) => origin?.trim())
        .filter((origin) => Boolean(origin))));
}
const healthHandler = (_req, res) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
    });
};
// Health checkpoints (liveness)
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);
// CORS, helmet, rateLimit
app.use((0, cors_1.default)({
    origin: buildCorsOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use((req, res, next) => {
    if (req.method === "GET" && (bookingAvailabilityPaths.has(req.path) || restaurantAvailabilityPathPattern.test(req.path))) {
        return bookingAvailabilityLimiter(req, res, next);
    }
    return generalApiLimiter(req, res, next);
});
// Resolve demo sessions before Better Auth so its write endpoints are also
// covered by the demo read-only policy.
app.use("/api", demo_session_middleware_1.demoSessionMiddleware, demo_session_middleware_1.demoReadOnlyMiddleware);
app.use((req, res, next) => {
    if ((req.method === "POST" || req.method === "PUT" || req.method === "DELETE")
        && (bookingWritePathPattern.test(req.path) || restaurantPublicWritePattern.test(req.path))) {
        return bookingWriteLimiter(req, res, next);
    }
    return next();
});
let authHandlerPromise = null;
async function getAuthHandler() {
    if (!authHandlerPromise) {
        authHandlerPromise = (async () => {
            const [{ toNodeHandler }, auth] = await Promise.all([
                (0, importEsm_1.importEsm)("better-auth/node"),
                (0, auth_1.getAuth)(),
            ]);
            return toNodeHandler(auth);
        })();
    }
    return authHandlerPromise;
}
// 1) Better Auth on /api/auth prefix (no "*")
app.use("/api/auth", authLimiter, async (req, res, next) => {
    try {
        const authHandler = await getAuthHandler();
        return authHandler(req, res, next);
    }
    catch (error) {
        return next(error);
    }
});
// 2) Body parser for YOUR routes
app.use(express_1.default.json({ limit: "1mb" }));
// 3) Your own API router
app.use("/api", demo_session_middleware_1.demoTenantWriteGuard, routes_1.router);
// 4) Error handler
app.use(error_1.errorHandler);
exports.default = app;
