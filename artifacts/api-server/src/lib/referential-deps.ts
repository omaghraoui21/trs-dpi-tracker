/**
 * Referential dependency counter — used by the smart-delete decision tree.
 *
 * For a given referential resource (equipments, products, downtime-categories)
 * and a target id, returns:
 *   - historical: total number of rows in any dependent table referencing the id
 *   - activeOpen: subset of those that are still in an "active/open" lifecycle
 *     state (e.g. production_entries with status IN ('draft','submitted'),
 *     downtime_events with status='open' AND is_deleted=false, ...)
 *   - byTable: per-table breakdown using the SQL table name as key
 *
 * The active/open predicates per kind are documented in
 * .agents/tasks/task-phase-1-helpers/context.json -> phase_1_decisions.dependency_count_tables.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  productionEntriesTable,
  downtimeEventsTable,
  dailyEntriesTable,
  kpiDailyTable,
  kpiMonthlyTable,
  cadencesTable,
  activityDowntimesTable,
  productPresentationsTable,
} from "@workspace/db";

export type ReferentialKind = "equipments" | "products" | "downtime-categories";

export interface DependencyCount {
  historical: number;
  activeOpen: number;
  byTable: Record<string, { historical: number; activeOpen: number }>;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function countWhere(
  table: Parameters<ReturnType<typeof db.select>["from"]>[0],
  whereClause: ReturnType<typeof eq> | ReturnType<typeof and>,
): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from(table as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where(whereClause as any);
  const c = rows[0]?.c;
  return typeof c === "number" ? c : Number(c ?? 0);
}

interface TableRule {
  /** SQL table name used as `byTable` key. */
  name: string;
  /** Total-count predicate (all rows referencing the id). */
  historical: ReturnType<typeof eq> | ReturnType<typeof and>;
  /** Active-open subset predicate, or null if this table is always historical. */
  activeOpen: ReturnType<typeof eq> | ReturnType<typeof and> | null;
  /** Drizzle table object to count from. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
}

function rulesFor(kind: ReferentialKind, id: string): TableRule[] {
  switch (kind) {
    case "equipments": {
      const peRef = eq(productionEntriesTable.equipmentId, id);
      const deRef = eq(downtimeEventsTable.equipmentId, id);
      const dailyRef = eq(dailyEntriesTable.equipmentId, id);
      const kpiDRef = eq(kpiDailyTable.equipmentId, id);
      const kpiMRef = eq(kpiMonthlyTable.equipmentId, id);
      const cadRef = eq(cadencesTable.equipmentId, id);
      return [
        {
          name: "production_entries",
          table: productionEntriesTable,
          historical: peRef,
          activeOpen: and(peRef, inArray(productionEntriesTable.status, ["draft", "submitted"])),
        },
        {
          name: "downtime_events",
          table: downtimeEventsTable,
          historical: deRef,
          activeOpen: and(
            deRef,
            eq(downtimeEventsTable.status, "open"),
            eq(downtimeEventsTable.isDeleted, false),
          ),
        },
        {
          name: "daily_entries",
          table: dailyEntriesTable,
          historical: dailyRef,
          activeOpen: and(dailyRef, eq(dailyEntriesTable.status, "draft")),
        },
        {
          name: "kpi_daily",
          table: kpiDailyTable,
          historical: kpiDRef,
          activeOpen: null,
        },
        {
          name: "kpi_monthly",
          table: kpiMonthlyTable,
          historical: kpiMRef,
          activeOpen: null,
        },
        {
          name: "cadences",
          table: cadencesTable,
          historical: cadRef,
          activeOpen: and(cadRef, eq(cadencesTable.isActive, true)),
        },
      ];
    }
    case "products": {
      const peRef = eq(productionEntriesTable.productId, id);
      const cadRef = eq(cadencesTable.productId, id);
      const kpiDRef = eq(kpiDailyTable.productId, id);
      const kpiMRef = eq(kpiMonthlyTable.productId, id);
      const ppRef = eq(productPresentationsTable.productId, id);
      return [
        {
          name: "production_entries",
          table: productionEntriesTable,
          historical: peRef,
          activeOpen: and(peRef, inArray(productionEntriesTable.status, ["draft", "submitted"])),
        },
        {
          name: "cadences",
          table: cadencesTable,
          historical: cadRef,
          activeOpen: and(cadRef, eq(cadencesTable.isActive, true)),
        },
        {
          name: "kpi_daily",
          table: kpiDailyTable,
          historical: kpiDRef,
          activeOpen: null,
        },
        {
          name: "kpi_monthly",
          table: kpiMonthlyTable,
          historical: kpiMRef,
          activeOpen: null,
        },
        {
          name: "product_presentations",
          table: productPresentationsTable,
          historical: ppRef,
          activeOpen: null,
        },
      ];
    }
    case "downtime-categories": {
      const deRef = eq(downtimeEventsTable.categoryId, id);
      const adRef = eq(activityDowntimesTable.categoryId, id);
      return [
        {
          name: "downtime_events",
          table: downtimeEventsTable,
          historical: deRef,
          activeOpen: and(
            deRef,
            eq(downtimeEventsTable.status, "open"),
            eq(downtimeEventsTable.isDeleted, false),
          ),
        },
        {
          name: "activity_downtimes",
          table: activityDowntimesTable,
          historical: adRef,
          activeOpen: null,
        },
      ];
    }
  }
}

/**
 * Count rows in every dependent table referencing the given referential id,
 * splitting per table and per active/open lifecycle state.
 */
export async function countDependencies(
  kind: ReferentialKind,
  id: string,
): Promise<DependencyCount> {
  const rules = rulesFor(kind, id);
  const byTable: Record<string, { historical: number; activeOpen: number }> = {};
  let historical = 0;
  let activeOpen = 0;

  for (const rule of rules) {
    const h = await countWhere(rule.table, rule.historical);
    const a = rule.activeOpen ? await countWhere(rule.table, rule.activeOpen) : 0;
    byTable[rule.name] = { historical: h, activeOpen: a };
    historical += h;
    activeOpen += a;
  }

  return { historical, activeOpen, byTable };
}
