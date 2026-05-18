import { Router, IRouter } from "express";
import { db, equipmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache30 } from "../lib/cache-control";
import { isUniqueViolation } from "../lib/db-errors";
import { writeAudit } from "../lib/audit";
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
    const includeInactive = req.query["includeInactive"] === "true";
    const query = db.select().from(equipmentsTable).$dynamic();
    const rows = includeInactive
      ? await query.orderBy(equipmentsTable.name)
      : await query.where(eq(equipmentsTable.isActive, true)).orderBy(equipmentsTable.name);
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
        userId: req.user?.id,
        tableName: "equipments",
        recordId: row.id,
        action: "create",
        newValues: row as unknown as Record<string, unknown>,
      });
      res.status(201).json(formatEquipment(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Un équipement avec ce code existe déjà" });
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
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.trsObjective !== undefined) {
      updateData.trsObjective = parsed.data.trsObjective.toString();
    }
    const [before] = await db
      .select()
      .from(equipmentsTable)
      .where(eq(equipmentsTable.id, params.data.id));
    if (!before) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    try {
      const [row] = await db
        .update(equipmentsTable)
        .set(updateData)
        .where(eq(equipmentsTable.id, params.data.id))
        .returning();
      writeAudit({
        userId: req.user?.id,
        tableName: "equipments",
        recordId: row.id,
        action: "update",
        oldValues: before as unknown as Record<string, unknown>,
        newValues: row as unknown as Record<string, unknown>,
      });
      res.json(formatEquipment(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Un équipement avec ce code existe déjà" });
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
    const [before] = await db.select().from(equipmentsTable).where(eq(equipmentsTable.id, id));
    if (!before) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    const [row] = await db
      .update(equipmentsTable)
      .set({ isActive: false })
      .where(eq(equipmentsTable.id, id))
      .returning();
    writeAudit({
      userId: req.user?.id,
      tableName: "equipments",
      recordId: row.id,
      action: "delete",
      oldValues: before as unknown as Record<string, unknown>,
      reason: "soft-delete via DELETE /equipments/:id",
    });
    res.sendStatus(204);
  }),
);

export default router;
