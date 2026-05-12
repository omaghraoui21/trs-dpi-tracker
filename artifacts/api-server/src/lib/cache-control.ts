import { type Request, type Response, type NextFunction } from "express";

/**
 * Adds `Cache-Control: private, max-age=<seconds>` to read-only endpoints.
 * The `private` directive allows the browser to cache the response but prevents
 * shared/CDN caching (important for authenticated data).
 *
 * Usage:
 *   router.get("/equipments", requireAuth, cacheFor(60), asyncHandler(...))
 */
export function cacheFor(seconds: number) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("Cache-Control", `private, max-age=${seconds}`);
    next();
  };
}

/** 30-second cache — for quasi-static data (equipments, products, categories) */
export const cache30 = cacheFor(30);

/** 5-second cache — for dashboard summaries that change frequently */
export const cache5 = cacheFor(5);
