import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const START_TIME = Date.now();
const VERSION = process.env["npm_package_version"] ?? "1.0.0";

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
  } catch (error) {
    logger.error('Health check DB probe failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined 
    });
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";
  const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);

  const body = {
    status,
    db: dbStatus,
    uptime: uptimeSeconds,
    version: VERSION,
    ...(dbLatencyMs !== null && { dbLatencyMs }),
  };

  // Always return 200 — Railway healthcheck is a liveness probe.
  // DB degradation is surfaced in the body but must not kill the container.
  res.status(200).json(body);
});

export default router;
