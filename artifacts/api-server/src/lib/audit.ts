/**
 * Audit trail helper — fire-and-forget writes to the audit_log table.
 *
 * Usage:
 *   void writeAudit({ userId, tableName: "production_entries", recordId: id,
 *                     action: "delete", oldValues: existing });
 *
 * ⚠️ Never `await` this in a critical path — it must not block the response.
 */

import { db, auditLogTable } from "@workspace/db";
import { logger } from "./logger";

export interface AuditParams {
  userId: string | null | undefined;
  tableName: string;
  recordId: string;
  action: "create" | "update" | "delete" | "login" | "reset_password" | "validate" | "reject" | "submit";
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reason?: string | null;
}

export function writeAudit(params: AuditParams): void {
  db.insert(auditLogTable).values({
    userId: params.userId ?? null,
    tableName: params.tableName,
    recordId: params.recordId,
    action: params.action,
    oldValues: params.oldValues ?? null,
    newValues: params.newValues ?? null,
    reason: params.reason ?? null,
  }).catch((err: unknown) => {
    logger.warn({ err, params: { ...params, oldValues: undefined, newValues: undefined } },
      "Audit log write failed — non-blocking");
  });
}
