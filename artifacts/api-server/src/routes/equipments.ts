import { Router, IRouter } from "express";
import { db, equipmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache30 } from "../lib/cache-control";
import { writeAudit } from "../lib/audit";
import { withUniqueCheck, countEquipmentDeps } from "../lib/referential-helpers";
import {
  CreateEquipmentBody,
  UpdateEquipmentBody,
  UpdateEquipmentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatEquipment(e: typeof equipmentsTable.$inferSelect) {
  return {
    id: e.id,
    name: e.name,
    code: e.code,
    description: e.description ?? null,
    equipmentType: e.equipmentType ?? null,
    trsObjective: parseFloat(e.trsObjective as unknown as string),
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
  };
}

router.get(
  "/equipments",
  requireAuth,
  cache30,
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(equipmentsTable).orderBy(equipmentsTable.name);
    res.json(rows.map(formatEquipment));
  }),
);

// GET dependencies count for a given equipment (used by frontend before deactivation)
router.get(
  "/equipments/:id/dependencies",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "ID requis" });
      return;
    }
    const deps = await countEquipmentDeps(id);
    res.json({ dependencies: deps, total: deps.reduce((sum, d) => sum + d.count, 0) });
  }),
);

router.post(
  "/equipments",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = CreateEquipmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const result = await withUniqueCheck(
      res,
      async () => {
        const [row] = await db
          .insert(equipmentsTable)
          .values({
            ...parsed.data,
            trsObjective: parsed.data.trsObjective.toString(),
          })
          .returning();
        return row;
      },
      "Un équipement avec ce code existe déjà",
    );
    if (!result) return;

    void writeAudit({
      userId: req.user?.id,
      tableName: "equipments",
      recordId: result.id,
      action: "create",
      newValues: parsed.data,
    });
    res.status(201).json(formatEquipment(result));
  }),
);

router.patch(
  "/equipments/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const params = UpdateEquipmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateEquipmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Fetch old values for audit
    const [existing] = await db
      .select()
      .from(equipmentsTable)
      .where(eq(equipmentsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }

    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.trsObjective !== undefined) {
      updateData.trsObjective = parsed.data.trsObjective.toString();
    }

    const result = await withUniqueCheck(
      res,
      async () => {
        const [row] = await db
          .update(equipmentsTable)
          .set(updateData)
          .where(eq(equipmentsTable.id, params.data.id))
          .returning();
        return row;
      },
      "Un équipement avec ce code existe déjà",
    );
    if (!result) return;

    // Determine action type for audit
    const action =
      parsed.data.isActive === true && !existing.isActive
        ? "update" // reactivation is also an update
        : parsed.data.isActive === false && existing.isActive
          ? "delete"
          : "update";

    void writeAudit({
      userId: req.user?.id,
      tableName: "equipments",
      recordId: result.id,
      action,
      oldValues: {
        name: existing.name,
        code: existing.code,
        isActive: existing.isActive,
        trsObjective: existing.trsObjective,
      },
      newValues: parsed.data,
    });

    res.json(formatEquipment(result));
  }),
);

// DELETE = soft-delete (deactivate)
router.delete(
  "/equipments/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "ID requis" });
      return;
    }
    const [row] = await db
      .update(equipmentsTable)
      .set({ isActive: false })
      .where(eq(equipmentsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }

    void writeAudit({
      userId: req.user?.id,
      tableName: "equipments",
      recordId: id,
      action: "delete",
      oldValues: { name: row.name, code: row.code, isActive: true },
      newValues: { isActive: false },
    });

    res.sendStatus(204);
  }),
);

export default router;
