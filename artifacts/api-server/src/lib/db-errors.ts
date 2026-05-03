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
