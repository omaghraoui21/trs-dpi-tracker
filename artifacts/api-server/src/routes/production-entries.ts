import { Router, IRouter } from "express";
import {
  db,
  productionEntriesTable,
  downtimeEventsTable,
  downtimeCategoriesTable,
  equipmentsTable,
  productsTable,
  usersTable,
  cadencesTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { calculateTrsSafe, shiftDurationMinutes, type TrsError } from "../lib/trs-engine";
import { z } from "zod/v4";
import { isUniqueViolation } from "../lib/db-errors";
import { writeAudit } from "../lib/audit";

const CreateEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (YYYY-MM-DD)"),
  equipmentId: z.string().uuid("equipmentId invalide"),
  productId: z.string().uuid("productId invalide"),
  batchNumber: z.string().min(1, "Numéro de lot requis"),
  shift: z.string().min(1, "Poste requis"),
  shiftStart: z.string().regex(/^\d{2}:\d{2}$/, "shiftStart doit être HH:MM"),
  shiftEnd: z.string().regex(/^\d{2}:\d{2}$/, "shiftEnd doit être HH:MM"),
  quantityProduced: z.number().int().min(0, "Quantité produite ≥ 0"),
  quantityConforming: z.number().int().min(0, "Quantité conforme ≥ 0"),
  quantityRejected: z.number().int().min(0, "Quantité rejetée ≥ 0"),
});

const router: IRouter = Router();

// ─── Next batch-number suggestion ────────────────────────
router.get("/production-entries/next-batch-number", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const yearStart = `${now.getFullYear()}-01-01`;
  const yearEnd   = `${now.getFullYear()}-12-31`;

  const productId = req.query.productId ? String(req.query.productId) : null;
  const baseFilters = [gte(productionEntriesTable.date, yearStart), lte(productionEntriesTable.date, yearEnd)] as ReturnType<typeof eq>[];
  if (productId) baseFilters.push(eq(productionEntriesTable.productId, productId));

  const rows = await db
    .select({ batchNumber: productionEntriesTable.batchNumber })
    .from(productionEntriesTable)
    .where(and(...baseFilters));

  const pattern = new RegExp(`^(?:[A-Z]{1,4})?${yy}(\\d+)$`);
  let maxSeq = 0;
  for (const r of rows) {
    const m = r.batchNumber.match(pattern);
    if (m) { const n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n; }
  }
  const suggestion = `${yy}${String(maxSeq + 1).padStart(3, "0")}`;
  res.json({ suggestion, year: now.getFullYear(), sequence: maxSeq + 1 });
});

// ─── Types ───────────────────────────────────────────────
type EntryRow = {
  id: string;
  date: string;
  equipmentId: string;
  productId: string;
  batchNumber: string;
  shift: string;
  shiftStart: string;
  shiftEnd: string;
  quantityProduced: number;
  quantityConforming: number;
  quantityRejected: number;
  status: string;
  operatorId: string;
  supervisorId: string | null;
  supervisorComment: string | null;
  createdAt: Date;
  updatedAt: Date;
  equipmentName: string | null;
  productName: string | null;
  operatorFirstName: string | null;
  operatorLastName: string | null;
};

type DowntimeRow = {
  id: string;
  entryId: string;
  categoryId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  comment: string | null;
  isDeleted: boolean;
  categoryCode: string | null;
  categoryLabel: string | null;
  categoryIsPlanned: boolean | null;
};

