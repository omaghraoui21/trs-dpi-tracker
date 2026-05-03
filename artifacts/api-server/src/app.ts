import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the reverse proxy (Replit proxy sends X-Forwarded-For)
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Managed by the frontend
    crossOriginEmbedderPolicy: false,
  })
);

// CORS — allow the Replit proxy domain and localhost dev
const allowedOrigins: (string | RegExp)[] = [
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, mobile apps)
      if (!origin) return callback(null, true);
      const allowed = allowedOrigins.some(pattern =>
        typeof pattern === "string" ? pattern === origin : pattern.test(origin)
      );
      callback(allowed ? null : new Error("Not allowed by CORS"), allowed);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  })
);

// Rate limiting — strict on auth, relaxed on API
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
});

// Request logging
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

// Body parsing with size limits
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

// Apply rate limiters
app.use("/api/auth/login", authLimiter);
app.use("/api", apiLimiter);

// Routes
app.use("/api", router);

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  const log = (req as Request & { log?: typeof logger }).log ?? logger;
  log.error({ err, url: req.url, method: req.method }, "Unhandled error");
  if (err.message === "Not allowed by CORS") {
    res.status(403).json({ error: "CORS policy violation" });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

export default app;
