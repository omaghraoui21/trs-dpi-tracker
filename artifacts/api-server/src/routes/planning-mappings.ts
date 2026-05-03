import { Router, IRouter } from "express";
import { db, planningActivityMappingsTable, equipmentsTable, roomsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const CreateMappingSchema = z.object({
  activityLabel:       z.string().min(1),
  mappedActivityType:  z.string().optional(),
  equipmentId:         z.string().uuid().optional(),
  roomId:              z.string().uuid().optional(),
  defaultUnit:         z.string().optional(),
  isProductive:        z.boolean().default(true),
  excludedFromTrs:     z.boolean().default(false),
  triggersStatus:      z.boolean().default(false),
  isActive:            z.boolean().default(true),
});

router.get("/planning-mappings", requireAuth, async (req, res): Promise<void> => {
  const mappings = await db
    .select({
      id: planningActivityMappingsTable.id,
      activityLabel: planningActivityMappingsTable.activityLabel,
      mappedActivityType: planningActivityMappingsTable.mappedActivityType,
      equipmentId: planningActivityMappingsTable.equipmentId,
      roomId: planningActivityMappingsTable.roomId,
      defaultUnit: planningActivityMappingsTable.defaultUnit,
      isProductive: planningActivityMappingsTable.isProductive,
      excludedFromTrs: planningActivityMappingsTable.excludedFromTrs,
      triggersStatus: planningActivityMappingsTable.triggersStatus,
      isActive: planningActivityMappingsTable.isActive,
      equipmentName: equipmentsTable.name,
      roomName: roomsTable.name,
    })
    .from(planningActivityMappingsTable)
    .leftJoin(equipmentsTable, eq(planningActivityMappingsTable.equipmentId, equipmentsTable.id))
    .leftJoin(roomsTable, eq(planningActivityMappingsTable.roomId, roomsTable.id))
    .orderBy(planningActivityMappingsTable.activityLabel);

  res.json(mappings);
});

router.post("/planning-mappings", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateMappingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }

  const [created] = await db
    .insert(planningActivityMappingsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(created);
});

router.patch("/planning-mappings/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = CreateMappingSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }

  const patch: Partial<typeof planningActivityMappingsTable.$inferInsert> = {};
  if (parsed.data.activityLabel !== undefined)      patch.activityLabel = parsed.data.activityLabel;
  if (parsed.data.mappedActivityType !== undefined) patch.mappedActivityType = parsed.data.mappedActivityType;
  if (parsed.data.equipmentId !== undefined)        patch.equipmentId = parsed.data.equipmentId;
  if (parsed.data.roomId !== undefined)             patch.roomId = parsed.data.roomId;
  if (parsed.data.defaultUnit !== undefined)        patch.defaultUnit = parsed.data.defaultUnit;
  if (parsed.data.isProductive !== undefined)       patch.isProductive = parsed.data.isProductive;
  if (parsed.data.excludedFromTrs !== undefined)    patch.excludedFromTrs = parsed.data.excludedFromTrs;
  if (parsed.data.triggersStatus !== undefined)     patch.triggersStatus = parsed.data.triggersStatus;
  if (parsed.data.isActive !== undefined)           patch.isActive = parsed.data.isActive;

  const [updated] = await db
    .update(planningActivityMappingsTable)
    .set(patch)
    .where(eq(planningActivityMappingsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Mapping non trouvé" }); return; }
  res.json(updated);
});

router.delete("/planning-mappings/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [updated] = await db
    .update(planningActivityMappingsTable)
    .set({ isActive: false })
    .where(eq(planningActivityMappingsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Mapping non trouvé" }); return; }
  res.json({ success: true });
});

export default router;
