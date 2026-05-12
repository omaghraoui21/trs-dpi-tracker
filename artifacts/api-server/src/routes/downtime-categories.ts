import { Router, IRouter } from "express";
import { db, downtimeCategoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache30 } from "../lib/cache-control";
import {
  CreateDowntimeCategoryBody,
  UpdateDowntimeCategoryBody,
  UpdateDowntimeCategoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatCategory(c: typeof downtimeCategoriesTable.$inferSelect) {
  return {
    id: c.id,
    code: c.code,
    label: c.label,
    description: c.description ?? null,
    famille: c.famille ?? null,
    impactType: c.impactType,
    isPlanned: c.isPlanned,
    requiresComment: c.requiresComment,
    isActive: c.isActive,
    isQuickShortcut: c.isQuickShortcut,
    shortcutEquipments: c.shortcutEquipments ?? null,
  };
}

router.get("/downtime-categories", requireAuth, cache30, asyncHandler(async (_req, res) => {
  const rows = await db.select().from(downtimeCategoriesTable).orderBy(downtimeCategoriesTable.code);
  res.json(rows.map(formatCategory));
}));

router.post("/downtime-categories", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req, res) => {
  const { isQuickShortcut, shortcutEquipments, ...bodyRest } = req.body as { isQuickShortcut?: boolean; shortcutEquipments?: string | null; [k: string]: unknown };
  const parsed = CreateDowntimeCategoryBody.safeParse(bodyRest);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const insertData: typeof downtimeCategoriesTable.$inferInsert = { ...parsed.data };
  if (typeof isQuickShortcut === "boolean") insertData.isQuickShortcut = isQuickShortcut;
  if (shortcutEquipments !== undefined) insertData.shortcutEquipments = shortcutEquipments ?? null;
  const [row] = await db.insert(downtimeCategoriesTable).values(insertData).returning();
  res.status(201).json(formatCategory(row));
}));

router.patch("/downtime-categories/:id", requireAuth, requireRole("admin", "supervisor"), asyncHandler(async (req, res) => {
  const params = UpdateDowntimeCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { isQuickShortcut, shortcutEquipments, ...bodyRest } = req.body as { isQuickShortcut?: boolean; shortcutEquipments?: string | null; [k: string]: unknown };
  const parsed = UpdateDowntimeCategoryBody.safeParse(bodyRest);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Partial<typeof downtimeCategoriesTable.$inferInsert> = { ...parsed.data };
  if (typeof isQuickShortcut === "boolean") updateData.isQuickShortcut = isQuickShortcut;
  if (shortcutEquipments !== undefined) updateData.shortcutEquipments = shortcutEquipments ?? null;
  const [row] = await db.update(downtimeCategoriesTable).set(updateData).where(eq(downtimeCategoriesTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json(formatCategory(row));
}));

router.delete("/downtime-categories/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const id = req.params["id"] as string;
  if (!id) { res.status(400).json({ error: "ID requis" }); return; }
  const [row] = await db
    .update(downtimeCategoriesTable)
    .set({ isActive: false })
    .where(eq(downtimeCategoriesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Category not found" }); return; }
  res.sendStatus(204);
}));

export default router;
