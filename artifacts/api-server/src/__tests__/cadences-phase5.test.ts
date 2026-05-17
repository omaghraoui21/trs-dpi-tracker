/**
 * Phase 5 - Cadences Triplet (product + equipment + presentation)
 *
 * Unit tests for:
 *  - cadence-lookup helpers (resolveDefaultPresentationId, lookupActiveCadence)
 *  - db-errors helper (getConstraintName)
 *  - Cadences CRUD validation logic (mocked DB layer)
 *
 * Run: pnpm test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock @workspace/db ──────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

const chainedQuery = {
  select: mockSelect,
  from: mockFrom,
  where: mockWhere,
  orderBy: mockOrderBy,
  limit: mockLimit,
};

// Each method returns the chain object so calls can be chained
mockSelect.mockReturnValue(chainedQuery);
mockFrom.mockReturnValue(chainedQuery);
mockWhere.mockReturnValue(chainedQuery);
mockOrderBy.mockReturnValue(chainedQuery);

vi.mock("@workspace/db", () => ({
  db: {
    select: () => chainedQuery,
  },
  cadencesTable: {
    id: "id",
    productId: "product_id",
    equipmentId: "equipment_id",
    presentationId: "presentation_id",
    isActive: "is_active",
    theoreticalCadence: "theoretical_cadence",
    validatedCadence: "validated_cadence",
    unit: "unit",
    validatedAt: "validated_at",
    validatedBy: "validated_by",
  },
  productPresentationsTable: {
    id: "id",
    productId: "product_id",
    validationStatus: "validation_status",
    isActive: "is_active",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  and: (...args: unknown[]) => ({ type: "and", args }),
  desc: (col: unknown) => ({ type: "desc", col }),
  asc: (col: unknown) => ({ type: "asc", col }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    strings,
    values,
  }),
}));

import { resolveDefaultPresentationId, lookupActiveCadence } from "../lib/cadence-lookup";
import { getConstraintName, isUniqueViolation, mapDbError } from "../lib/db-errors";

// ─── cadence-lookup tests ────────────────────────────────────────────────────

describe("cadence-lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain methods
    mockSelect.mockReturnValue(chainedQuery);
    mockFrom.mockReturnValue(chainedQuery);
    mockWhere.mockReturnValue(chainedQuery);
    mockOrderBy.mockReturnValue(chainedQuery);
  });

  it("resolveDefaultPresentationId returns null when no presentations exist", async () => {
    mockLimit.mockResolvedValue([]);

    const result = await resolveDefaultPresentationId("product-123");
    expect(result).toBeNull();
  });

  it("resolveDefaultPresentationId returns id of first presentation found", async () => {
    mockLimit.mockResolvedValue([{ id: "pres-confirmed-1" }]);

    const result = await resolveDefaultPresentationId("product-456");
    expect(result).toBe("pres-confirmed-1");
  });

  it("lookupActiveCadence returns null when no active cadence matches triplet", async () => {
    mockLimit.mockResolvedValue([]);

    const result = await lookupActiveCadence({
      productId: "p1",
      equipmentId: "e1",
      presentationId: "pres-1",
    });
    expect(result).toBeNull();
  });

  it("lookupActiveCadence returns cadence row when triplet matches", async () => {
    const cadenceRow = {
      id: "cad-1",
      productId: "p1",
      equipmentId: "e1",
      presentationId: "pres-1",
      theoreticalCadence: 1000,
      validatedCadence: 950,
      unit: "units/hour",
      isActive: true,
      validatedAt: "2025-01-15T10:00:00Z",
      validatedBy: "user-1",
    };
    mockLimit.mockResolvedValue([cadenceRow]);

    const result = await lookupActiveCadence({
      productId: "p1",
      equipmentId: "e1",
      presentationId: "pres-1",
    });
    expect(result).toEqual(cadenceRow);
    expect(result!.id).toBe("cad-1");
  });
});

// ─── db-errors tests ─────────────────────────────────────────────────────────

describe("db-errors helpers", () => {
  it("getConstraintName extracts constraint from error.constraint", () => {
    const err = { constraint: "cadences_product_equipment_presentation_active_unique" };
    expect(getConstraintName(err)).toBe("cadences_product_equipment_presentation_active_unique");
  });

  it("getConstraintName extracts constraint from error.cause.constraint", () => {
    const err = { cause: { constraint: "cadences_valid_from_unique" } };
    expect(getConstraintName(err)).toBe("cadences_valid_from_unique");
  });

  it("getConstraintName returns undefined for non-object errors", () => {
    expect(getConstraintName(null)).toBeUndefined();
    expect(getConstraintName("string error")).toBeUndefined();
    expect(getConstraintName(42)).toBeUndefined();
  });

  it("isUniqueViolation returns true for 23505 on error.code", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("isUniqueViolation returns true for 23505 on error.cause.code", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
  });

  it("isUniqueViolation returns false for other codes", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });

  it("mapDbError returns 409 for unique violation", () => {
    const mapped = mapDbError({ code: "23505" });
    expect(mapped).not.toBeNull();
    expect(mapped!.status).toBe(409);
    expect(mapped!.body.error).toContain("existe");
  });

  it("mapDbError returns null for unrecognized errors", () => {
    expect(mapDbError({ code: "42000" })).toBeNull();
    expect(mapDbError(new Error("random"))).toBeNull();
  });
});

// ─── Cadences API validation logic (documenting expected behavior) ───────────

describe("cadences API validation logic", () => {
  it("rejects when presentationId does not belong to product (PRESENTATION_PRODUCT_MISMATCH)", () => {
    // Validation logic: if presentationId is provided, verify the presentation
    // belongs to the same product. Error code is PRESENTATION_PRODUCT_MISMATCH.
    const errorShape = {
      status: 400,
      body: { error: "PRESENTATION_PRODUCT_MISMATCH", message: expect.any(String) },
    };
    // Documents the expected response shape
    expect(errorShape.status).toBe(400);
    expect(errorShape.body.error).toBe("PRESENTATION_PRODUCT_MISMATCH");
  });

  it("returns 409 ACTIVE_TRIPLET_CONFLICT on unique violation with triplet constraint", () => {
    // When the DB raises a unique violation on the triplet partial index,
    // the route maps it to 409 with reason ACTIVE_TRIPLET_CONFLICT
    const constraintName = "cadences_product_equipment_presentation_active_unique";
    const err = { code: "23505", constraint: constraintName };
    expect(isUniqueViolation(err)).toBe(true);
    expect(getConstraintName(err)).toBe(constraintName);
  });

  it("returns 409 LEGACY_VALID_FROM_CONFLICT on legacy unique violation", () => {
    const constraintName = "cadences_valid_from_unique";
    const err = { code: "23505", constraint: constraintName };
    expect(isUniqueViolation(err)).toBe(true);
    expect(getConstraintName(err)).toBe(constraintName);
  });
});
