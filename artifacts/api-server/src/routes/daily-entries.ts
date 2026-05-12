import { Router, type IRouter } from "express";
import { db, dailyEntriesTable, equipmentsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { eq, and, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const CreateDailyEntrySchema = z.object({
  equipmentId: z.string().uuid(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD requis"),
  tOpeningMin: z.number().int().min(0).max(1440),
  pauseMin: z.number().int().min(0).max(1440).default(0),
  chsgMin: z.number().int().min(0).max(1440).default(0),
  aprMin: z.number().int().min(0).max(1440).default(0),
  mqchMin: z.number().int().min(0).max(1440).default(0),
  notes: z.string().max(2000).optional().nullable(),
});

const UpdateDailyEntrySchema = z.object({
  tOpeningMin: z.number().int().min(0).max(1440).optional(),
  pauseMin: z.number().int().min(0).max(1440).optional(),
  chsgMin: z.number().int().min(0).max(1440).optional(),
  aprMin: z.number().int().min(0).max(1440).optional(),
  mqchMin: z.number().int().min(0).max(1440).optional(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(["draft", "validated"]).optional(),
});

/**
 * Computed OEE fields for a daily entry row.
 * tT = 1440 (constant)
 * tAP = pause + CHSG + APR + MQCH
 * tR  = tO − tAP
 */
function computeDailyOee(row: {
  tOpeningMin: number;
  pauseMin: number;
  chsgMin: number;
  aprMin: number;
  mqchMin: number;
}) {
  const tT = 1440;
  const tO = row.tOpeningMin;
  const fermetureMin = tT - tO;
  const tAP = row.pauseMin + row.chsgMin + row.aprMin + row.mqchMin;
  const tR = Math.max(0, tO - tAP);
  return { tT, tO, fermetureMin, tAP, tR };
}

/**
 * GET /api/daily-entries
 * Query: equipmentId, year, month, dateFrom, dateTo
 */
router.get("/daily-entries", requireAuth, asyncHandler(async (req, res) => {
  const { equipmentId, year, month, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const filters: ReturnType<typeof eq>[] = [];

  if (equipmentId) {
    filters.push(eq(dailyEntriesTable.equipmentId, equipmentId) as ReturnType<typeof eq>);
  }
  if (dateFrom) {
    filters.push(gte(dailyEntriesTable.entryDate, dateFrom) as ReturnType<typeof eq>);
  }
  if (dateTo) {
    filters.push(lte(dailyEntriesTable.entryDate, dateTo) as ReturnType<typeof eq>);
  }
  if (!dateFrom && !dateTo && year) {
    const y = parseInt(year);
    const m = month ? parseInt(month) : null;
    if (m) {
      const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);
      filters.push(gte(dailyEntriesTable.entryDate, firstDay) as ReturnType<typeof eq>);
      filters.push(lte(dailyEntriesTable.entryDate, lastDay) as ReturnType<typeof eq>);
    } else {
      filters.push(gte(dailyEntriesTable.entryDate, `${y}-01-01`) as ReturnType<typeof eq>);
      filters.push(lte(dailyEntriesTable.entryDate, `${y}-12-31`) as ReturnType<typeof eq>);
    }
  }

  const rows = await db
    .select({
      id: dailyEntriesTable.id,
      siteId: dailyEntriesTable.siteId,
      equipmentId: dailyEntriesTable.equipmentId,
      equipmentName: equipmentsTable.name,
      entryDate: dailyEntriesTable.entryDate,
      tOpeningMin: dailyEntriesTable.tOpeningMin,
      pauseMin: dailyEntriesTable.pauseMin,
      chsgMin: dailyEntriesTable.chsgMin,
      aprMin: dailyEntriesTable.aprMin,
      mqchMin: dailyEntriesTable.mqchMin,
      notes: dailyEntriesTable.notes,
      status: dailyEntriesTable.status,
      createdById: dailyEntriesTable.createdById,
      createdByName: usersTable.fullName,
      validatedById: dailyEntriesTable.validatedById,
      validatedAt: dailyEntriesTable.validatedAt,
      createdAt: dailyEntriesTable.createdAt,
      updatedAt: dailyEntriesTable.updatedAt,
    })
    .from(dailyEntriesTable)
    .leftJoin(equipmentsTable, eq(dailyEntriesTable.equipmentId, equipmentsTable.id))
    .leftJoin(usersTable, eq(dailyEntriesTable.createdById, usersTable.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(dailyEntriesTable.entryDate);

  res.json(rows.map((r) => ({ ...r, ...computeDailyOee(r) })));
}));

/**
 * GET /api/daily-entries/monthly-summary
 * Returns monthly aggregated OEE base (Σ tO, Σ tAP, Σ tR) for an equipment × month.
 * This route MUST be registered before /:id to avoid route shadowing.
 * Query: equipmentId (required), year (required), month (required)
 */
router.get("/daily-entries/monthly-summary", requireAuth, asyncHandler(async (req, res) => {
  const { equipmentId, year, month } = req.query as Record<string, string | undefined>;

  if (!equipmentId || !year || !month) {
    res.status(400).json({ error: "equipmentId, year et month sont requis" });
    return;
  }

  const y = parseInt(year);
  const m = parseInt(month);
  const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: dailyEntriesTable.id,
      entryDate: dailyEntriesTable.entryDate,
      tOpeningMin: dailyEntriesTable.tOpeningMin,
      pauseMin: dailyEntriesTable.pauseMin,
      chsgMin: dailyEntriesTable.chsgMin,
      aprMin: dailyEntriesTable.aprMin,
      mqchMin: dailyEntriesTable.mqchMin,
      status: dailyEntriesTable.status,
    })
    .from(dailyEntriesTable)
    .where(
      and(
        eq(dailyEntriesTable.equipmentId, equipmentId),
        gte(dailyEntriesTable.entryDate, firstDay),
        lte(dailyEntriesTable.entryDate, lastDay)
      )
    )
    .orderBy(dailyEntriesTable.entryDate);

  let totalTO = 0;
  let totalTAP = 0;
  let totalTR = 0;
  let totalFermeture = 0;
  let daysWithTO = 0;
  let daysClosure = 0;
  let daysNoProduction = 0;

  const days = rows.map((r) => {
    const oee = computeDailyOee(r);
    totalTO += oee.tO;
    totalTAP += oee.tAP;
    totalTR += oee.tR;
    totalFermeture += oee.fermetureMin;
    if (oee.tO === 0) daysClosure++;
    else daysWithTO++;
    if (oee.tR === 0 && oee.tO > 0) daysNoProduction++;
    return { ...r, ...oee };
  });

  const daysInMonth = new Date(y, m, 0).getDate();

  res.json({
    year: y,
    month: m,
    equipmentId,
    daysInMonth,
    daysWithEntries: rows.length,
    daysWithTO,
    daysClosure,
    daysNoProduction,
    totalTT: daysInMonth * 1440,
    totalTO,
    totalFermeture,
    totalTAP,
    totalTR,
    days,
  });
}));

/**
 * GET /api/daily-entries/:id
 */
router.get("/daily-entries/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rows = await db
    .select({
      id: dailyEntriesTable.id,
      siteId: dailyEntriesTable.siteId,
      equipmentId: dailyEntriesTable.equipmentId,
      equipmentName: equipmentsTable.name,
      entryDate: dailyEntriesTable.entryDate,
      tOpeningMin: dailyEntriesTable.tOpeningMin,
      pauseMin: dailyEntriesTable.pauseMin,
      chsgMin: dailyEntriesTable.chsgMin,
      aprMin: dailyEntriesTable.aprMin,
      mqchMin: dailyEntriesTable.mqchMin,
      notes: dailyEntriesTable.notes,
      status: dailyEntriesTable.status,
      createdById: dailyEntriesTable.createdById,
      createdByName: usersTable.fullName,
      validatedById: dailyEntriesTable.validatedById,
      validatedAt: dailyEntriesTable.validatedAt,
      createdAt: dailyEntriesTable.createdAt,
      updatedAt: dailyEntriesTable.updatedAt,
    })
    .from(dailyEntriesTable)
    .leftJoin(equipmentsTable, eq(dailyEntriesTable.equipmentId, equipmentsTable.id))
    .leftJoin(usersTable, eq(dailyEntriesTable.createdById, usersTable.id))
    .where(eq(dailyEntriesTable.id, String(id)));

  if (rows.length === 0) {
    res.status(404).json({ error: "Fiche journalière non trouvée" });
    return;
  }

  const r = rows[0];
  res.json({ ...r, ...computeDailyOee(r) });
}));

/**
 * POST /api/daily-entries
 * Crée une nouvelle fiche journalière.
 * Contrainte : 1 seule fiche par équipement par jour.
 */
router.post("/daily-entries", requireAuth, asyncHandler(async (req, res) => {
  const parsed = CreateDailyEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }

  const data = parsed.data;
  const userId = (req as any).user?.id;

  const existing = await db
    .select({ id: dailyEntriesTable.id })
    .from(dailyEntriesTable)
    .where(
      and(
        eq(dailyEntriesTable.equipmentId, data.equipmentId),
        eq(dailyEntriesTable.entryDate, data.entryDate)
      )
    );

  if (existing.length > 0) {
    res.status(409).json({
      error: "Une fiche journalière existe déjà pour cet équipement à cette date",
      existingId: existing[0].id,
    });
    return;
  }

  const [created] = await db
    .insert(dailyEntriesTable)
    .values({
      equipmentId: data.equipmentId,
      entryDate: data.entryDate,
      tOpeningMin: data.tOpeningMin,
      pauseMin: data.pauseMin ?? 0,
      chsgMin: data.chsgMin ?? 0,
      aprMin: data.aprMin ?? 0,
      mqchMin: data.mqchMin ?? 0,
      notes: data.notes ?? null,
      createdById: userId,
    })
    .returning();

  res.status(201).json({ ...created, ...computeDailyOee(created) });
}));

/**
 * PATCH /api/daily-entries/:id
 * Mise à jour partielle. Seul le créateur, un superviseur ou un admin peut modifier.
 * Un superviseur peut également valider (status → validated).
 */
router.patch("/daily-entries/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = (req as any).user?.id;
  const userRole = (req as any).user?.role;

  const existing = await db
    .select()
    .from(dailyEntriesTable)
    .where(eq(dailyEntriesTable.id, String(id)));

  if (existing.length === 0) {
    res.status(404).json({ error: "Fiche journalière non trouvée" });
    return;
  }

  const entry = existing[0];
  const isOwner = entry.createdById === userId;
  const isSupervisorOrAdmin = userRole === "supervisor" || userRole === "admin";

  if (!isOwner && !isSupervisorOrAdmin) {
    res.status(403).json({ error: "Non autorisé à modifier cette fiche" });
    return;
  }
  if (entry.status === "validated" && !isSupervisorOrAdmin) {
    res.status(403).json({ error: "Cette fiche est validée — seul un superviseur ou admin peut la modifier" });
    return;
  }

  const parsed = UpdateDailyEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }

  if (parsed.data.status === "validated" && !isSupervisorOrAdmin) {
    res.status(403).json({ error: "Seul un superviseur ou admin peut valider une fiche" });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data };
  if (updates.status === "validated") {
    updates.validatedById = userId;
    updates.validatedAt = new Date();
  }

  const [updated] = await db
    .update(dailyEntriesTable)
    .set(updates as Partial<typeof dailyEntriesTable.$inferInsert>)
    .where(eq(dailyEntriesTable.id, String(id)))
    .returning();

  res.json({ ...updated, ...computeDailyOee(updated) });
}));

/**
 * DELETE /api/daily-entries/:id
 * Suppression — superviseur/admin, ou propriétaire si statut draft.
 */
router.delete("/daily-entries/:id", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = (req as any).user?.id;
  const userRole = (req as any).user?.role;

  const existing = await db
    .select()
    .from(dailyEntriesTable)
    .where(eq(dailyEntriesTable.id, String(id)));

  if (existing.length === 0) {
    res.status(404).json({ error: "Fiche journalière non trouvée" });
    return;
  }

  const entry = existing[0];
  const isOwner = entry.createdById === userId;
  const isSupervisorOrAdmin = userRole === "supervisor" || userRole === "admin";

  if (!isOwner && !isSupervisorOrAdmin) {
    res.status(403).json({ error: "Non autorisé à supprimer cette fiche" });
    return;
  }
  if (entry.status === "validated" && !isSupervisorOrAdmin) {
    res.status(403).json({ error: "Impossible de supprimer une fiche validée" });
    return;
  }

  await db.delete(dailyEntriesTable).where(eq(dailyEntriesTable.id, String(id)));
  res.status(204).send();
}));

export default router;
