import { Router, IRouter } from "express";
import {
  db,
  productionEntriesTable,
  downtimeEventsTable,
  downtimeCategoriesTable,
  equipmentsTable,
  cadencesTable,
  dailyEntriesTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache5 } from "../lib/cache-control";
import {
  GetDashboardSummaryQueryParams,
  GetDailyTrsQueryParams,
  GetDowntimeParetoQueryParams,
  GetEquipmentComparisonQueryParams,
  GetMonthlyKpisQueryParams,
} from "@workspace/api-zod";
import {
  calculateTrs,
  calculateMonthlyTrs,
  calculateMonthlyTrsV2,
  shiftDurationMinutes,
  type DailyBaseRow,
  type ProdMetricsRow,
} from "../lib/trs-engine";

const router: IRouter = Router();

function getMonthDateRange(month: number, year: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  return { from, to };
}

// ─── Batch metadata fetch: 2 queries instead of 2N ───────────────────────────
// Fetches all downtime events + all cadences for a given set of entries
// in exactly 2 SQL queries total, regardless of how many entries there are.
async function batchFetchMetadata(
  entries: Array<{ id: string; equipmentId: string; productId: string }>
) {
  if (entries.length === 0) {
    return {
      downtimesByEntry: new Map<string, Array<{ durationMinutes: number; isPlanned: boolean | null }>>(),
      cadencesByPair: new Map<string, number>(),
    };
  }

  const entryIds = entries.map(e => e.id);
  const uniqueEquipmentIds = [...new Set(entries.map(e => e.equipmentId))];

  // Query 1: all downtime events for all entry IDs
  const allDowntimes = await db
    .select({
      entryId: downtimeEventsTable.entryId,
      durationMinutes: downtimeEventsTable.durationMinutes,
      isPlanned: downtimeCategoriesTable.isPlanned,
    })
    .from(downtimeEventsTable)
    .leftJoin(downtimeCategoriesTable, eq(downtimeEventsTable.categoryId, downtimeCategoriesTable.id))
    .where(and(inArray(downtimeEventsTable.entryId, entryIds), eq(downtimeEventsTable.isDeleted, false)));

  const downtimesByEntry = new Map<string, Array<{ durationMinutes: number; isPlanned: boolean | null }>>();
  for (const dt of allDowntimes) {
    const arr = downtimesByEntry.get(dt.entryId) ?? [];
    arr.push({ durationMinutes: dt.durationMinutes, isPlanned: dt.isPlanned });
    downtimesByEntry.set(dt.entryId, arr);
  }

  // Query 2: all cadences for all equipments present in the entries
  const allCadences = await db
    .select({
      equipmentId: cadencesTable.equipmentId,
      productId: cadencesTable.productId,
      validatedCadence: cadencesTable.validatedCadence,
    })
    .from(cadencesTable)
    .where(inArray(cadencesTable.equipmentId, uniqueEquipmentIds));

  const cadencesByPair = new Map<string, number>();
  for (const c of allCadences) {
    cadencesByPair.set(
      `${c.equipmentId}:${c.productId}`,
      parseFloat(c.validatedCadence as unknown as string)
    );
  }

  return { downtimesByEntry, cadencesByPair };
}

function computeEntryMetrics(
  entry: { id: string; equipmentId: string; productId: string; shiftStart: string; shiftEnd: string; quantityProduced: number; quantityConforming: number },
  downtimesByEntry: Map<string, Array<{ durationMinutes: number; isPlanned: boolean | null }>>,
  cadencesByPair: Map<string, number>
) {
  const downtimes = downtimesByEntry.get(entry.id) ?? [];
  const validatedCadence = cadencesByPair.get(`${entry.equipmentId}:${entry.productId}`) ?? 0;
  const plannedMinutes = downtimes.filter(d => d.isPlanned).reduce((s, d) => s + d.durationMinutes, 0);
  const unplannedMinutes = downtimes.filter(d => !d.isPlanned).reduce((s, d) => s + d.durationMinutes, 0);
  const shiftDuration = shiftDurationMinutes(entry.shiftStart, entry.shiftEnd);
  return calculateTrs({
    shiftDurationMinutes: shiftDuration,
    plannedDowntimeMinutes: plannedMinutes,
    unplannedDowntimeMinutes: unplannedMinutes,
    quantityProduced: entry.quantityProduced,
    quantityConforming: entry.quantityConforming,
    validatedCadence,
  });
}

