import { describe, expect, it } from "vitest";
import { calculateMonthlyTrsV2, calculateTrs, type DailyBaseRow, type ProdMetricsRow } from "../lib/trs-engine";

describe("TRS engine edge cases", () => {
  it("marks missing cadence and returns finite zero metrics", () => {
    const result = calculateTrs({
      shiftDurationMinutes: 480,
      plannedDowntimeMinutes: 60,
      unplannedDowntimeMinutes: 20,
      quantityProduced: 12000,
      quantityConforming: 11800,
      validatedCadence: 0,
    });

    expect(result.cadenceMissing).toBe(true);
    expect(result.tN).toBe(0);
    expect(result.tU).toBe(0);
    expect(result.TP).toBe(0);
    expect(result.TQ).toBe(0);
    expect(result.TRS).toBe(0);
    expect(Number.isFinite(result.TRS)).toBe(true);
  });

  it("clamps negative time windows to zero instead of producing NaN", () => {
    const result = calculateTrs({
      shiftDurationMinutes: -120,
      plannedDowntimeMinutes: 30,
      unplannedDowntimeMinutes: 30,
      quantityProduced: 1000,
      quantityConforming: 1000,
      validatedCadence: 6000,
    });

    expect(result.tO).toBe(0);
    expect(result.tR).toBe(0);
    expect(result.tF).toBe(0);
    expect(result.TRS).toBe(0);
    expect(Number.isFinite(result.DO)).toBe(true);
  });

  it("handles planned stops greater than opening time as zero required time", () => {
    const result = calculateTrs({
      shiftDurationMinutes: 240,
      plannedDowntimeMinutes: 360,
      unplannedDowntimeMinutes: 0,
      quantityProduced: 0,
      quantityConforming: 0,
      validatedCadence: 6000,
    });

    expect(result.tR).toBe(0);
    expect(result.tF).toBe(0);
    expect(result.DO).toBe(0);
    expect(result.TRS).toBe(0);
  });

  it("handles unplanned downtime greater than required time as zero functioning time", () => {
    const result = calculateTrs({
      shiftDurationMinutes: 480,
      plannedDowntimeMinutes: 60,
      unplannedDowntimeMinutes: 999,
      quantityProduced: 1000,
      quantityConforming: 950,
      validatedCadence: 6000,
    });

    expect(result.tR).toBe(420);
    expect(result.tF).toBe(0);
    expect(result.DO).toBe(0);
    expect(result.TP).toBe(0);
  });
});

describe("Monthly TRS V2 daily-entry model", () => {
  it("dilutes monthly TRS when a daily row has no production", () => {
    const dailyBase: DailyBaseRow[] = [
      { tO: 480, tAP: 60, tR: 420 },
      { tO: 480, tAP: 120, tR: 360 },
    ];
    const prodMetrics: ProdMetricsRow[] = [
      {
        tU: 336,
        tF: 400,
        tN: 360,
        plannedDowntimeMinutes: 60,
        unplannedDowntimeMinutes: 20,
      },
    ];

    const result = calculateMonthlyTrsV2(dailyBase, prodMetrics, 0.75);

    expect(result.source).toBe("daily");
    expect(result.totalTR).toBe(780);
    expect(result.totalTU).toBe(336);
    expect(result.trs).toBeCloseTo(336 / 780, 6);
    expect(result.trs).toBeLessThan(336 / 420);
  });

  it("returns null metrics when no daily base rows exist", () => {
    const result = calculateMonthlyTrsV2([], [], 0.75);

    expect(result.trs).toBeNull();
    expect(result.DO).toBeNull();
    expect(result.totalTR).toBe(0);
    expect(result.totalTU).toBe(0);
  });
});
