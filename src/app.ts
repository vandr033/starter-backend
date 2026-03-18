import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { router } from "./routes";
import { getAuth } from "./config/auth";
import { importEsm } from "./utils/importEsm";
import { errorHandler } from "./middlewares/error";

const app = express();
app.set("trust proxy", 1);

function parseOriginList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function buildCorsOrigins(): string[] {
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

  return Array.from(
    new Set(
      [...defaults, ...configured]
        .map((origin) => origin?.trim())
        .filter((origin): origin is string => Boolean(origin)),
    ),
  );
}

const healthHandler = (_req: express.Request, res: express.Response) => {
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
app.use(
  cors({
    origin: buildCorsOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

let authHandlerPromise: Promise<express.RequestHandler> | null = null;

async function getAuthHandler() {
  if (!authHandlerPromise) {
    authHandlerPromise = (async () => {
      const [{ toNodeHandler }, auth] = await Promise.all([
        importEsm<any>("better-auth/node"),
        getAuth(),
      ]);
      return toNodeHandler(auth) as express.RequestHandler;
    })();
  }
  return authHandlerPromise;
}

// 1) Better Auth on /api/auth prefix (no "*")
app.use("/api/auth", async (req, res, next) => {
  try {
    const authHandler = await getAuthHandler();
    return authHandler(req, res, next);
  } catch (error) {
    return next(error);
  }
});

// 2) Body parser for YOUR routes
app.use(express.json({ limit: "1mb" }));

// 3) Your own API router
app.use("/api", router);

// 4) Error handler
app.use(errorHandler);

export default app;