async function getEntriesWithMetrics(from: string, to: string, equipmentId?: string) {
  const filters = [
    gte(productionEntriesTable.date, from),
    lte(productionEntriesTable.date, to),
    or(eq(productionEntriesTable.status, "submitted"), eq(productionEntriesTable.status, "validated"))!,
  ];
  if (equipmentId) filters.push(eq(productionEntriesTable.equipmentId, equipmentId));

  const entries = await db.select().from(productionEntriesTable).where(and(...filters));
  if (entries.length === 0) return [];

  const { downtimesByEntry, cadencesByPair } = await batchFetchMetadata(entries);
  return entries.map(entry => ({
    entry,
    metrics: computeEntryMetrics(entry, downtimesByEntry, cadencesByPair),
  }));
}

/**
 * Fetch daily_entries base rows for a period + equipment.
 * Returns DailyBaseRow[] with computed tAP and tR.
 * Returns empty array if no daily entries exist (triggers V1 fallback).
 */
async function getDailyBase(from: string, to: string, equipmentId: string): Promise<DailyBaseRow[]> {
  const rows = await db
    .select({
      tOpeningMin: dailyEntriesTable.tOpeningMin,
      pauseMin: dailyEntriesTable.pauseMin,
      chsgMin: dailyEntriesTable.chsgMin,
      aprMin: dailyEntriesTable.aprMin,
      mqchMin: dailyEntriesTable.mqchMin,
    })
    .from(dailyEntriesTable)
    .where(
      and(
        eq(dailyEntriesTable.equipmentId, equipmentId),
        gte(dailyEntriesTable.entryDate, from),
        lte(dailyEntriesTable.entryDate, to)
      )
    );

  return rows.map((r) => {
    const tAP = r.pauseMin + r.chsgMin + r.aprMin + r.mqchMin;
    const tR = Math.max(0, r.tOpeningMin - tAP);
    return { tO: r.tOpeningMin, tAP, tR };
  });
}

/**
 * Unified monthly TRS computation.
 *
 * If equipmentId is provided AND daily_entries exist for the period:
 *   → V2: uses daily_entries as tR/tO denominator (Excel-faithful)
 * Otherwise:
 *   → V1: uses production entries shift durations (legacy)
 *
 * Returns the same shape as calculateMonthlyTrs / calculateMonthlyTrsV2
 * plus a `source` field ("daily" | "production") to indicate which path was taken.
 */
async function getMonthlyTrsResult(
  from: string,
  to: string,
  equipmentId: string | undefined,
  trsObjective: number
) {
  const [entriesWithMetrics, dailyBase] = await Promise.all([
    getEntriesWithMetrics(from, to, equipmentId),
    equipmentId ? getDailyBase(from, to, equipmentId) : Promise.resolve([] as DailyBaseRow[]),
  ]);

  const prodMetrics = entriesWithMetrics.map((e) => e.metrics);

  if (dailyBase.length > 0) {
    return {
      result: calculateMonthlyTrsV2(dailyBase, prodMetrics, trsObjective),
      entriesWithMetrics,
    };
  }

  return {
    result: calculateMonthlyTrs({ entries: prodMetrics, trsObjective }),
    entriesWithMetrics,
  };
}

