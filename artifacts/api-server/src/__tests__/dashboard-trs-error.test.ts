/**
 * Phase 6 hotfix — dashboard fail-loud aggregation
 *
 * dashboard.ts uses calculateTrsSafe and excludes entries whose triplet has
 * no active cadence (metrics === null) from monthly/daily/weekly aggregations.
 * This test verifies the fail-loud contract on calculateTrsSafe + the
 * filtering pattern (m): m is ProdMetricsRow => m !== null) used by the route.
 *
 * Run: pnpm test
 */
import { describe, it, expect } from "vitest";
import { calculateTrsSafe, calculateMonthlyTrs } from "../lib/trs-engine";

describe("dashboard TRS aggregation skips missing-cadence entries (Phase 6 hotfix)", () => {
  it("calculateTrsSafe returns metrics null + MISSING_CADENCE error for validatedCadence=0", () => {
    const { metrics, error } = calculateTrsSafe({
      shiftDurationMinutes: 480,
      plannedDowntimeMinutes: 0,
      unplannedDowntimeMinutes: 0,
      quantityProduced: 100,
      quantityConforming: 100,
      validatedCadence: 0,
    });
    expect(metrics).toBeNull();
    expect(error?.reason).toBe("MISSING_CADENCE");
  });

  it("calculateTrsSafe returns valid metrics when cadence is positive", () => {
    const { metrics, error } = calculateTrsSafe({
      shiftDurationMinutes: 480,
      plannedDowntimeMinutes: 30,
      unplannedDowntimeMinutes: 15,
      quantityProduced: 1000,
      quantityConforming: 950,
      validatedCadence: 200,
    });
    expect(error).toBeNull();
    expect(metrics).not.toBeNull();
    expect(metrics!.TRS).toBeGreaterThan(0);
  });

  it("monthly aggregation built only from non-null metrics excludes missing-cadence entries (does NOT count them as 0%)", () => {
    // Three entries: two valid, one with no cadence (will return null from calculateTrsSafe).
    const safe1 = calculateTrsSafe({
      shiftDurationMinutes: 480, plannedDowntimeMinutes: 30, unplannedDowntimeMinutes: 15,
      quantityProduced: 1000, quantityConforming: 950, validatedCadence: 200,
    });
    const safe2 = calculateTrsSafe({
      shiftDurationMinutes: 480, plannedDowntimeMinutes: 0, unplannedDowntimeMinutes: 60,
      quantityProduced: 800, quantityConforming: 800, validatedCadence: 150,
    });
    const safeMissing = calculateTrsSafe({
      shiftDurationMinutes: 480, plannedDowntimeMinutes: 0, unplannedDowntimeMinutes: 0,
      quantityProduced: 5000, quantityConforming: 5000, validatedCadence: 0, // missing
    });

    // Reproduces the exact filter used in dashboard.ts getMonthlyTrsResult:
    const allEntries = [safe1, safe2, safeMissing];
    const filtered = allEntries
      .map((e) => e.metrics)
      .filter((m): m is NonNullable<typeof m> => m !== null);

    expect(filtered).toHaveLength(2);
    expect(filtered).not.toContain(null);

    // Aggregate over filtered set only (mimics getMonthlyTrsResult).
    const result = calculateMonthlyTrs({ entries: filtered, trsObjective: 75 });

    // Compare against an aggregation that WRONGLY included the missing-cadence row
    // as zero metrics. The wrong aggregate should be lower (skewed by phantom 0%).
    const wrongMetrics = [
      ...filtered,
      { tR: 480, tU: 0, tF: 480, tN: 0, tO: 480, plannedDowntimeMinutes: 0, unplannedDowntimeMinutes: 0 },
    ];
    const wrongResult = calculateMonthlyTrs({ entries: wrongMetrics, trsObjective: 75 });

    // Confirm filtering produces a strictly higher (correct) TRS than the
    // silent-fallback path would have produced.
    expect(result.trs).not.toBeNull();
    expect(wrongResult.trs).not.toBeNull();
    expect(result.trs!).toBeGreaterThan(wrongResult.trs!);
  });

  it("if all entries are missing cadence, filtered list is empty and aggregate trs is null (no phantom zero)", () => {
    const safeMissing1 = calculateTrsSafe({
      shiftDurationMinutes: 480, plannedDowntimeMinutes: 0, unplannedDowntimeMinutes: 0,
      quantityProduced: 100, quantityConforming: 100, validatedCadence: 0,
    });
    const safeMissing2 = calculateTrsSafe({
      shiftDurationMinutes: 480, plannedDowntimeMinutes: 0, unplannedDowntimeMinutes: 0,
      quantityProduced: 200, quantityConforming: 200, validatedCadence: 0,
    });

    const filtered = [safeMissing1, safeMissing2]
      .map((e) => e.metrics)
      .filter((m): m is NonNullable<typeof m> => m !== null);

    expect(filtered).toHaveLength(0);
    const result = calculateMonthlyTrs({ entries: filtered, trsObjective: 75 });
    expect(result.trs).toBeNull();
  });
});
