/**
 * Shared helpers for referential CRUD operations.
 *
 * Provides:
 * - withUniqueCheck: wraps DB operation and returns 409 on duplicate code
 * - countEquipmentDeps / countProductDeps / countCategoryDeps: dependency counters
 */

import { Response } from "express";
import {
  db,
  productionEntriesTable,
  dailyEntriesTable,
  downtimeEventsTable,
  cadencesTable,
  productionPlansTable,
  kpiDailyTable,
  kpiTargetsTable,
  productPresentationsTable,
  activityDowntimesTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";

import { isUniqueViolation } from "./db-errors";

// ─── 409 Unique Violation Handler ─────────────────────────────────────────────

/**
 * Execute a DB operation and handle unique-constraint violations as 409.
 * Returns `null` if a 409 was sent (caller should return early).
 */
export async function withUniqueCheck<T>(
  res: Response,
  operation: () => Promise<T>,
  message = "Un élément avec ce code existe déjà",
): Promise<T | null> {
  try {
    return await operation();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: message });
      return null;
    }
    throw err;
  }
}

// ─── Dependency Counters ──────────────────────────────────────────────────────

export interface DependencyCount {
  table: string;
  label: string;
  count: number;
}

export async function countEquipmentDeps(equipmentId: string): Promise<DependencyCount[]> {
  const checks: { tbl: any; col: any; name: string; label: string }[] = [
    {
      tbl: productionEntriesTable,
      col: productionEntriesTable.equipmentId,
      name: "production_entries",
      label: "Entrées de production",
    },
    {
      tbl: dailyEntriesTable,
      col: dailyEntriesTable.equipmentId,
      name: "daily_entries",
      label: "Saisies journalières",
    },
    {
      tbl: downtimeEventsTable,
      col: downtimeEventsTable.equipmentId,
      name: "downtime_events",
      label: "Événements d'arrêt",
    },
    { tbl: cadencesTable, col: cadencesTable.equipmentId, name: "cadences", label: "Cadences" },
    {
      tbl: productionPlansTable,
      col: productionPlansTable.equipmentId,
      name: "production_plans",
      label: "Plans de production",
    },
    {
      tbl: kpiDailyTable,
      col: kpiDailyTable.equipmentId,
      name: "kpi_daily",
      label: "KPI journaliers",
    },
    {
      tbl: kpiTargetsTable,
      col: kpiTargetsTable.equipmentId,
      name: "kpi_targets",
      label: "Objectifs KPI",
    },
  ];

  const results: DependencyCount[] = [];
  for (const { tbl, col, name, label } of checks) {
    const [row] = await db.select({ c: count() }).from(tbl).where(eq(col, equipmentId));
    const n = Number(row?.c ?? 0);
    if (n > 0) results.push({ table: name, label, count: n });
  }
  return results;
}

export async function countProductDeps(productId: string): Promise<DependencyCount[]> {
  const checks: { tbl: any; col: any; name: string; label: string }[] = [
    {
      tbl: productionEntriesTable,
      col: productionEntriesTable.productId,
      name: "production_entries",
      label: "Entrées de production",
    },
    { tbl: cadencesTable, col: cadencesTable.productId, name: "cadences", label: "Cadences" },
    {
      tbl: productionPlansTable,
      col: productionPlansTable.productId,
      name: "production_plans",
      label: "Plans de production",
    },
    {
      tbl: productPresentationsTable,
      col: productPresentationsTable.productId,
      name: "product_presentations",
      label: "Présentations produit",
    },
    {
      tbl: kpiDailyTable,
      col: kpiDailyTable.productId,
      name: "kpi_daily",
      label: "KPI journaliers",
    },
    {
      tbl: kpiTargetsTable,
      col: kpiTargetsTable.productId,
      name: "kpi_targets",
      label: "Objectifs KPI",
    },
  ];

  const results: DependencyCount[] = [];
  for (const { tbl, col, name, label } of checks) {
    const [row] = await db.select({ c: count() }).from(tbl).where(eq(col, productId));
    const n = Number(row?.c ?? 0);
    if (n > 0) results.push({ table: name, label, count: n });
  }
  return results;
}

export async function countCategoryDeps(categoryId: string): Promise<DependencyCount[]> {
  const checks: { tbl: any; col: any; name: string; label: string }[] = [
    {
      tbl: downtimeEventsTable,
      col: downtimeEventsTable.categoryId,
      name: "downtime_events",
      label: "Événements d'arrêt",
    },
    {
      tbl: activityDowntimesTable,
      col: activityDowntimesTable.categoryId,
      name: "activity_downtimes",
      label: "Arrêts d'activité",
    },
  ];

  const results: DependencyCount[] = [];
  for (const { tbl, col, name, label } of checks) {
    const [row] = await db.select({ c: count() }).from(tbl).where(eq(col, categoryId));
    const n = Number(row?.c ?? 0);
    if (n > 0) results.push({ table: name, label, count: n });
  }
  return results;
}