router.get("/dashboard/summary", requireAuth, cache5, asyncHandler(async (req, res) => {
  const query = GetDashboardSummaryQueryParams.safeParse(req.query);
  const now = new Date();
  const month = (query.success && query.data.month) ? query.data.month : now.getMonth() + 1;
  const year = (query.success && query.data.year) ? query.data.year : now.getFullYear();
  const equipmentId = query.success ? query.data.equipmentId : undefined;

  const { from, to } = getMonthDateRange(month, year);

  const allFilters = [
    gte(productionEntriesTable.date, from),
    lte(productionEntriesTable.date, to),
  ];
  if (equipmentId) allFilters.push(eq(productionEntriesTable.equipmentId, equipmentId));

  const allEntries = await db
    .select({
      status: productionEntriesTable.status,
      quantityProduced: productionEntriesTable.quantityProduced,
      quantityConforming: productionEntriesTable.quantityConforming,
      quantityRejected: productionEntriesTable.quantityRejected,
      date: productionEntriesTable.date,
    })
    .from(productionEntriesTable)
    .where(and(...allFilters));

  const pendingValidations = allEntries.filter(e => e.status === "submitted").length;
  const validatedEntries = allEntries.filter(e => e.status === "validated").length;
  const rejectedEntries = allEntries.filter(e => e.status === "rejected").length;
  const closedEntries = allEntries.filter(e => e.status === "submitted" || e.status === "validated");
  const productionDays = new Set(closedEntries.map(e => e.date)).size;

  const { result: monthlyData, entriesWithMetrics } = await getMonthlyTrsResult(from, to, equipmentId, 75);

  const totalQuantityProduced = closedEntries.reduce((s, e) => s + e.quantityProduced, 0);
  const totalQuantityConforming = closedEntries.reduce((s, e) => s + e.quantityConforming, 0);
  const totalRejected = closedEntries.reduce((s, e) => s + e.quantityRejected, 0);

  let trsObjective = 75;
  if (equipmentId) {
    const [eq_] = await db.select().from(equipmentsTable).where(eq(equipmentsTable.id, equipmentId));
    if (eq_) trsObjective = parseFloat(eq_.trsObjective as unknown as string);
  }

  res.json({
    currentMonthTrs: monthlyData.trs !== null ? monthlyData.trs * 100 : null,
    currentMonthDO: monthlyData.DO !== null ? monthlyData.DO * 100 : null,
    currentMonthTP: monthlyData.TP !== null ? monthlyData.TP * 100 : null,
    currentMonthTQ: monthlyData.TQ !== null ? monthlyData.TQ * 100 : null,
    currentMonthTRG: monthlyData.TRG !== null ? monthlyData.TRG * 100 : null,
    trsObjective,
    entriesThisMonth: allEntries.length,
    pendingValidations,
    validatedEntries,
    rejectedEntries,
    productionDays,
    offDays: 0,
    totalQuantityProduced,
    totalQuantityConforming,
    totalRejected,
  });
}));

router.get("/dashboard/daily-trs", requireAuth, asyncHandler(async (req, res) => {
  const query = GetDailyTrsQueryParams.safeParse(req.query);
  if (!query.success || !query.data.month || !query.data.year) {
    res.status(400).json({ error: "month and year are required" });
    return;
  }
  const { month, year, equipmentId } = query.data;
  const { from, to } = getMonthDateRange(month, year);

  const filters = [
    gte(productionEntriesTable.date, from),
    lte(productionEntriesTable.date, to),
    or(eq(productionEntriesTable.status, "submitted"), eq(productionEntriesTable.status, "validated"))!,
  ];
  if (equipmentId) filters.push(eq(productionEntriesTable.equipmentId, equipmentId));

  const entries = await db.select().from(productionEntriesTable).where(and(...filters));

  let trsObjective = 75;
  let equipmentName: string | null = null;
  if (equipmentId) {
    const [eq_] = await db.select().from(equipmentsTable).where(eq(equipmentsTable.id, equipmentId));
    if (eq_) {
      trsObjective = parseFloat(eq_.trsObjective as unknown as string);
      equipmentName = eq_.name;
    }
  }

  // Batch-fetch all downtimes + cadences in 2 queries
  const { downtimesByEntry, cadencesByPair } = await batchFetchMetadata(entries);

  // Group by date (in memory — no more per-entry queries)
  const byDate = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayEntries = byDate.get(dateStr) ?? [];

    if (dayEntries.length === 0) {
      result.push({
        date: dateStr,
        trs: null,
        trsObjective,
        DO: null,
        TP: null,
        TQ: null,
        isOffDay: false,
        hasProduction: false,
        equipmentId: equipmentId ?? null,
        equipmentName,
      });
      continue;
    }

    const dayMetrics = dayEntries.map(entry =>
      computeEntryMetrics(entry, downtimesByEntry, cadencesByPair)
    );
    const combined = calculateMonthlyTrs({ entries: dayMetrics, trsObjective });

    result.push({
      date: dateStr,
      trs: combined.trs !== null ? combined.trs * 100 : null,
      trsObjective,
      DO: combined.DO !== null ? combined.DO * 100 : null,
      TP: combined.TP !== null ? combined.TP * 100 : null,
      TQ: combined.TQ !== null ? combined.TQ * 100 : null,
      TRG: combined.TRG !== null ? combined.TRG * 100 : null,
      isOffDay: false,
      hasProduction: true,
      equipmentId: equipmentId ?? null,
      equipmentName,
    });
  }

  res.json(result);
}));

