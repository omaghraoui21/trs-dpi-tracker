import { Router, IRouter } from "express";
import { db, equipmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache30 } from "../lib/cache-control";
import { mapDbError, isForeignKeyViolation } from "../lib/db-errors";
import { countDependencies } from "../lib/referential-deps";
import { decideDeleteAction } from "../lib/smart-delete";
import { writeAudit } from "../lib/audit";
import {
  CreateEquipmentBody,
  UpdateEquipmentBody,
  UpdateEquipmentParams,
  ListEquipmentsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatEquipment(e: typeof equipmentsTable.$inferSelect) {
  return {
    id: e.id,
    name: e.name,
    code: e.code,
    description: e.description ?? null,
    trsObjective: parseFloat(e.trsObjective as unknown as string),
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
  };
}

router.get(
  "/equipments",
  requireAuth,
  cache30,
  asyncHandler(async (req, res) => {
    const q = ListEquipmentsQueryParams.safeParse(req.query);
    const includeInactive = q.success ? q.data.includeInactive === true : false;
    const rows = includeInactive
      ? await db.select().from(equipmentsTable).orderBy(equipmentsTable.name)
      : await db
          .select()
          .from(equipmentsTable)
          .where(eq(equipmentsTable.isActive, true))
          .orderBy(equipmentsTable.name);
    res.json(rows.map(formatEquipment));
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
    try {
      const [row] = await db
        .insert(equipmentsTable)
        .values({
          ...parsed.data,
          trsObjective: parsed.data.trsObjective.toString(),
        })
        .returning();
      writeAudit({
        userId: req.user!.id,
        tableName: "equipments",
        recordId: row.id,
        action: "create",
        newValues: row as Record<string, unknown>,
      });
      res.status(201).json(formatEquipment(row));
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
    try {
      const [row] = await db
        .update(equipmentsTable)
        .set(updateData)
        .where(eq(equipmentsTable.id, params.data.id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Equipment not found" });
        return;
      }
      writeAudit({
        userId: req.user!.id,
        tableName: "equipments",
        recordId: row.id,
        action: "update",
        oldValues: existing as Record<string, unknown>,
        newValues: row as Record<string, unknown>,
      });
      res.json(formatEquipment(row));
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
  "/equipments/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "ID requis" });
      return;
    }
    const [existing] = await db.select().from(equipmentsTable).where(eq(equipmentsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }

    const deps = await countDependencies("equipments", id);
    const decision = decideDeleteAction(deps);

    if (decision.kind === "block") {
      res.status(409).json({ error: decision.reason });
      return;
    }

    if (decision.kind === "hard_delete") {
      try {
        await db.delete(equipmentsTable).where(eq(equipmentsTable.id, id));
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          res.status(409).json({ error: "Suppression impossible: dépendance détectée." });
          return;
        }
        throw err;
      }
      writeAudit({
        userId: req.user!.id,
        tableName: "equipments",
        recordId: id,
        action: "delete",
        oldValues: existing as Record<string, unknown>,
      });
      res.sendStatus(204);
      return;
    }

    // deactivate
    const [row] = await db
      .update(equipmentsTable)
      .set({ isActive: false })
      .where(eq(equipmentsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    writeAudit({
      userId: req.user!.id,
      tableName: "equipments",
      recordId: row.id,
      action: "deactivate",
      oldValues: existing as Record<string, unknown>,
      newValues: row as Record<string, unknown>,
    });
    res.status(200).json(formatEquipment(row));
  }),
);

router.post(
  "/equipments/:id/reactivate",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const params = UpdateEquipmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(equipmentsTable)
      .where(eq(equipmentsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    if (existing.isActive === true) {
      res.status(200).json(formatEquipment(existing));
      return;
    }
    const [row] = await db
      .update(equipmentsTable)
      .set({ isActive: true })
      .where(eq(equipmentsTable.id, params.data.id))
      .returning();
    writeAudit({
      userId: req.user!.id,
      tableName: "equipments",
      recordId: row.id,
      action: "reactivate",
      oldValues: existing as Record<string, unknown>,
      newValues: row as Record<string, unknown>,
    });
    res.status(200).json(formatEquipment(row));
  }),
);

export default router;
