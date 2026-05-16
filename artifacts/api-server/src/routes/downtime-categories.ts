import { Router, IRouter } from "express";
import { db, downtimeCategoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache30 } from "../lib/cache-control";
import { mapDbError, isForeignKeyViolation } from "../lib/db-errors";
import { countDependencies } from "../lib/referential-deps";
import { decideDeleteAction } from "../lib/smart-delete";
import { writeAudit } from "../lib/audit";
import {
  CreateDowntimeCategoryBody,
  UpdateDowntimeCategoryBody,
  UpdateDowntimeCategoryParams,
  ListDowntimeCategoriesQueryParams,
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

router.get(
  "/downtime-categories",
  requireAuth,
  cache30,
  asyncHandler(async (req, res) => {
    const q = ListDowntimeCategoriesQueryParams.safeParse(req.query);
    const includeInactive = q.success ? q.data.includeInactive === true : false;
    const rows = includeInactive
      ? await db.select().from(downtimeCategoriesTable).orderBy(downtimeCategoriesTable.code)
      : await db
          .select()
          .from(downtimeCategoriesTable)
          .where(eq(downtimeCategoriesTable.isActive, true))
          .orderBy(downtimeCategoriesTable.code);
    res.json(rows.map(formatCategory));
  }),
);

router.post(
  "/downtime-categories",
  requireAuth,
  requireRole("admin", "supervisor"),
  asyncHandler(async (req, res) => {
    const { isQuickShortcut, shortcutEquipments, ...bodyRest } = req.body as {
      isQuickShortcut?: boolean;
      shortcutEquipments?: string | null;
      [k: string]: unknown;
    };
    const parsed = CreateDowntimeCategoryBody.safeParse(bodyRest);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const insertData: typeof downtimeCategoriesTable.$inferInsert = { ...parsed.data };
    if (typeof isQuickShortcut === "boolean") insertData.isQuickShortcut = isQuickShortcut;
    if (shortcutEquipments !== undefined)
      insertData.shortcutEquipments = shortcutEquipments ?? null;
    try {
      const [row] = await db.insert(downtimeCategoriesTable).values(insertData).returning();
      writeAudit({
        userId: req.user!.id,
        tableName: "downtime_categories",
        recordId: row.id,
        action: "create",
        newValues: row as Record<string, unknown>,
      });
      res.status(201).json(formatCategory(row));
    } catch (err) {
      const mapped = mapDbError(err);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }
  }),
);

router.patch(
  "/downtime-categories/:id",
  requireAuth,
  requireRole("admin", "supervisor"),
  asyncHandler(async (req, res) => {
    const params = UpdateDowntimeCategoryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { isQuickShortcut, shortcutEquipments, ...bodyRest } = req.body as {
      isQuickShortcut?: boolean;
      shortcutEquipments?: string | null;
      [k: string]: unknown;
    };
    const parsed = UpdateDowntimeCategoryBody.safeParse(bodyRest);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(downtimeCategoriesTable)
      .where(eq(downtimeCategoriesTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    const updateData: Partial<typeof downtimeCategoriesTable.$inferInsert> = { ...parsed.data };
    if (typeof isQuickShortcut === "boolean") updateData.isQuickShortcut = isQuickShortcut;
    if (shortcutEquipments !== undefined)
      updateData.shortcutEquipments = shortcutEquipments ?? null;
    try {
      const [row] = await db
        .update(downtimeCategoriesTable)
        .set(updateData)
        .where(eq(downtimeCategoriesTable.id, params.data.id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      writeAudit({
        userId: req.user!.id,
        tableName: "downtime_categories",
        recordId: row.id,
        action: "update",
        oldValues: existing as Record<string, unknown>,
        newValues: row as Record<string, unknown>,
      });
      res.json(formatCategory(row));
    } catch (err) {
      const mapped = mapDbError(err);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }
  }),
);

router.delete(
  "/downtime-categories/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "ID requis" });
      return;
    }
    const [existing] = await db
      .select()
      .from(downtimeCategoriesTable)
      .where(eq(downtimeCategoriesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const deps = await countDependencies("downtime-categories", id);
    const decision = decideDeleteAction(deps);

    if (decision.kind === "block") {
      res.status(409).json({ error: decision.reason });
      return;
    }

    if (decision.kind === "hard_delete") {
      try {
        await db.delete(downtimeCategoriesTable).where(eq(downtimeCategoriesTable.id, id));
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          res.status(409).json({ error: "Suppression impossible: dépendance détectée." });
          return;
        }
        throw err;
      }
      writeAudit({
        userId: req.user!.id,
        tableName: "downtime_categories",
        recordId: id,
        action: "delete",
        oldValues: existing as Record<string, unknown>,
      });
      res.sendStatus(204);
      return;
    }

    // deactivate
    const [row] = await db
      .update(downtimeCategoriesTable)
      .set({ isActive: false })
      .where(eq(downtimeCategoriesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    writeAudit({
      userId: req.user!.id,
      tableName: "downtime_categories",
      recordId: row.id,
      action: "deactivate",
      oldValues: existing as Record<string, unknown>,
      newValues: row as Record<string, unknown>,
    });
    res.status(200).json(formatCategory(row));
  }),
);

router.post(
  "/downtime-categories/:id/reactivate",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const params = UpdateDowntimeCategoryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(downtimeCategoriesTable)
      .where(eq(downtimeCategoriesTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    if (existing.isActive === true) {
      res.status(200).json(formatCategory(existing));
      return;
    }
    const [row] = await db
      .update(downtimeCategoriesTable)
      .set({ isActive: true })
      .where(eq(downtimeCategoriesTable.id, params.data.id))
      .returning();
    writeAudit({
      userId: req.user!.id,
      tableName: "downtime_categories",
      recordId: row.id,
      action: "reactivate",
      oldValues: existing as Record<string, unknown>,
      newValues: row as Record<string, unknown>,
    });
    res.status(200).json(formatCategory(row));
  }),
);

export default router;