router.get("/dashboard/downtime-pareto", requireAuth, asyncHandler(async (req, res) => {
  const query = GetDowntimeParetoQueryParams.safeParse(req.query);
  if (!query.success || !query.data.month || !query.data.year) {
    res.status(400).json({ error: "month and year are required" });
    return;
  }
  const { month, year, equipmentId, groupBy = "detail", isPlanned: filterPlanned } = query.data;
  const { from, to } = getMonthDateRange(month, year);

  const entryFilters = [
    gte(productionEntriesTable.date, from),
    lte(productionEntriesTable.date, to),
    or(eq(productionEntriesTable.status, "submitted"), eq(productionEntriesTable.status, "validated"))!,
  ];
  if (equipmentId) entryFilters.push(eq(productionEntriesTable.equipmentId, equipmentId));

  const entries = await db
    .select({ id: productionEntriesTable.id })
    .from(productionEntriesTable)
    .where(and(...entryFilters));

  if (entries.length === 0) {
    res.json([]);
    return;
  }

  const entryIds = entries.map(e => e.id);
  const eventRows = await db
    .select({
      durationMinutes: downtimeEventsTable.durationMinutes,
      categoryCode: downtimeCategoriesTable.code,
      categoryLabel: downtimeCategoriesTable.label,
      famille: downtimeCategoriesTable.famille,
      isPlanned: downtimeCategoriesTable.isPlanned,
    })
    .from(downtimeEventsTable)
    .leftJoin(downtimeCategoriesTable, eq(downtimeEventsTable.categoryId, downtimeCategoriesTable.id))
    .where(and(inArray(downtimeEventsTable.entryId, entryIds), eq(downtimeEventsTable.isDeleted, false)));

  const events = filterPlanned !== undefined
    ? eventRows.filter(e => (e.isPlanned ?? false) === filterPlanned)
    : eventRows;

  type GroupEntry = { totalMinutes: number; occurrences: number; isPlanned: boolean; label: string; famille: string | null };
  const byGroup = new Map<string, GroupEntry>();
  let totalMinutes = 0;

  for (const e of events) {
    let key: string;
    let label: string;
    let isPlanned: boolean;
    let famille: string | null;

    if (groupBy === "famille") {
      key = e.famille ?? "Non classifié";
      label = key;
      isPlanned = e.isPlanned ?? false;
      famille = key;
    } else if (groupBy === "type") {
      isPlanned = e.isPlanned ?? false;
      key = isPlanned ? "Planifié" : "Non planifié";
      label = key;
      famille = e.famille ?? null;
    } else {
      key = e.categoryCode ?? "UNKNOWN";
      label = e.categoryLabel ?? key;
      isPlanned = e.isPlanned ?? false;
      famille = e.famille ?? null;
    }

    const existing = byGroup.get(key) ?? { totalMinutes: 0, occurrences: 0, isPlanned, label, famille };
    existing.totalMinutes += e.durationMinutes;
    existing.occurrences += 1;
    byGroup.set(key, existing);
    totalMinutes += e.durationMinutes;
  }

  const sorted = Array.from(byGroup.entries()).sort((a, b) => b[1].totalMinutes - a[1].totalMinutes);
  let cumulative = 0;
  const result = sorted.map(([code, data]) => {
    const pct = totalMinutes > 0 ? (data.totalMinutes / totalMinutes) * 100 : 0;
    cumulative += pct;
    return {
      categoryCode: code,
      categoryLabel: data.label,
      famille: data.famille,
      totalMinutes: data.totalMinutes,
      occurrences: data.occurrences,
      percentage: Math.round(pct * 100) / 100,
      cumulativePercentage: Math.round(cumulative * 100) / 100,
      isPlanned: data.isPlanned,
    };
  });

  res.json(result);
}));

