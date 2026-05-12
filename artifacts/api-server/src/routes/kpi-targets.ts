import { Router, IRouter } from "express";
import { db, kpiTargetsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { z } from "zod";

const router: IRouter = Router();

const CreateTargetSchema = z.object({
  siteId:            z.string().uuid().optional(),
  equipmentId:       z.string().uuid().optional(),
  productId:         z.string().uuid().optional(),
  kpiCode:           z.string().min(1),
  targetValue:       z.number().min(0).max(100),
  warningThreshold:  z.number().min(0).max(100).optional(),
  criticalThreshold: z.number().min(0).max(100).optional(),
  validFrom:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isActive:          z.boolean().default(true),
});

router.get("/kpi-targets", requireAuth, asyncHandler(async (req, res) => {
  const targets = await db
    .select()
    .from(kpiTargetsTable)
    .where(eq(kpiTargetsTable.isActive, true))
    .orderBy(kpiTargetsTable.kpiCode);

  res.json(targets);
}));

router.post("/kpi-targets", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const parsed = CreateTargetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }

  const [created] = await db
    .insert(kpiTargetsTable)
    .values({
      ...parsed.data,
      targetValue: String(parsed.data.targetValue),
      warningThreshold: parsed.data.warningThreshold !== undefined ? String(parsed.data.warningThreshold) : null,
      criticalThreshold: parsed.data.criticalThreshold !== undefined ? String(parsed.data.criticalThreshold) : null,
      createdBy: req.user!.id,
    })
    .returning();

  res.status(201).json(created);
}));

router.patch("/kpi-targets/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const parsed = CreateTargetSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }

  const patch: Partial<typeof kpiTargetsTable.$inferInsert> = {};
  if (parsed.data.kpiCode !== undefined) patch.kpiCode = parsed.data.kpiCode;
  if (parsed.data.targetValue !== undefined) patch.targetValue = String(parsed.data.targetValue);
  if (parsed.data.warningThreshold !== undefined) patch.warningThreshold = String(parsed.data.warningThreshold);
  if (parsed.data.criticalThreshold !== undefined) patch.criticalThreshold = String(parsed.data.criticalThreshold);
  if (parsed.data.validFrom !== undefined) patch.validFrom = parsed.data.validFrom;
  if (parsed.data.validTo !== undefined) patch.validTo = parsed.data.validTo;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;

  const [updated] = await db
    .update(kpiTargetsTable)
    .set(patch)
    .where(eq(kpiTargetsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Objectif non trouvé" }); return; }
  res.json(updated);
}));

router.delete("/kpi-targets/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [updated] = await db
    .update(kpiTargetsTable)
    .set({ isActive: false })
    .where(eq(kpiTargetsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Objectif non trouvé" }); return; }
  res.json({ success: true });
}));

export default router;
