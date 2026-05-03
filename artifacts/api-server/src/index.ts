import http from "http";
import { db } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// On SIGTERM/SIGINT: stop accepting new connections, drain existing ones,
// close the DB pool, then exit cleanly. Kubernetes, Docker, and Replit all
// send SIGTERM before force-killing a container.

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Graceful shutdown initiated");

  // 1. Stop accepting new HTTP connections (allow up to 10 s to drain)
  const closeServer = new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  const drainTimeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000));

  await Promise.race([closeServer, drainTimeout]);

  // 2. Release the database connection pool
  try {
    await db.$client.end();
    logger.info("Database pool closed");
  } catch (err) {
    logger.warn({ err }, "Error closing database pool");
  }

  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Unhandled rejections / exceptions — log and exit (let the process manager restart)
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  shutdown("uncaughtException");
});
