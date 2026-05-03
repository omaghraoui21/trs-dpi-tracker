import { Router, IRouter } from "express";
import { db, downtimeEventsTable, downtimeCategoriesTable, productionEntriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import type { User } from "@workspace/db";

const router: IRouter = Router();

function calcDuration(start: string, end: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return isNaN(h) || isNaN(m) ? 0 : h * 60 + m;
  };
  const diff = toMin(end) - toMin(start);
  return diff < 0 ? diff + 1440 : diff;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatEvent(e: {
  id: string;
  entryId: string;
  categoryId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  comment: string | null;
  isDeleted: boolean;
  status?: string | null;
  categoryCode?: string | null;
  categoryLabel?: string | null;
  categoryIsPlanned?: boolean | null;
}) {
  return {
    id: e.id,
    entryId: e.entryId,
    categoryId: e.categoryId,
    categoryCode: e.categoryCode ?? null,
    categoryLabel: e.categoryLabel ?? null,
    categoryIsPlanned: e.categoryIsPlanned ?? null,
    startTime: e.startTime,
    endTime: e.endTime,
    durationMinutes: e.durationMinutes,
    status: e.status ?? "closed",
    comment: e.comment ?? null,
    isDeleted: e.isDeleted,
  };
}

const DETAIL_COLS = {
  id: downtimeEventsTable.id,
  entryId: downtimeEventsTable.entryId,
  categoryId: downtimeEventsTable.categoryId,
  startTime: downtimeEventsTable.startTime,
  endTime: downtimeEventsTable.endTime,
  durationMinutes: downtimeEventsTable.durationMinutes,
  status: downtimeEventsTable.status,
  comment: downtimeEventsTable.comment,
  isDeleted: downtimeEventsTable.isDeleted,
  categoryCode: downtimeCategoriesTable.code,
  categoryLabel: downtimeCategoriesTable.label,
  categoryIsPlanned: downtimeCategoriesTable.isPlanned,
} as const;

// Returns true if user may write to this production entry (supervisor/admin bypass ownership check).
async function canWriteEntry(entryId: string, user: User): Promise<boolean> {
  if (user.role === "supervisor" || user.role === "admin") return true;
  const [entry] = await db
    .select({ operatorId: productionEntriesTable.operatorId })
    .from(productionEntriesTable)
    .where(eq(productionEntriesTable.id, entryId));
  return entry?.operatorId === user.id;
}

router.get("/downtime-events", requireAuth, async (req, res): Promise<void> => {
  const entryId = String(req.query.entryId ?? "");
  if (!entryId) {
    res.status(400).json({ error: "entryId is required" });
    return;
  }
  const rows = await db
    .select(DETAIL_COLS)
    .from(downtimeEventsTable)
    .leftJoin(downtimeCategoriesTable, eq(downtimeEventsTable.categoryId, downtimeCategoriesTable.id))
    .where(and(eq(downtimeEventsTable.entryId, entryId), eq(downtimeEventsTable.isDeleted, false)));
  res.json(rows.map(formatEvent));
});

// ── POST /downtime-events — crée un arrêt fermé (durée connue) ───────────
router.post("/downtime-events", requireAuth, async (req, res): Promise<void> => {
  const { entryId, categoryId, startTime, endTime, comment } = req.body as {
    entryId: string; categoryId: string; startTime: string; endTime: string; comment?: string;
  };
  if (!entryId || !categoryId || !startTime || !endTime) {
    res.status(400).json({ error: "entryId, categoryId, startTime et endTime sont requis" });
    return;
  }
  if (!(await canWriteEntry(entryId, req.user!))) {
    res.status(403).json({ error: "Accès refusé : ce lot ne vous appartient pas" });
    return;
  }
  const duration = calcDuration(startTime, endTime);
  if (duration <= 0) {
    res.status(400).json({ error: "La durée doit être positive" });
    return;
  }
  const [row] = await db.insert(downtimeEventsTable).values({
    entryId,
    categoryId,
    startTime,
    endTime,
    durationMinutes: duration,
    status: "closed",
    comment: comment ?? null,
    createdBy: req.user?.id ?? null,
  }).returning();

  const [full] = await db
    .select(DETAIL_COLS)
    .from(downtimeEventsTable)
    .leftJoin(downtimeCategoriesTable, eq(downtimeEventsTable.categoryId, downtimeCategoriesTable.id))
    .where(eq(downtimeEventsTable.id, row.id));
  res.status(201).json(formatEvent(full));
});

// ── POST /downtime-events/start — démarre un arrêt live (status=open) ────
router.post("/downtime-events/start", requireAuth, async (req, res): Promise<void> => {
  const { entryId, categoryId, startTime, comment } = req.body as {
    entryId: string; categoryId: string; startTime?: string; comment?: string;
  };
  if (!entryId || !categoryId) {
    res.status(400).json({ error: "entryId et categoryId requis" });
    return;
  }
  if (!(await canWriteEntry(entryId, req.user!))) {
    res.status(403).json({ error: "Accès refusé : ce lot ne vous appartient pas" });
    return;
  }
  const effectiveStart = startTime ?? nowHHMM();
  const [row] = await db.insert(downtimeEventsTable).values({
    entryId,
    categoryId,
    startTime: effectiveStart,
    endTime: effectiveStart,
    durationMinutes: 0,
    status: "open",
    comment: comment ?? null,
    createdBy: req.user?.id ?? null,
  }).returning();

  const [full] = await db
    .select(DETAIL_COLS)
    .from(downtimeEventsTable)
    .leftJoin(downtimeCategoriesTable, eq(downtimeEventsTable.categoryId, downtimeCategoriesTable.id))
    .where(eq(downtimeEventsTable.id, row.id));
  res.status(201).json(formatEvent(full));
});

// ── PATCH /downtime-events/:id/stop — ferme un arrêt live ────────────────
router.patch("/downtime-events/:id/stop", requireAuth, async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const { endTime } = req.body as { endTime?: string };
  const effectiveEnd = endTime ?? nowHHMM();

  const [existing] = await db.select().from(downtimeEventsTable).where(eq(downtimeEventsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Arrêt non trouvé" });
    return;
  }
  if (!(await canWriteEntry(existing.entryId, req.user!))) {
    res.status(403).json({ error: "Accès refusé : ce lot ne vous appartient pas" });
    return;
  }
  const duration = Math.max(1, calcDuration(existing.startTime, effectiveEnd));
  await db.update(downtimeEventsTable).set({
    endTime: effectiveEnd,
    durationMinutes: duration,
    status: "closed",
  }).where(eq(downtimeEventsTable.id, id));

  const [full] = await db
    .select(DETAIL_COLS)
    .from(downtimeEventsTable)
    .leftJoin(downtimeCategoriesTable, eq(downtimeEventsTable.categoryId, downtimeCategoriesTable.id))
    .where(eq(downtimeEventsTable.id, id));
  res.json(formatEvent(full));
});

router.patch("/downtime-events/:id", requireAuth, async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const { categoryId, startTime, endTime, comment } = req.body as {
    categoryId?: string; startTime?: string; endTime?: string; comment?: string;
  };
  const [existing] = await db.select().from(downtimeEventsTable).where(eq(downtimeEventsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Downtime event not found" });
    return;
  }
  if (!(await canWriteEntry(existing.entryId, req.user!))) {
    res.status(403).json({ error: "Accès refusé : ce lot ne vous appartient pas" });
    return;
  }
  const newStart = startTime ?? existing.startTime;
  const newEnd = endTime ?? existing.endTime;
  const duration = calcDuration(newStart, newEnd);
  const updateData: Record<string, unknown> = { durationMinutes: duration };
  if (categoryId !== undefined) updateData.categoryId = categoryId;
  if (startTime !== undefined) updateData.startTime = startTime;
  if (endTime !== undefined) updateData.endTime = endTime;
  if (comment !== undefined) updateData.comment = comment;

  await db.update(downtimeEventsTable).set(updateData).where(eq(downtimeEventsTable.id, id));
  const [full] = await db
    .select(DETAIL_COLS)
    .from(downtimeEventsTable)
    .leftJoin(downtimeCategoriesTable, eq(downtimeEventsTable.categoryId, downtimeCategoriesTable.id))
    .where(eq(downtimeEventsTable.id, id));
  res.json(formatEvent(full));
});

router.delete("/downtime-events/:id", requireAuth, async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const [existing] = await db.select({ entryId: downtimeEventsTable.entryId }).from(downtimeEventsTable).where(eq(downtimeEventsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Arrêt non trouvé" });
    return;
  }
  if (!(await canWriteEntry(existing.entryId, req.user!))) {
    res.status(403).json({ error: "Accès refusé : ce lot ne vous appartient pas" });
    return;
  }
  await db.update(downtimeEventsTable).set({ isDeleted: true }).where(eq(downtimeEventsTable.id, id));
  res.sendStatus(204);
});

export default router;
