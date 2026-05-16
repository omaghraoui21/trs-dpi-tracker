/**
 * Phase 1 referentials integration tests — equipments / products /
 * downtime-categories.
 *
 * Approach (A from FEAT-004 plan): supertest against the real Express app,
 * with @workspace/db replaced by a chainable mock and the auth middleware
 * stubbed to inject a fake admin user. Every drizzle call end-shape used by
 * the three routes (select / insert / update / delete) is rigged per-test
 * via the pre-installed `dbMock` helper.
 *
 * The chain is both chainable (every method returns the chain itself) and
 * thenable (resolves to the per-call rigged rows array). This is enough
 * because the route handlers always either await the builder directly or
 * await the explicit terminal methods (`.returning()`, `.orderBy(...)`,
 * `.where(...)`).
 *
 * Coverage matrix (>= 18 cases — see acceptance criteria in
 * .agents/tasks/task-phase-1-helpers/features/FEAT-004.json):
 *   - POST <resource>            duplicate-code 409                   x3
 *   - PATCH <resource>/:id       duplicate-code 409                   x3
 *   - DELETE <resource>/:id      no deps -> 204 + audit=delete        x3
 *   - DELETE <resource>/:id      historical only -> 200 + deactivate  x3
 *   - DELETE <resource>/:id      active/open -> 409 + no mutate/audit x3
 *   - GET <resource>             active-only by default               x3
 *   - GET <resource>             includeInactive=true skips filter    x3
 *   - POST <resource>/:id/reactivate -> 200 isActive=true + audit     x3
 */

// ─── Env stubs (must precede every import that triggers module-level checks)
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-not-real-32chars-min";
process.env.NODE_ENV ??= "test";

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks (vitest hoists vi.mock above imports) ──────────────────────────────

// One shared mock instance lives across the test file; per-test reset in
// beforeEach. Hoisting requires the factory to declare all exports the route
// files import from `@workspace/db`. We use vi.hoisted so the mock object
// itself is hoisted alongside the vi.mock calls.
const dbMock = vi.hoisted(() => {
  function makeDbMock() {
    const queue: Array<unknown[] | { reject: unknown }> = [];
    const calls: { method: string; args: unknown[] }[] = [];

    function buildChain(): Record<string, unknown> & PromiseLike<unknown[]> {
      const chain: Record<string, unknown> = {};
      const chainable = [
        "from",
        "where",
        "orderBy",
        "values",
        "set",
        "leftJoin",
        "innerJoin",
        "limit",
        "offset",
        "groupBy",
        "having",
        "onConflictDoNothing",
        "onConflictDoUpdate",
      ];
      for (const m of chainable) {
        chain[m] = vi.fn((...args: unknown[]) => {
          calls.push({ method: m, args });
          return chain;
        });
      }
      chain["returning"] = vi.fn((...args: unknown[]) => {
        calls.push({ method: "returning", args });
        return chain;
      });
      chain["then"] = (
        resolve: (v: unknown[]) => unknown,
        reject?: (e: unknown) => unknown,
      ): unknown => {
        const next = queue.shift();
        if (next && typeof next === "object" && !Array.isArray(next) && "reject" in next) {
          return Promise.reject((next as { reject: unknown }).reject).then(
            resolve as never,
            reject,
          );
        }
        return Promise.resolve((next as unknown[] | undefined) ?? []).then(resolve, reject);
      };
      return chain as Record<string, unknown> & PromiseLike<unknown[]>;
    }

    const db = {
      select: vi.fn((..._args: unknown[]) => {
        calls.push({ method: "select", args: _args });
        return buildChain();
      }),
      insert: vi.fn((..._args: unknown[]) => {
        calls.push({ method: "insert", args: _args });
        return buildChain();
      }),
      update: vi.fn((..._args: unknown[]) => {
        calls.push({ method: "update", args: _args });
        return buildChain();
      }),
      delete: vi.fn((..._args: unknown[]) => {
        calls.push({ method: "delete", args: _args });
        return buildChain();
      }),
    };

    return {
      db,
      pushResult: (rows: unknown[]) => queue.push(rows),
      pushReject: (err: unknown) => queue.push({ reject: err }),
      reset: () => {
        queue.length = 0;
        calls.length = 0;
        db.select.mockClear();
        db.insert.mockClear();
        db.update.mockClear();
        db.delete.mockClear();
      },
      calls,
    };
  }
  return makeDbMock();
});