// ─── Batch-capable builder (no N+1) ──────────────────────
async function buildEntriesWithDetails(entryIds: string[]) {
  if (entryIds.length === 0) return [];

  const entries = await db
    .select({
      id: productionEntriesTable.id,
      date: productionEntriesTable.date,
      equipmentId: productionEntriesTable.equipmentId,
      productId: productionEntriesTable.productId,
      batchNumber: productionEntriesTable.batchNumber,
      shift: productionEntriesTable.shift,
      shiftStart: productionEntriesTable.shiftStart,
      shiftEnd: productionEntriesTable.shiftEnd,
      quantityProduced: productionEntriesTable.quantityProduced,
      quantityConforming: productionEntriesTable.quantityConforming,
      quantityRejected: productionEntriesTable.quantityRejected,
      status: productionEntriesTable.status,
      operatorId: productionEntriesTable.operatorId,
      supervisorId: productionEntriesTable.supervisorId,
      supervisorComment: productionEntriesTable.supervisorComment,
      createdAt: productionEntriesTable.createdAt,
      updatedAt: productionEntriesTable.updatedAt,
      equipmentName: equipmentsTable.name,
      productName: productsTable.name,
      operatorFirstName: usersTable.firstName,
      operatorLastName: usersTable.lastName,
    })
    .from(productionEntriesTable)
    .leftJoin(equipmentsTable, eq(productionEntriesTable.equipmentId, equipmentsTable.id))
    .leftJoin(productsTable, eq(productionEntriesTable.productId, productsTable.id))
    .leftJoin(usersTable, eq(productionEntriesTable.operatorId, usersTable.id))
    .where(inArray(productionEntriesTable.id, entryIds));

  if (entries.length === 0) return [];

  const allDowntimes = await db
    .select({
      id: downtimeEventsTable.id,
      entryId: downtimeEventsTable.entryId,
      categoryId: downtimeEventsTable.categoryId,
      startTime: downtimeEventsTable.startTime,
      endTime: downtimeEventsTable.endTime,
      durationMinutes: downtimeEventsTable.durationMinutes,
      comment: downtimeEventsTable.comment,
      isDeleted: downtimeEventsTable.isDeleted,
      categoryCode: downtimeCategoriesTable.code,
      categoryLabel: downtimeCategoriesTable.label,
      categoryIsPlanned: downtimeCategoriesTable.isPlanned,
    })
    .from(downtimeEventsTable)
    .leftJoin(downtimeCategoriesTable, eq(downtimeEventsTable.categoryId, downtimeCategoriesTable.id))
    .where(
      and(
        inArray(downtimeEventsTable.entryId, entryIds),
        eq(downtimeEventsTable.isDeleted, false)
      )
    );

  const pairs = [...new Map(entries.map(e => [`${e.productId}-${e.equipmentId}`, { productId: e.productId, equipmentId: e.equipmentId }])).values()];
  const uniqueProductIds = [...new Set(pairs.map(p => p.productId))];
  const allCadences = uniqueProductIds.length > 0
    ? await db
        .select()
        .from(cadencesTable)
        .where(inArray(cadencesTable.productId, uniqueProductIds))
    : [];

  const downtimesByEntry = new Map<string, DowntimeRow[]>();
  for (const d of allDowntimes) {
    if (!downtimesByEntry.has(d.entryId)) downtimesByEntry.set(d.entryId, []);
    downtimesByEntry.get(d.entryId)!.push(d as DowntimeRow);
  }

  return entries.map((entry: EntryRow) => {
    const downtimeRows = downtimesByEntry.get(entry.id) ?? [];
    const cadence = allCadences.find(
      // Phase 5 limitation: matches by (productId, equipmentId) pair only.
      // Triplet-aware lookup (with presentationId) deferred to Phase 6 when
      // production_entries gains a presentation_id column.
      c => c.productId === entry.productId && c.equipmentId === entry.equipmentId
    );
    const validatedCadence = cadence ? parseFloat(cadence.validatedCadence as unknown as string) : 0;
    const plannedMinutes = downtimeRows.filter(d => d.categoryIsPlanned).reduce((s, d) => s + d.durationMinutes, 0);
    const unplannedMinutes = downtimeRows.filter(d => !d.categoryIsPlanned).reduce((s, d) => s + d.durationMinutes, 0);
    const shiftDuration = shiftDurationMinutes(entry.shiftStart, entry.shiftEnd);

    const trsMetrics = calculateTrsSafe({
      shiftDurationMinutes: shiftDuration,
      plannedDowntimeMinutes: plannedMinutes,
      unplannedDowntimeMinutes: unplannedMinutes,
      quantityProduced: entry.quantityProduced,
      quantityConforming: entry.quantityConforming,
      validatedCadence,
    });

    return {
      id: entry.id,
      date: entry.date,
      equipmentId: entry.equipmentId,
      productId: entry.productId,
      batchNumber: entry.batchNumber,
      shift: entry.shift,
      shiftStart: entry.shiftStart,
      shiftEnd: entry.shiftEnd,
      quantityProduced: entry.quantityProduced,
      quantityConforming: entry.quantityConforming,
      quantityRejected: entry.quantityRejected,
      status: entry.status,
      operatorId: entry.operatorId,
      supervisorId: entry.supervisorId ?? null,
      supervisorComment: entry.supervisorComment ?? null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      equipmentName: entry.equipmentName ?? null,
      productName: entry.productName ?? null,
      operatorName: entry.operatorFirstName && entry.operatorLastName
        ? `${entry.operatorFirstName} ${entry.operatorLastName}`
        : null,
      downtimeEvents: downtimeRows.map(d => ({
        id: d.id,
        entryId: d.entryId,
        categoryId: d.categoryId,
        categoryCode: d.categoryCode ?? null,
        categoryLabel: d.categoryLabel ?? null,
        startTime: d.startTime,
        endTime: d.endTime,
        durationMinutes: d.durationMinutes,
        comment: d.comment ?? null,
        isDeleted: d.isDeleted,
      })),
      trsMetrics: trsMetrics.metrics,
      trsError: trsMetrics.error,
    };
  });
}

