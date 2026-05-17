/**
 * Phase 5 - Production Entries TRS Error Handling
 *
 * Verifies that calculateTrsSafe surfaces the error correctly
 * when used in production-entries context (no cadence found).
 *
 * Phase 6 hotfix: also verifies that the new triplet-aware lookup
 * (lookupActiveCadence + resolveDefaultPresentationId) is deterministic
 * under multi-presentation scenarios — it must pick the cadence row matching
 * the resolved default presentation, not an arbitrary pair-only match.
 *
 * Run: pnpm test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared chained-query mock for db.select() ───────────────────────────────
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const chainedQuery = {
  select: vi.fn(),
  from: vi.fn(),
  where: mockWhere,
  orderBy: mockOrderBy,
  limit: mockLimit,
};
chainedQuery.select.mockReturnValue(chainedQuery);
chainedQuery.from.mockReturnValue(chainedQuery);
mockWhere.mockReturnValue(chainedQuery);
mockOrderBy.mockReturnValue(chainedQuery);

vi.mock("@workspace/db", () => ({
  db: { select: () => chainedQuery },
  cadencesTable: {
    id: "id", productId: "product_id", equipmentId: "equipment_id",
    presentationId: "presentation_id", isActive: "is_active",
    validatedCadence: "validated_cadence",
  },
  productPresentationsTable: {
    id: "id", productId: "product_id",
    validationStatus: "validation_status", isActive: "is_active",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  and: (...args: unknown[]) => ({ type: "and", args }),
  desc: (col: unknown) => ({ type: "desc", col }),
  asc: (col: unknown) => ({ type: "asc", col }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings, values }),
}));

import { calculateTrsSafe } from "../lib/trs-engine";
import { lookupActiveCadence, resolveDefaultPresentationId } from "../lib/cadence-lookup";

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

describe("production-entries deterministic cadence resolution (Phase 6 hotfix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainedQuery.select.mockReturnValue(chainedQuery);
    chainedQuery.from.mockReturnValue(chainedQuery);
    mockWhere.mockReturnValue(chainedQuery);
    mockOrderBy.mockReturnValue(chainedQuery);
  });

  it("when two active cadences share (product, equipment) but differ by presentation, lookupActiveCadence picks the row matching the resolved default presentation — not an arbitrary one", async () => {
    // Setup: product P1 has two presentations:
    //   pres-DEFAULT (confirmed, active, oldest) → resolveDefaultPresentationId returns this
    //   pres-OTHER   (draft, active)
    // and two ACTIVE cadences exist for (P1, E1):
    //   cadence A — presentation pres-DEFAULT, validatedCadence=950
    //   cadence B — presentation pres-OTHER,   validatedCadence=1200
    //
    // The OLD pair-only find() could return either row depending on insertion order.
    // The NEW triplet lookup must return only cadence A (=950).

    // 1) resolveDefaultPresentationId is called first → returns pres-DEFAULT
    mockLimit.mockResolvedValueOnce([{ id: "pres-DEFAULT" }]);

    const presentationId = await resolveDefaultPresentationId("P1");
    expect(presentationId).toBe("pres-DEFAULT");

    // 2) lookupActiveCadence is then called with the resolved triplet.
    //    The DB partial unique index guarantees at most one active row per triplet.
    //    Mock returns only the matching row (cadence A).
    mockLimit.mockResolvedValueOnce([
      {
        id: "cadence-A",
        productId: "P1",
        equipmentId: "E1",
        presentationId: "pres-DEFAULT",
        validatedCadence: "950.00",
        isActive: true,
      },
    ]);

    const cadence = await lookupActiveCadence({
      productId: "P1",
      equipmentId: "E1",
      presentationId: "pres-DEFAULT",
    });

    // Must be cadence A, never cadence B.
    expect(cadence).not.toBeNull();
    expect(cadence!.id).toBe("cadence-A");
    expect(cadence!.presentationId).toBe("pres-DEFAULT");
    expect(parseFloat(cadence!.validatedCadence as unknown as string)).toBe(950);

    // The where() call MUST have included the presentationId predicate,
    // proving the query is triplet-keyed (not just pair).
    const whereCalls = mockWhere.mock.calls;
    const lastWhere = whereCalls[whereCalls.length - 1];
    const whereArg = JSON.stringify(lastWhere);
    expect(whereArg).toContain("presentation_id");
  });

  it("when no presentation can be resolved for the product, validatedCadence falls back to 0 → calculateTrsSafe surfaces MISSING_CADENCE", async () => {
    // resolveDefaultPresentationId returns null (no presentations for this product)
    mockLimit.mockResolvedValueOnce([]);

    const presentationId = await resolveDefaultPresentationId("P-orphan");
    expect(presentationId).toBeNull();

    // production-entries skips lookupActiveCadence in this case → validatedCadence = 0
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
});
