// Drizzle wraps pg errors: the Postgres error code lives on err.cause.code
function pgCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

export function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === "23505";
}

export function isForeignKeyViolation(err: unknown): boolean {
  return pgCode(err) === "23503";
}

/**
 * Map a database error to an HTTP-shaped response payload, or null if the
 * error is not one we recognize.
 *
 * Currently only handles unique-violation (23505) -> HTTP 409 with a French
 * user-facing message. Routes use it like:
 *
 *   const mapped = mapDbError(err);
 *   if (mapped) { res.status(mapped.status).json(mapped.body); return; }
 *   throw err;
 */
export function mapDbError(err: unknown): { status: number; body: { error: string } } | null {
  if (isUniqueViolation(err)) {
    return { status: 409, body: { error: "Cette valeur existe déjà (code dupliqué)" } };
  }
  return null;
}
