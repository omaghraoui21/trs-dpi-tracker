import { type Request, type Response, type NextFunction, type RequestHandler } from "express";

/**
 * Wraps an async Express route handler to catch any unhandled promise rejections
 * and forward them to the next() error middleware (app.ts global handler).
 *
 * Without this, an async handler that throws will cause an unhandled rejection
 * instead of returning a proper 500 response.
 *
 * Usage:
 *   router.get("/path", requireAuth, asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
