import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const START_TIME = Date.now();
const VERSION = process.env["npm_package_version"] ?? "1.0.0";

// ─── /api/livez ───────────────────────────────────────────────────────────────
// Liveness probe — always 200 if the process is alive.
// Railway uses this to decide whether to restart the container.
// Never return 5xx here (DB down ≠ process dead).
router.get("/livez", (_req, res) => {
  res.status(200).json({ status: "ok", uptime: Math.floor((Date.now() - START_TIME) / 1000) });
});

// ─── /api/readyz ──────────────────────────────────────────────────────────────
// Readiness probe — 200 if DB is reachable, 503 otherwise.
// Use this to gate traffic: if DB is down, Railway will stop routing to this instance.
router.get("/readyz", async (_req, res) => {
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs: number | null = null;

  try {
    const t0 = Date.now();
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DB probe timeout")), 2000)),
    ]);
    dbLatencyMs = Date.now() - t0;
  } catch (err) {
    logger.warn({ err }, "Readiness DB probe failed");
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";
  const body = {
    status,
    db: dbStatus,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    version: VERSION,
    ...(dbLatencyMs !== null && { dbLatencyMs }),
  };

  res.status(dbStatus === "ok" ? 200 : 503).json(body);
});

// ─── /api/healthz — legacy alias (keeps Railway config working) ───────────────
// Points to readyz so the existing railway.toml healthcheckPath still works.
router.get("/healthz", async (_req, res) => {
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs: number | null = null;

  try {
    const t0 = Date.now();
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DB probe timeout")), 2000)),
    ]);
    dbLatencyMs = Date.now() - t0;
  } catch (err) {
    logger.warn({ err }, "Health DB probe failed");
    dbStatus = "error";
  }

  const body = {
    status: dbStatus === "ok" ? "ok" : "degraded",
    db: dbStatus,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    version: VERSION,
    ...(dbLatencyMs !== null && { dbLatencyMs }),
  };

  // Keep 200 for backwards compat — Railway uses this as liveness, not readiness
  res.status(200).json(body);
});

export default router;
