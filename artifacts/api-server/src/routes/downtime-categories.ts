import { Router, IRouter } from "express";
import { db, downtimeCategoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache30 } from "../lib/cache-control";
import { writeAudit } from "../lib/audit";
import { withUniqueCheck, countCategoryDeps } from "../lib/referential-helpers";
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
    impactKpi: c.impactKpi ?? null,
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
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(downtimeCategoriesTable)
      .orderBy(downtimeCategoriesTable.code);
    res.json(rows.map(formatCategory));
  }),
);

// GET dependencies count for a category (used by frontend before deactivation)
router.get(
  "/downtime-categories/:id/dependencies",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "ID requis" });
      return;
    }
    const deps = await countCategoryDeps(id);
    res.json({ dependencies: deps, total: deps.reduce((sum, d) => sum + d.count, 0) });
  }),
);

router.post(
  "/downtime-categories",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    // Accept isQuickShortcut and shortcutEquipments directly (not in Orval zod schema yet)
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

    const result = await withUniqueCheck(
      res,
      async () => {
        const [row] = await db.insert(downtimeCategoriesTable).values(insertData).returning();
        return row;
      },
      "Une catégorie avec ce code existe déjà",
    );
    if (!result) return;

    void writeAudit({
      userId: req.user?.id,
      tableName: "downtime_categories",
      recordId: result.id,
      action: "create",
      newValues: { ...parsed.data, isQuickShortcut, shortcutEquipments },
    });
    res.status(201).json(formatCategory(result));
  }),
);

router.patch(
  "/downtime-categories/:id",
  requireAuth,
  requireRole("admin"),
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

    // Fetch old values for audit
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

    const result = await withUniqueCheck(
      res,
      async () => {
        const [row] = await db
          .update(downtimeCategoriesTable)
          .set(updateData)
          .where(eq(downtimeCategoriesTable.id, params.data.id))
          .returning();
        return row;
      },
      "Une catégorie avec ce code existe déjà",
    );
    if (!result) return;

    const action =
      parsed.data.isActive === true && !existing.isActive
        ? "update"
        : parsed.data.isActive === false && existing.isActive
          ? "delete"
          : "update";

    void writeAudit({
      userId: req.user?.id,
      tableName: "downtime_categories",
      recordId: result.id,
      action,
      oldValues: { code: existing.code, label: existing.label, isActive: existing.isActive },
      newValues: { ...parsed.data, isQuickShortcut, shortcutEquipments },
    });

    res.json(formatCategory(result));
  }),
);

// DELETE = soft-delete (deactivate)
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
    const [row] = await db
      .update(downtimeCategoriesTable)
      .set({ isActive: false })
      .where(eq(downtimeCategoriesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    void writeAudit({
      userId: req.user?.id,
      tableName: "downtime_categories",
      recordId: id,
      action: "delete",
      oldValues: { code: row.code, label: row.label, isActive: true },
      newValues: { isActive: false },
    });

    res.sendStatus(204);
  }),
);

export default router;
