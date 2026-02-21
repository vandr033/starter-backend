import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { router } from "./routes";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./config/auth";
import { errorHandler } from "./middlewares/error";

const app = express();

// CORS, helmet, rateLimit
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// 1) Better Auth on /api/auth prefix (no "*")
app.use("/api/auth", toNodeHandler(auth));

// 2) Body parser for YOUR routes
app.use(express.json({ limit: "1mb" }));

// 3) Your own API router
app.use("/api", router);

// 4) Error handler
app.use(errorHandler);

export default app;
