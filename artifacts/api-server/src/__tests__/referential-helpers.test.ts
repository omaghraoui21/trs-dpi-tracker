/**
 * Unit tests for the Phase 1 helper trio:
 *   - mapDbError       (db-errors.ts)
 *   - decideDeleteAction (smart-delete.ts)
 *
 * countDependencies is intentionally NOT covered here — it touches the db and
 * gets integration coverage in FEAT-004.
 *
 * Run: pnpm run test
 */
import { describe, it, expect } from "vitest";
import { mapDbError } from "../lib/db-errors";
import { decideDeleteAction } from "../lib/smart-delete";
import type { DependencyCount } from "../lib/referential-deps";

// ─────────────────────────────────────────────────────────
// mapDbError
// ─────────────────────────────────────────────────────────
describe("mapDbError", () => {
  it("returns 409 with French body when err.code === '23505'", () => {
    const err = Object.assign(new Error("duplicate key"), { code: "23505" });
    const mapped = mapDbError(err);
    expect(mapped).not.toBeNull();
    expect(mapped?.status).toBe(409);
    expect(mapped?.body).toEqual({ error: "Cette valeur existe déjà (code dupliqué)" });
  });

  it("returns 409 when err.cause.code === '23505' (drizzle-wrapped shape)", () => {
    const cause = Object.assign(new Error("duplicate key"), { code: "23505" });
    const err = Object.assign(new Error("query failed"), { cause });
    const mapped = mapDbError(err);
    expect(mapped).not.toBeNull();
    expect(mapped?.status).toBe(409);
    expect(mapped?.body.error).toContain("existe déjà");
  });

  it("returns null for foreign-key violation (23503)", () => {
    const err = Object.assign(new Error("fk violation"), { code: "23503" });
    expect(mapDbError(err)).toBeNull();
  });

  it("returns null for null, undefined, plain string, and a generic Error without code", () => {
    expect(mapDbError(null)).toBeNull();
    expect(mapDbError(undefined)).toBeNull();
    expect(mapDbError("boom")).toBeNull();
    expect(mapDbError(new Error("plain error"))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// decideDeleteAction
// ─────────────────────────────────────────────────────────
describe("decideDeleteAction", () => {
  it("returns hard_delete when both counts are 0", () => {
    const deps: DependencyCount = { historical: 0, activeOpen: 0, byTable: {} };
    expect(decideDeleteAction(deps)).toEqual({ kind: "hard_delete" });
  });

  it("returns deactivate when historical>0 and activeOpen=0", () => {
    const deps: DependencyCount = {
      historical: 5,
      activeOpen: 0,
      byTable: { production_entries: { historical: 5, activeOpen: 0 } },
    };
    expect(decideDeleteAction(deps)).toEqual({ kind: "deactivate" });
  });

  it("returns block with a reason that mentions the offending table label and count", () => {
    const deps: DependencyCount = {
      historical: 7,
      activeOpen: 2,
      byTable: {
        production_entries: { historical: 5, activeOpen: 2 },
        downtime_events: { historical: 2, activeOpen: 0 },
      },
    };
    const decision = decideDeleteAction(deps);
    expect(decision.kind).toBe("block");
    if (decision.kind !== "block") return;
    expect(decision.reason).toContain("entrées de production");
    expect(decision.reason).toContain("(2)");
    // Only one offender here, so "et" should NOT appear.
    expect(decision.reason).not.toContain(" et ");
  });

  it("joins multiple offenders with ' et ' when several tables have activeOpen>0", () => {
    const deps: DependencyCount = {
      historical: 4,
      activeOpen: 3,
      byTable: {
        production_entries: { historical: 2, activeOpen: 2 },
        downtime_events: { historical: 2, activeOpen: 1 },
      },
    };
    const decision = decideDeleteAction(deps);
    expect(decision.kind).toBe("block");
    if (decision.kind !== "block") return;
    expect(decision.reason).toContain(" et ");
    expect(decision.reason).toContain("entrées de production");
    expect(decision.reason).toContain("événements d'arrêt");
    expect(decision.reason).toContain("(2)");
    expect(decision.reason).toContain("(1)");
    expect(decision.reason.startsWith("Suppression impossible: lié à ")).toBe(true);
    expect(decision.reason.endsWith(".")).toBe(true);
  });
});