vi.mock("@workspace/db", () => {
  return {
    db: dbMock.db,
    // Drizzle table objects — predicates pass them through, so empty objects
    // are fine for our chain mock.
    equipmentsTable: {
      id: "eq.id",
      name: "eq.name",
      code: "eq.code",
      isActive: "eq.isActive",
      trsObjective: "eq.trsObjective",
      description: "eq.description",
      createdAt: "eq.createdAt",
      siteId: "eq.siteId",
      roomId: "eq.roomId",
      equipmentType: "eq.equipmentType",
      updatedAt: "eq.updatedAt",
    },
    productsTable: {
      id: "p.id",
      name: "p.name",
      code: "p.code",
      isActive: "p.isActive",
      description: "p.description",
      createdAt: "p.createdAt",
    },
    downtimeCategoriesTable: {
      id: "dc.id",
      code: "dc.code",
      label: "dc.label",
      description: "dc.description",
      famille: "dc.famille",
      impactType: "dc.impactType",
      isPlanned: "dc.isPlanned",
      requiresComment: "dc.requiresComment",
      isActive: "dc.isActive",
      isQuickShortcut: "dc.isQuickShortcut",
      shortcutEquipments: "dc.shortcutEquipments",
    },
    cadencesTable: {
      id: "c.id",
      productId: "c.productId",
      equipmentId: "c.equipmentId",
      isActive: "c.isActive",
      theoreticalCadence: "c.theoreticalCadence",
      validatedCadence: "c.validatedCadence",
      unit: "c.unit",
    },
    productionEntriesTable: {
      id: "pe.id",
      equipmentId: "pe.equipmentId",
      productId: "pe.productId",
      status: "pe.status",
    },
    downtimeEventsTable: {
      id: "de.id",
      equipmentId: "de.equipmentId",
      categoryId: "de.categoryId",
      status: "de.status",
      isDeleted: "de.isDeleted",
    },
    dailyEntriesTable: {
      id: "de2.id",
      equipmentId: "de2.equipmentId",
      status: "de2.status",
    },
    kpiDailyTable: {
      id: "kd.id",
      equipmentId: "kd.equipmentId",
      productId: "kd.productId",
    },
    kpiMonthlyTable: {
      id: "km.id",
      equipmentId: "km.equipmentId",
      productId: "km.productId",
    },
    activityDowntimesTable: {
      id: "ad.id",
      categoryId: "ad.categoryId",
    },
    roomsTable: {
      id: "r.id",
      code: "r.code",
      name: "r.name",
    },
    auditLogTable: {
      id: "al.id",
    },
    usersTable: {
      id: "u.id",
    },
    pool: { totalCount: 0, idleCount: 0, waitingCount: 0 },
  };
});

// Stub auth middleware: bypass token verification, inject a fake admin user.
vi.mock("../middlewares/auth", () => {
  return {
    requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = {
        id: "00000000-0000-0000-0000-000000000001",
        email: "test-admin@example.com",
        firstName: "Test",
        lastName: "Admin",
        role: "admin",
        isActive: true,
      };
      next();
    },
    requireRole:
      (..._roles: string[]) =>
      (_req: unknown, _res: unknown, next: () => void) =>
        next(),
  };
});

// ─── Imports of code under test (after mocks) ────────────────────────────────
import request from "supertest";
import * as auditModule from "../lib/audit";
import * as referentialDepsModule from "../lib/referential-deps";
const { default: app } = await import("../app");

// ─── Per-test reset ──────────────────────────────────────────────────────────
const writeAuditSpy = vi.spyOn(auditModule, "writeAudit").mockImplementation(() => {});
const countDependenciesSpy = vi.spyOn(referentialDepsModule, "countDependencies");

beforeEach(() => {
  dbMock.reset();
  writeAuditSpy.mockClear();
  countDependenciesSpy.mockClear();
});

// ─── Test data fixtures ──────────────────────────────────────────────────────
const EQ_ID = "11111111-1111-1111-1111-111111111111";
const P_ID = "22222222-2222-2222-2222-222222222222";
const DC_ID = "33333333-3333-3333-3333-333333333333";

function eqRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EQ_ID,
    name: "Mixer-1",
    code: "EQ-001",
    description: null,
    trsObjective: "85",
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}
function pRow(overrides: Record<string, unknown> = {}) {
  return {
    id: P_ID,
    name: "ProductA",
    code: "P-001",
    description: null,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}
function dcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DC_ID,
    code: "DC-001",
    label: "Panne",
    description: null,
    famille: null,
    impactType: "tF",
    isPlanned: false,
    requiresComment: false,
    isActive: true,
    isQuickShortcut: false,
    shortcutEquipments: null,
    ...overrides,
  };
}

// `countDependencies` calls db.select({c: sql\`count(*)::int\`}).from(...).where(...)
// per dependent table. Each call awaits to a [{ c: number }] array.
function pushDepCounts(perTable: Array<{ historical: number; activeOpen: number }>) {
  // For each rule, the helper does one SELECT for historical, plus ONE more
  // SELECT for activeOpen IF the rule has a non-null activeOpen predicate.
  // The test caller knows the order of rules and supplies one entry per
  // rule, with activeOpen=0 meaning "this rule has no activeOpen subquery
  // (kpi_daily / kpi_monthly / activity_downtimes)" iff the second arg flag
  // says so. To keep the helper simple here, we just push historical and
  // activeOpen as separate selects; rules without an activeOpen branch must
  // be passed as { historical: N, activeOpen: -1 } and we won't push the
  // second select.
  for (const counts of perTable) {
    dbMock.pushResult([{ c: counts.historical }]);
    if (counts.activeOpen >= 0) {
      dbMock.pushResult([{ c: counts.activeOpen }]);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// EQUIPMENTS
// ──────────────────────────────────────────────────────────────────────────
describe("equipments routes — Phase 1 contract", () => {
  describe("POST /api/equipments", () => {
    it("returns 409 on duplicate code (mapDbError path)", async () => {
      dbMock.pushReject(Object.assign(new Error("dup"), { code: "23505" }));
      const res = await request(app)
        .post("/api/equipments")
        .send({ name: "Mixer-1", code: "EQ-001", trsObjective: 85 });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Cette valeur existe déjà (code dupliqué)" });
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/equipments/:id", () => {
    it("returns 409 on duplicate code", async () => {
      dbMock.pushResult([eqRow()]); // SELECT existing
      // Phase 2: code change with historical=0 still runs the UPDATE; push 6
      // zero entries so the immutability branch is skipped, then the UPDATE
      // rejects with 23505.
      pushDepCounts([
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: 0 },
      ]);
      dbMock.pushReject(Object.assign(new Error("dup"), { code: "23505" })); // UPDATE rejects
      const res = await request(app).patch(`/api/equipments/${EQ_ID}`).send({ code: "EQ-DUP" });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("existe déjà");
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/equipments/:id smart-delete decision tree", () => {
    it("hard-deletes (204) and audits action=delete when no deps", async () => {
      dbMock.pushResult([eqRow()]); // SELECT existing
      // 6 rules for equipments: production_entries, downtime_events,
      // daily_entries, kpi_daily (no activeOpen), kpi_monthly (no activeOpen),
      // cadences. Each rule with activeOpen branch -> 2 SELECTs.
      pushDepCounts([
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: 0 },
      ]);
      dbMock.pushResult([]); // db.delete().where()

      const res = await request(app).delete(`/api/equipments/${EQ_ID}`);
      expect(res.status).toBe(204);
      expect(writeAuditSpy).toHaveBeenCalledTimes(1);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "equipments",
          action: "delete",
          recordId: EQ_ID,
          oldValues: expect.objectContaining({ isActive: true }),
        }),
      );
      expect(dbMock.db.delete).toHaveBeenCalled();
      expect(dbMock.db.update).not.toHaveBeenCalled();
    });

    it("deactivates (200) and audits action=deactivate when only historical deps", async () => {
      dbMock.pushResult([eqRow()]); // SELECT existing
      pushDepCounts([
        { historical: 5, activeOpen: 0 }, // production_entries — historical
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: 0 },
      ]);
      dbMock.pushResult([eqRow({ isActive: false })]); // UPDATE returning

      const res = await request(app).delete(`/api/equipments/${EQ_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
      expect(writeAuditSpy).toHaveBeenCalledTimes(1);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "equipments",
          action: "deactivate",
          recordId: EQ_ID,
          oldValues: expect.objectContaining({ isActive: true }),
          newValues: expect.objectContaining({ isActive: false }),
        }),
      );
      expect(dbMock.db.update).toHaveBeenCalled();
      expect(dbMock.db.delete).not.toHaveBeenCalled();
    });

    it("returns 409 with French label when active/open deps; no mutation, no audit", async () => {
      dbMock.pushResult([eqRow()]); // SELECT existing
      pushDepCounts([
        { historical: 5, activeOpen: 2 }, // production_entries — active/open
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: 0 },
      ]);

      const res = await request(app).delete(`/api/equipments/${EQ_ID}`);
      expect(res.status).toBe(409);
      expect(typeof res.body.error).toBe("string");
      expect(res.body.error).toContain("entrées de production");
      expect(writeAuditSpy).not.toHaveBeenCalled();
      expect(dbMock.db.delete).not.toHaveBeenCalled();
      expect(dbMock.db.update).not.toHaveBeenCalled();
    });

    it("returns 409 with the generic French message when db.delete races on FK (review #4)", async () => {
      dbMock.pushResult([eqRow()]); // SELECT existing
      // No deps -> hard_delete branch
      pushDepCounts([
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: 0 },
      ]);
      // FK violation lands between count and delete (concurrent insert).
      dbMock.pushReject(Object.assign(new Error("fk"), { code: "23503" }));

      const res = await request(app).delete(`/api/equipments/${EQ_ID}`);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Suppression impossible: dépendance détectée." });
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });

    it("is idempotent on already-inactive rows: returns 200 + body, no count/update/audit (review #6)", async () => {
      dbMock.pushResult([eqRow({ isActive: false })]); // SELECT existing returns inactive

      const res = await request(app).delete(`/api/equipments/${EQ_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(EQ_ID);
      expect(res.body.isActive).toBe(false);
      expect(dbMock.db.delete).not.toHaveBeenCalled();
      expect(dbMock.db.update).not.toHaveBeenCalled();
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/equipments includeInactive toggle", () => {
    it("filters to active only by default (.where called)", async () => {
      dbMock.pushResult([eqRow()]); // list query result
      const res = await request(app).get("/api/equipments");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // The default-active-only branch invokes .where on the chain.
      const whereCalls = dbMock.calls.filter((c) => c.method === "where");
      expect(whereCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("skips the active filter when includeInactive=true (no .where on the list query)", async () => {
      dbMock.pushResult([
        eqRow(),
        eqRow({ id: "00000000-0000-0000-0000-0000000000ff", isActive: false }),
      ]);
      const res = await request(app).get("/api/equipments?includeInactive=true");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      const whereCalls = dbMock.calls.filter((c) => c.method === "where");
      expect(whereCalls.length).toBe(0);
    });
  });

  describe("POST /api/equipments/:id/reactivate", () => {
    it("flips isActive=true and audits action=reactivate", async () => {
      dbMock.pushResult([eqRow({ isActive: false })]); // SELECT existing
      dbMock.pushResult([eqRow({ isActive: true })]); // UPDATE returning

      const res = await request(app).post(`/api/equipments/${EQ_ID}/reactivate`);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "equipments",
          action: "reactivate",
          recordId: EQ_ID,
          oldValues: expect.objectContaining({ isActive: false }),
          newValues: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// EQUIPMENTS — Phase 2 lifecycle additions (FEAT-001)
// ──────────────────────────────────────────────────────────────────────────
describe("equipments routes — Phase 2 lifecycle additions", () => {
  describe("PATCH /api/equipments/:id code-immutability rule", () => {
    it("returns 409 with the French immutability message when code changes AND historical > 0; no UPDATE, no audit", async () => {
      dbMock.pushResult([eqRow({ code: "EQ-001" })]); // SELECT existing
      // countDependencies: push 6 rule entries with one historical>0 to flip
      // the immutability branch.
      pushDepCounts([
        { historical: 3, activeOpen: 0 }, // production_entries — historical
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: 0 },
      ]);

      const res = await request(app).patch(`/api/equipments/${EQ_ID}`).send({ code: "NEW-CODE" });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error:
          "Le code est immuable: cet équipement est référencé par des données historiques (production, saisies journalières, arrêts, KPI ou cadences).",
      });
      expect(dbMock.db.update).not.toHaveBeenCalled();
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });

    it("still UPDATEs when code changes AND historical = 0 (regression guard)", async () => {
      dbMock.pushResult([eqRow({ code: "EQ-001" })]); // SELECT existing
      pushDepCounts([
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: 0 },
      ]);
      dbMock.pushResult([eqRow({ code: "NEW-CODE" })]); // UPDATE returning

      const res = await request(app).patch(`/api/equipments/${EQ_ID}`).send({ code: "NEW-CODE" });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe("NEW-CODE");
      expect(dbMock.db.update).toHaveBeenCalledTimes(1);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "equipments",
          action: "update",
          recordId: EQ_ID,
        }),
      );
    });

    it("does NOT invoke countDependencies for non-code field updates even if historical would be > 0", async () => {
      dbMock.pushResult([eqRow({ code: "EQ-001" })]); // SELECT existing
      // Direct spy on countDependencies (review #7) — stronger than the
      // previous db.select call-count check, which was structurally coupled
      // to internal probing reads.
      dbMock.pushResult([eqRow({ trsObjective: "90" })]); // UPDATE returning

      const res = await request(app).patch(`/api/equipments/${EQ_ID}`).send({ trsObjective: 90 });

      expect(res.status).toBe(200);
      expect(res.body.trsObjective).toBe(90);
      expect(countDependenciesSpy).not.toHaveBeenCalled();
      expect(dbMock.db.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /api/equipments room leftJoin projection", () => {
    it("includes equipmentType and roomLabel derived from joined room columns", async () => {
      // The list query now selects an explicit projection that flattens
      // the joined room columns onto the equipment row. The chainable
      // mock just resolves to whatever rows we push, so push a synthetic
      // row that mimics the projection shape.
      dbMock.pushResult([
        {
          ...eqRow({ equipmentType: "mixer", roomId: "00000000-0000-0000-0000-000000000010" }),
          siteId: null,
          updatedAt: new Date("2024-01-01T00:00:00Z"),
          roomCode: "R-01",
          roomName: "Salle 1",
        },
      ]);

      const res = await request(app).get("/api/equipments");

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].equipmentType).toBe("mixer");
      expect(res.body[0].roomId).toBe("00000000-0000-0000-0000-000000000010");
      expect(res.body[0].roomLabel).toBe("R-01 - Salle 1");
    });
  });

  describe("POST /api/equipments/:id/reactivate idempotency", () => {
    it("returns 200 with the row and does NOT UPDATE when the equipment is already active", async () => {
      dbMock.pushResult([eqRow({ isActive: true })]); // SELECT existing — already active

      const res = await request(app).post(`/api/equipments/${EQ_ID}/reactivate`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(EQ_ID);
      expect(res.body.isActive).toBe(true);
      expect(dbMock.db.update).not.toHaveBeenCalled();
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PRODUCTS
// ──────────────────────────────────────────────────────────────────────────
describe("products routes — Phase 1 contract", () => {
  describe("POST /api/products", () => {
    it("returns 409 on duplicate code (mapDbError path)", async () => {
      dbMock.pushReject(Object.assign(new Error("dup"), { code: "23505" }));
      const res = await request(app)
        .post("/api/products")
        .send({ name: "ProductA", code: "P-001" });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("existe déjà");
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/products/:id", () => {
    it("returns 409 on duplicate code", async () => {
      dbMock.pushResult([pRow()]);
      dbMock.pushReject(Object.assign(new Error("dup"), { code: "23505" }));
      const res = await request(app).patch(`/api/products/${P_ID}`).send({ code: "P-DUP" });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("existe déjà");
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/products/:id smart-delete decision tree", () => {
    it("hard-deletes (204) and audits action=delete when no deps", async () => {
      dbMock.pushResult([pRow()]);
      // 4 rules for products: production_entries, cadences, kpi_daily (no
      // activeOpen), kpi_monthly (no activeOpen).
      pushDepCounts([
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
      ]);
      dbMock.pushResult([]);

      const res = await request(app).delete(`/api/products/${P_ID}`);
      expect(res.status).toBe(204);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "products",
          action: "delete",
          recordId: P_ID,
          oldValues: expect.objectContaining({ isActive: true }),
        }),
      );
      expect(dbMock.db.delete).toHaveBeenCalled();
      expect(dbMock.db.update).not.toHaveBeenCalled();
    });

    it("deactivates (200) and audits action=deactivate when only historical deps", async () => {
      dbMock.pushResult([pRow()]);
      pushDepCounts([
        { historical: 5, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
      ]);
      dbMock.pushResult([pRow({ isActive: false })]);

      const res = await request(app).delete(`/api/products/${P_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "products",
          action: "deactivate",
          recordId: P_ID,
          oldValues: expect.objectContaining({ isActive: true }),
          newValues: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it("returns 409 with French label when active/open deps; no mutation, no audit", async () => {
      dbMock.pushResult([pRow()]);
      pushDepCounts([
        { historical: 5, activeOpen: 2 }, // production_entries — active/open
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
      ]);

      const res = await request(app).delete(`/api/products/${P_ID}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("entrées de production");
      expect(writeAuditSpy).not.toHaveBeenCalled();
      expect(dbMock.db.delete).not.toHaveBeenCalled();
      expect(dbMock.db.update).not.toHaveBeenCalled();
    });

    it("returns 409 with the generic French message when db.delete races on FK (review #4)", async () => {
      dbMock.pushResult([pRow()]);
      pushDepCounts([
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
        { historical: 0, activeOpen: -1 },
      ]);
      dbMock.pushReject(Object.assign(new Error("fk"), { code: "23503" }));

      const res = await request(app).delete(`/api/products/${P_ID}`);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Suppression impossible: dépendance détectée." });
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });

    it("is idempotent on already-inactive rows: returns 200 + body, no count/update/audit (review #6)", async () => {
      dbMock.pushResult([pRow({ isActive: false })]);

      const res = await request(app).delete(`/api/products/${P_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(P_ID);
      expect(res.body.isActive).toBe(false);
      expect(dbMock.db.delete).not.toHaveBeenCalled();
      expect(dbMock.db.update).not.toHaveBeenCalled();
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/products includeInactive toggle", () => {
    it("filters to active only by default (.where called)", async () => {
      dbMock.pushResult([pRow()]);
      const res = await request(app).get("/api/products");
      expect(res.status).toBe(200);
      const whereCalls = dbMock.calls.filter((c) => c.method === "where");
      expect(whereCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("skips the active filter when includeInactive=true (no .where on the list query)", async () => {
      dbMock.pushResult([
        pRow(),
        pRow({ id: "00000000-0000-0000-0000-0000000000ff", isActive: false }),
      ]);
      const res = await request(app).get("/api/products?includeInactive=true");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      const whereCalls = dbMock.calls.filter((c) => c.method === "where");
      expect(whereCalls.length).toBe(0);
    });
  });

  describe("POST /api/products/:id/reactivate", () => {
    it("flips isActive=true and audits action=reactivate", async () => {
      dbMock.pushResult([pRow({ isActive: false })]);
      dbMock.pushResult([pRow({ isActive: true })]);

      const res = await request(app).post(`/api/products/${P_ID}/reactivate`);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "products",
          action: "reactivate",
          recordId: P_ID,
          oldValues: expect.objectContaining({ isActive: false }),
          newValues: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DOWNTIME CATEGORIES
// ──────────────────────────────────────────────────────────────────────────
describe("downtime-categories routes — Phase 1 contract", () => {
  describe("POST /api/downtime-categories", () => {
    it("returns 409 on duplicate code (mapDbError path)", async () => {
      dbMock.pushReject(Object.assign(new Error("dup"), { code: "23505" }));
      const res = await request(app).post("/api/downtime-categories").send({
        code: "DC-001",
        label: "Panne",
        impactType: "tF",
        isPlanned: false,
        requiresComment: false,
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("existe déjà");
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/downtime-categories/:id", () => {
    it("returns 409 on duplicate code", async () => {
      dbMock.pushResult([dcRow()]);
      dbMock.pushReject(Object.assign(new Error("dup"), { code: "23505" }));
      const res = await request(app)
        .patch(`/api/downtime-categories/${DC_ID}`)
        .send({ code: "DC-DUP" });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("existe déjà");
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/downtime-categories/:id smart-delete decision tree", () => {
    it("hard-deletes (204) and audits action=delete when no deps", async () => {
      dbMock.pushResult([dcRow()]);
      // 2 rules for downtime-categories: downtime_events (with activeOpen
      // branch) + activity_downtimes (no activeOpen branch).
      pushDepCounts([
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
      ]);
      dbMock.pushResult([]);

      const res = await request(app).delete(`/api/downtime-categories/${DC_ID}`);
      expect(res.status).toBe(204);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "downtime_categories",
          action: "delete",
          recordId: DC_ID,
          oldValues: expect.objectContaining({ isActive: true }),
        }),
      );
      expect(dbMock.db.delete).toHaveBeenCalled();
      expect(dbMock.db.update).not.toHaveBeenCalled();
    });

    it("deactivates (200) and audits action=deactivate when only historical deps", async () => {
      dbMock.pushResult([dcRow()]);
      pushDepCounts([
        { historical: 7, activeOpen: 0 }, // downtime_events — historical only
        { historical: 0, activeOpen: -1 },
      ]);
      dbMock.pushResult([dcRow({ isActive: false })]);

      const res = await request(app).delete(`/api/downtime-categories/${DC_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "downtime_categories",
          action: "deactivate",
          recordId: DC_ID,
          oldValues: expect.objectContaining({ isActive: true }),
          newValues: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it("returns 409 with French label when active/open deps; no mutation, no audit", async () => {
      dbMock.pushResult([dcRow()]);
      pushDepCounts([
        { historical: 7, activeOpen: 1 }, // downtime_events — open
        { historical: 0, activeOpen: -1 },
      ]);

      const res = await request(app).delete(`/api/downtime-categories/${DC_ID}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("événements d'arrêt ouverts");
      expect(writeAuditSpy).not.toHaveBeenCalled();
      expect(dbMock.db.delete).not.toHaveBeenCalled();
      expect(dbMock.db.update).not.toHaveBeenCalled();
    });

    it("returns 409 with the generic French message when db.delete races on FK (review #4)", async () => {
      dbMock.pushResult([dcRow()]);
      pushDepCounts([
        { historical: 0, activeOpen: 0 },
        { historical: 0, activeOpen: -1 },
      ]);
      dbMock.pushReject(Object.assign(new Error("fk"), { code: "23503" }));

      const res = await request(app).delete(`/api/downtime-categories/${DC_ID}`);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Suppression impossible: dépendance détectée." });
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });

    it("is idempotent on already-inactive rows: returns 200 + body, no count/update/audit (review #6)", async () => {
      dbMock.pushResult([dcRow({ isActive: false })]);

      const res = await request(app).delete(`/api/downtime-categories/${DC_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(DC_ID);
      expect(res.body.isActive).toBe(false);
      expect(dbMock.db.delete).not.toHaveBeenCalled();
      expect(dbMock.db.update).not.toHaveBeenCalled();
      expect(writeAuditSpy).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/downtime-categories includeInactive toggle", () => {
    it("filters to active only by default (.where called)", async () => {
      dbMock.pushResult([dcRow()]);
      const res = await request(app).get("/api/downtime-categories");
      expect(res.status).toBe(200);
      const whereCalls = dbMock.calls.filter((c) => c.method === "where");
      expect(whereCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("skips the active filter when includeInactive=true (no .where on the list query)", async () => {
      dbMock.pushResult([
        dcRow(),
        dcRow({ id: "00000000-0000-0000-0000-0000000000ff", isActive: false }),
      ]);
      const res = await request(app).get("/api/downtime-categories?includeInactive=true");
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      const whereCalls = dbMock.calls.filter((c) => c.method === "where");
      expect(whereCalls.length).toBe(0);
    });
  });

  describe("POST /api/downtime-categories/:id/reactivate", () => {
    it("flips isActive=true and audits action=reactivate", async () => {
      dbMock.pushResult([dcRow({ isActive: false })]);
      dbMock.pushResult([dcRow({ isActive: true })]);

      const res = await request(app).post(`/api/downtime-categories/${DC_ID}/reactivate`);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
      expect(writeAuditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "downtime_categories",
          action: "reactivate",
          recordId: DC_ID,
          oldValues: expect.objectContaining({ isActive: false }),
          newValues: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });
});