router.get("/dashboard/equipment-comparison", requireAuth, asyncHandler(async (req, res) => {
  const query = GetEquipmentComparisonQueryParams.safeParse(req.query);
  if (!query.success || !query.data.month || !query.data.year) {
    res.status(400).json({ error: "month and year are required" });
    return;
  }
  const { month, year } = query.data;
  const { from, to } = getMonthDateRange(month, year);

  const allEquipments = await db.select().from(equipmentsTable).where(eq(equipmentsTable.isActive, true));
  const result = await Promise.all(allEquipments.map(async (equip) => {
    const trsObj = parseFloat(equip.trsObjective as unknown as string);
    const { result: monthly, entriesWithMetrics } = await getMonthlyTrsResult(from, to, equip.id, trsObj);
    const productionDays = new Set(entriesWithMetrics.map(e => e.entry.date)).size;
    return {
      equipmentId: equip.id,
      equipmentName: equip.name,
      trs: monthly.trs !== null ? monthly.trs * 100 : null,
      DO: monthly.DO !== null ? monthly.DO * 100 : null,
      TP: monthly.TP !== null ? monthly.TP * 100 : null,
      TQ: monthly.TQ !== null ? monthly.TQ * 100 : null,
      TRG: monthly.TRG !== null ? monthly.TRG * 100 : null,
      trsObjective: trsObj,
      productionDays,
      source: monthly.source,
    };
  }));
  res.json(result);
}));

router.get("/dashboard/monthly-kpis", requireAuth, cache5, asyncHandler(async (req, res) => {
  const query = GetMonthlyKpisQueryParams.safeParse(req.query);
  if (!query.success || !query.data.month || !query.data.year) {
    res.status(400).json({ error: "month and year are required" });
    return;
  }
  const { month, year, equipmentId } = query.data;
  const { from, to } = getMonthDateRange(month, year);

  let trsObjective = 75;
  if (equipmentId) {
    const [eq_] = await db.select().from(equipmentsTable).where(eq(equipmentsTable.id, equipmentId));
    if (eq_) trsObjective = parseFloat(eq_.trsObjective as unknown as string);
  }

  const { result: monthly } = await getMonthlyTrsResult(from, to, equipmentId, trsObjective);

  res.json({
    month,
    year,
    trs: monthly.trs !== null ? monthly.trs * 100 : null,
    DO: monthly.DO !== null ? monthly.DO * 100 : null,
    TP: monthly.TP !== null ? monthly.TP * 100 : null,
    TQ: monthly.TQ !== null ? monthly.TQ * 100 : null,
    TRG: monthly.TRG !== null ? monthly.TRG * 100 : null,
    TRE: monthly.TRE !== null ? monthly.TRE * 100 : null,
    trsObjective,
    totalTR: monthly.totalTR,
    totalTU: monthly.totalTU,
    totalTF: monthly.totalTF,
    totalTN: monthly.totalTN,
    totalDowntimePlanned: monthly.totalDowntimePlanned,
    totalDowntimeUnplanned: monthly.totalDowntimeUnplanned,
    source: monthly.source,
  });
}));

