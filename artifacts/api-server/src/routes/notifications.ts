import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { eq, desc, and, or } from "drizzle-orm";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const status = String(req.query.status ?? "");
  const severity = String(req.query.severity ?? "");
  const lim = req.query.limit ? parseInt(String(req.query.limit)) : 200;
  const filters = [];
  if (status) {
    const statuses = status.split(",").filter(s => ["open", "acknowledged", "closed"].includes(s)) as ("open" | "acknowledged" | "closed")[];
    if (statuses.length > 0) {
      const conds = statuses.map(s => eq(notificationsTable.status, s));
      filters.push(conds.length === 1 ? conds[0] : or(...conds)!);
    }
  }
  if (severity) {
    const severities = severity.split(",").filter(s => ["info", "warning", "critical"].includes(s)) as ("info" | "warning" | "critical")[];
    if (severities.length > 0) {
      const conds = severities.map(s => eq(notificationsTable.severity, s));
      filters.push(conds.length === 1 ? conds[0] : or(...conds)!);
    }
  }
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(lim);

  res.json(rows.map(n => ({
    id: n.id,
    type: n.type,
    severity: n.severity,
    equipment: null,
    room: null,
    product: null,
    lot: n.lotNumber ?? null,
    message: n.message,
    status: n.status,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
    acknowledgedAt: n.acknowledgedAt instanceof Date ? n.acknowledgedAt.toISOString() : (n.acknowledgedAt ?? null),
    closedAt: n.closedAt instanceof Date ? n.closedAt.toISOString() : (n.closedAt ?? null),
    comment: n.closureComment ?? null,
  })));
});

router.post("/notifications", requireAuth, requireRole("supervisor", "admin"), async (req, res): Promise<void> => {
  const { type, severity, lot, message } = req.body as {
    type: string; severity?: string; lot?: string; message: string;
  };
  if (!type || !message) { res.status(400).json({ error: "type et message requis" }); return; }
  const [created] = await db.insert(notificationsTable).values({
    type,
    severity: (["info", "warning", "critical"].includes(severity ?? "") ? severity : "info") as "info" | "warning" | "critical",
    lotNumber: lot ?? null,
    message,
    status: "open",
  }).returning();
  res.status(201).json({
    id: created.id,
    type: created.type,
    severity: created.severity,
    equipment: null,
    room: null,
    product: null,
    lot: created.lotNumber ?? null,
    message: created.message,
    status: created.status,
    createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : String(created.createdAt),
    acknowledgedAt: null,
    closedAt: null,
    comment: null,
  });
});

router.patch("/notifications/:id", requireAuth, async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const { action, comment } = req.body as { action: "acknowledge" | "close"; comment?: string };
  const userId = req.user!.id;

  if (!["acknowledge", "close"].includes(action)) { res.status(400).json({ error: "Action invalide" }); return; }

  const updateData: Record<string, unknown> = {};
  if (action === "acknowledge") {
    updateData.status = "acknowledged";
    updateData.acknowledgedById = userId;
    updateData.acknowledgedAt = new Date();
    if (comment) updateData.closureComment = comment;
  } else {
    updateData.status = "closed";
    updateData.closedById = userId;
    updateData.closedAt = new Date();
    if (comment) updateData.closureComment = comment;
  }

  const [updated] = await db.update(notificationsTable)
    .set(updateData)
    .where(eq(notificationsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Notification non trouvée" }); return; }
  res.json({
    id: updated.id,
    type: updated.type,
    severity: updated.severity,
    equipment: null,
    room: null,
    product: null,
    lot: updated.lotNumber ?? null,
    message: updated.message,
    status: updated.status,
    createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : String(updated.createdAt),
    acknowledgedAt: updated.acknowledgedAt instanceof Date ? updated.acknowledgedAt.toISOString() : (updated.acknowledgedAt ?? null),
    closedAt: updated.closedAt instanceof Date ? updated.closedAt.toISOString() : (updated.closedAt ?? null),
    comment: updated.closureComment ?? null,
  });
});

router.delete("/notifications/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
  res.status(204).send();
});

export default router;
