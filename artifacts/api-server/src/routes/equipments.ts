import { Router, IRouter } from "express";
import { db, equipmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache30 } from "../lib/cache-control";
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

router.get("/equipments", requireAuth, cache30, asyncHandler(async (_req, res) => {
  const rows = await db.select().from(equipmentsTable).orderBy(equipmentsTable.name);
  res.json(rows.map(formatEquipment));
}));

router.post("/equipments", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const parsed = CreateEquipmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(equipmentsTable).values({
    ...parsed.data,
    trsObjective: parsed.data.trsObjective.toString(),
  }).returning();
  res.status(201).json(formatEquipment(row));
}));

router.patch("/equipments/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
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
  const [row] = await db.update(equipmentsTable).set(updateData).where(eq(equipmentsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Equipment not found" });
    return;
  }
  res.json(formatEquipment(row));
}));

router.delete("/equipments/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const id = req.params["id"] as string;
  if (!id) { res.status(400).json({ error: "ID requis" }); return; }
  const [row] = await db
    .update(equipmentsTable)
    .set({ isActive: false })
    .where(eq(equipmentsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Equipment not found" }); return; }
  res.sendStatus(204);
}));

export default router;