// ─── Batch pending-validations: 5 queries total instead of 3N ───────────────
// Loads all submitted entries + their downtimes + cadences in parallel batch
// queries, then assembles the response in memory.
router.get("/dashboard/pending-validations", requireAuth, requireRole("supervisor", "admin"), asyncHandler(async (req, res) => {
  const { usersTable, productsTable } = await import("@workspace/db");

  // Query 1: all submitted entries with joins (1 query)
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
    .where(eq(productionEntriesTable.status, "submitted"))
    .orderBy(productionEntriesTable.date);

  if (entries.length === 0) { res.json([]); return; }

  const entryIds = entries.map(e => e.id);
  const uniqueEquipmentIds = [...new Set(entries.map(e => e.equipmentId))];

  // Queries 2 & 3 in parallel: all downtimes + all cadences (2 queries)
  const [allDowntimes, allCadences] = await Promise.all([
    db
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
      .where(and(inArray(downtimeEventsTable.entryId, entryIds), eq(downtimeEventsTable.isDeleted, false))),
    db
      .select({
        equipmentId: cadencesTable.equipmentId,
        productId: cadencesTable.productId,
        validatedCadence: cadencesTable.validatedCadence,
      })
      .from(cadencesTable)
      .where(inArray(cadencesTable.equipmentId, uniqueEquipmentIds)),
  ]);

  // Build lookup maps (in memory)
  const downtimesByEntry = new Map<string, typeof allDowntimes>();
  for (const d of allDowntimes) {
    const arr = downtimesByEntry.get(d.entryId) ?? [];
    arr.push(d);
    downtimesByEntry.set(d.entryId, arr);
  }

  const cadencesByPair = new Map<string, number>();
  for (const c of allCadences) {
    cadencesByPair.set(
      `${c.equipmentId}:${c.productId}`,
      parseFloat(c.validatedCadence as unknown as string),
    );
  }

  // Assemble results in memory (0 additional queries)
  const results = entries.map(entry => {
    const downtimes = downtimesByEntry.get(entry.id) ?? [];
    const validatedCadence = cadencesByPair.get(`${entry.equipmentId}:${entry.productId}`) ?? 0;
    const plannedMinutes = downtimes.filter(d => d.categoryIsPlanned).reduce((s, d) => s + d.durationMinutes, 0);
    const unplannedMinutes = downtimes.filter(d => !d.categoryIsPlanned).reduce((s, d) => s + d.durationMinutes, 0);
    const shiftDur = shiftDurationMinutes(entry.shiftStart, entry.shiftEnd);
    const trsMetrics = calculateTrs({
      shiftDurationMinutes: shiftDur,
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
      downtimeEvents: downtimes.map(d => ({
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
      trsMetrics,
    };
  });

  res.json(results);
}));

// ─── Annual TRS (12 months) ───────────────────────────────────────────────────
router.get("/dashboard/annual-trs", requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(String(req.query.year ?? new Date().getFullYear()));
  const equipmentId = req.query.equipmentId as string | undefined;
  const LABELS = ["Janv","Févr","Mars","Avr","Mai","Juin","Juil","Août","Sept","Oct","Nov","Déc"];

  const result = await Promise.all(
    Array.from({ length: 12 }, (_, i) => i + 1).map(async (month) => {
      const { from, to } = getMonthDateRange(month, year);
      const { result: monthly, entriesWithMetrics } = await getMonthlyTrsResult(from, to, equipmentId, 75);
      return {
        month, monthLabel: LABELS[month - 1],
        trs: monthly.trs !== null ? monthly.trs * 100 : null,
        DO:  monthly.DO  !== null ? monthly.DO  * 100 : null,
        TP:  monthly.TP  !== null ? monthly.TP  * 100 : null,
        TQ:  monthly.TQ  !== null ? monthly.TQ  * 100 : null,
        TRG: monthly.TRG !== null ? monthly.TRG * 100 : null,
        entries: entriesWithMetrics.length,
        source: monthly.source,
      };
    })
  );
  res.json(result);
}));

// ─── Weekly TRS ───────────────────────────────────────────────────────────────
router.get("/dashboard/weekly-trs", requireAuth, asyncHandler(async (req, res) => {
  const year = parseInt(String(req.query.year ?? new Date().getFullYear()));
  const equipmentId = req.query.equipmentId as string | undefined;

  const filters = [
    gte(productionEntriesTable.date, `${year}-01-01`),
    lte(productionEntriesTable.date, `${year}-12-31`),
    or(eq(productionEntriesTable.status, "submitted"), eq(productionEntriesTable.status, "validated"))!,
  ];
  if (equipmentId) filters.push(eq(productionEntriesTable.equipmentId, equipmentId));
  const entries = await db.select().from(productionEntriesTable).where(and(...filters));

  // Batch-fetch all metadata for the year in 2 queries
  const { downtimesByEntry, cadencesByPair } = await batchFetchMetadata(entries);

  function getISOWeek(dateStr: string): number {
    const d = new Date(dateStr + "T00:00:00Z");
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7);
  }

  const byWeek = new Map<number, typeof entries>();
  for (const e of entries) {
    const w = getISOWeek(e.date);
    const arr = byWeek.get(w) ?? []; arr.push(e); byWeek.set(w, arr);
  }

  const result = Array.from(byWeek.keys()).sort((a, b) => a - b).map((weekNum) => {
    const wEntries = byWeek.get(weekNum)!;
    const metrics = wEntries.map(entry => computeEntryMetrics(entry, downtimesByEntry, cadencesByPair));
    const w = calculateMonthlyTrs({ entries: metrics, trsObjective: 75 });
    return {
      week: weekNum, weekLabel: `S${String(weekNum).padStart(2,"0")}`,
      trs: w.trs !== null ? w.trs * 100 : null,
      DO:  w.DO  !== null ? w.DO  * 100 : null,
      TP:  w.TP  !== null ? w.TP  * 100 : null,
      TQ:  w.TQ  !== null ? w.TQ  * 100 : null,
      TRG: w.TRG !== null ? w.TRG * 100 : null,
      entries: wEntries.length,
    };
  });
  res.json(result);
}));

export default router;
