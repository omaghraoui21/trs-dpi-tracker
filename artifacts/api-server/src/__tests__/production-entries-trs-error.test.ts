/**
 * Phase 5 - Production Entries TRS Error Handling
 *
 * Verifies that calculateTrsSafe surfaces the error correctly
 * when used in production-entries context (no cadence found).
 *
 * Run: pnpm test
 */
import { describe, it, expect } from "vitest";
import { calculateTrsSafe } from "../lib/trs-engine";

describe("production-entries TRS error handling", () => {
  it("surfaces trsError when no cadence exists (validatedCadence=0)", () => {
    // Simulates what production-entries.ts does when no cadence found
    // for the product/equipment/presentation triplet
    const validatedCadence = 0; // no cadence found
    const { metrics: trsMetrics, error: trsError } = calculateTrsSafe({
      shiftDurationMinutes: 480,
      plannedDowntimeMinutes: 30,
      unplannedDowntimeMinutes: 15,
      quantityProduced: 5000,
      quantityConforming: 4800,
      validatedCadence,
    });

    expect(trsMetrics).toBeNull();
    expect(trsError).not.toBeNull();
    expect(trsError!.reason).toBe("MISSING_CADENCE");
    expect(trsError!.message).toBeTruthy();
  });
});