async function buildEntryWithDetails(entryId: string) {
  const results = await buildEntriesWithDetails([entryId]);
  return results[0] ?? null;
}

// ─── Routes ──────────────────────────────────────────────

router.get("/production-entries", requireAuth, async (req, res): Promise<void> => {
  try {
    const filters: ReturnType<typeof and>[] = [];
    const equipmentId = String(req.query.equipmentId ?? "");
    const productId = String(req.query.productId ?? "");
    const dateFrom = String(req.query.dateFrom ?? "");
    const dateTo = String(req.query.dateTo ?? "");
    const status = String(req.query.status ?? "");
    const shift = String(req.query.shift ?? "");

    if (equipmentId) filters.push(eq(productionEntriesTable.equipmentId, equipmentId));
    if (productId) filters.push(eq(productionEntriesTable.productId, productId));
    if (dateFrom) filters.push(gte(productionEntriesTable.date, dateFrom));
    if (dateTo) filters.push(lte(productionEntriesTable.date, dateTo));
    if (status) {
      const statusValues = status.split(",").map(s => s.trim()).filter(Boolean) as ("draft" | "submitted" | "validated" | "rejected")[];
      if (statusValues.length === 1) {
        filters.push(eq(productionEntriesTable.status, statusValues[0]));
      } else if (statusValues.length > 1) {
        filters.push(inArray(productionEntriesTable.status, statusValues));
      }
    }
    if (shift) filters.push(eq(productionEntriesTable.shift, shift));

    if (req.user!.role === "operator") {
      filters.push(eq(productionEntriesTable.operatorId, req.user!.id));
    }

    const entries = await db
      .select({ id: productionEntriesTable.id })
      .from(productionEntriesTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(productionEntriesTable.date, productionEntriesTable.createdAt)
      .limit(500);

    const ids = entries.map(e => e.id);
    if (entries.length === 500) {
      res.set("X-Has-More", "true");
    }
    const results = await buildEntriesWithDetails(ids);
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "List production entries error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/production-entries", requireAuth, async (req, res): Promise<void> => {
  try {
    const parsed = CreateEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
      return;
    }
    const { date, equipmentId, productId, batchNumber, shift, shiftStart, shiftEnd,
      quantityProduced, quantityConforming, quantityRejected } = parsed.data;

    if (quantityConforming + quantityRejected > quantityProduced) {
      res.status(400).json({ error: "Conformes + rejetées ne peut pas dépasser la quantité produite" });
      return;
    }

    const [entry] = await db.insert(productionEntriesTable).values({
      date,
      equipmentId,
      productId,
      batchNumber,
      shift,
      shiftStart,
      shiftEnd,
      quantityProduced,
      quantityConforming,
      quantityRejected,
      operatorId: req.user!.id,
      status: "draft",
    }).returning();
    const full = await buildEntryWithDetails(entry.id);
    writeAudit({ userId: req.user!.id, tableName: "production_entries", recordId: entry.id,
      action: "create", newValues: { batchNumber, date, equipmentId, productId, shift } });
    res.status(201).json(full);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Un lot avec ce numéro existe déjà pour cet équipement et cette date" });
      return;
    }
    req.log.error({ err }, "Create production entry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/production-entries/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const entryId = req.params["id"] as string;
    const full = await buildEntryWithDetails(entryId);
    if (!full) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    if (req.user!.role === "operator" && full.operatorId !== req.user!.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Get production entry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/production-entries/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const entryId = req.params["id"] as string;
    const [existing] = await db.select().from(productionEntriesTable).where(eq(productionEntriesTable.id, entryId));
    if (!existing) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    if (req.user!.role === "operator") {
      if (existing.operatorId !== req.user!.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      if (existing.status !== "draft") {
        res.status(403).json({ error: "Cannot edit a submitted entry" });
        return;
      }
    }
    const { date, equipmentId, productId, batchNumber, shift, shiftStart, shiftEnd,
      quantityProduced, quantityConforming, quantityRejected, status } = req.body as Record<string, unknown>;
    const updatePayload: Record<string, unknown> = {};
    if (date !== undefined) updatePayload.date = String(date);
    if (equipmentId !== undefined) updatePayload.equipmentId = String(equipmentId);
    if (productId !== undefined) updatePayload.productId = String(productId);
    if (batchNumber !== undefined) updatePayload.batchNumber = String(batchNumber);
    if (shift !== undefined) updatePayload.shift = String(shift);
    if (shiftStart !== undefined) updatePayload.shiftStart = String(shiftStart);
    if (shiftEnd !== undefined) updatePayload.shiftEnd = String(shiftEnd);
    if (quantityProduced !== undefined) updatePayload.quantityProduced = Number(quantityProduced);
    if (quantityConforming !== undefined) updatePayload.quantityConforming = Number(quantityConforming);
    if (quantityRejected !== undefined) updatePayload.quantityRejected = Number(quantityRejected);
    if (status !== undefined && req.user!.role === "admin") {
      const allowed = ["draft","submitted","validated","rejected"];
      if (!allowed.includes(String(status))) { res.status(400).json({ error: "Statut invalide" }); return; }
      updatePayload.status = String(status);
    }

    await db.update(productionEntriesTable).set(updatePayload).where(eq(productionEntriesTable.id, entryId));
    const full = await buildEntryWithDetails(entryId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Update production entry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/production-entries/:id/submit", requireAuth, async (req, res): Promise<void> => {
  try {
    const entryId = req.params["id"] as string;
    const [existing] = await db.select().from(productionEntriesTable).where(eq(productionEntriesTable.id, entryId));
    if (!existing) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    if (req.user!.role === "operator" && existing.operatorId !== req.user!.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (existing.status !== "draft") {
      res.status(400).json({ error: "Only draft entries can be submitted" });
      return;
    }
    await db.update(productionEntriesTable)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(productionEntriesTable.id, entryId));
    const full = await buildEntryWithDetails(entryId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Submit production entry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/production-entries/:id/validate", requireAuth, requireRole("supervisor", "admin"), async (req, res): Promise<void> => {
  try {
    const entryId = req.params["id"] as string;
    const { action, comment } = req.body as { action: "validate" | "reject"; comment?: string };
    if (!action || !["validate", "reject"].includes(action)) {
      res.status(400).json({ error: "Action invalide" });
      return;
    }
    const [existing] = await db.select().from(productionEntriesTable).where(eq(productionEntriesTable.id, entryId));
    if (!existing) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    if (existing.status !== "submitted") {
      res.status(400).json({ error: "Only submitted entries can be validated or rejected" });
      return;
    }
    const newStatus = action === "validate" ? "validated" : "rejected";
    await db.update(productionEntriesTable).set({
      status: newStatus,
      supervisorId: req.user!.id,
      supervisorComment: comment ?? null,
      validatedAt: new Date(),
    }).where(eq(productionEntriesTable.id, entryId));
    writeAudit({ userId: req.user!.id, tableName: "production_entries", recordId: entryId,
      action: action === "validate" ? "validate" : "reject",
      oldValues: { status: existing.status },
      newValues: { status: newStatus },
      reason: comment ?? null });
    const full = await buildEntryWithDetails(entryId);
    res.json(full);
  } catch (err) {
    req.log.error({ err }, "Validate production entry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Admin: suppression définitive d'un lot ──────────────────────────────────
router.delete("/production-entries/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const entryId = req.params["id"] as string;
    const [existing] = await db.select().from(productionEntriesTable).where(eq(productionEntriesTable.id, entryId));
    if (!existing) { res.status(404).json({ error: "Lot introuvable" }); return; }
    // Supprimer les arrêts liés et le lot dans une transaction atomique
    await db.transaction(async (tx) => {
      await tx.delete(downtimeEventsTable).where(eq(downtimeEventsTable.entryId, entryId));
      await tx.delete(productionEntriesTable).where(eq(productionEntriesTable.id, entryId));
    });
    writeAudit({ userId: req.user!.id, tableName: "production_entries", recordId: entryId,
      action: "delete", oldValues: { batchNumber: existing.batchNumber, date: existing.date, status: existing.status } });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete production entry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
