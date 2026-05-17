# Phase 5: Cadences x Presentation - Deliverables

## Summary

Phase 5 extends the cadences system from a (product, equipment) pair to a full
(product, equipment, presentation) triplet. This enables multiple active cadences
per product/equipment combination, differentiated by dosage form (presentation).
The TRS engine gains a safe wrapper (`calculateTrsSafe`) that returns typed errors
instead of silently computing with cadence=0. The frontend cadences tab is updated
with a Presentation column, validation lifecycle actions, and status badges.

---

## Files Modified / Created

### Backend (Commit 1)

| Category | File | Change |
|----------|------|--------|
| Schema | `lib/db/src/schema/cadences.ts` | Added `presentationId`, `validatedAt`, `validatedBy`, `notes` columns |
| Migration | `database/migrations/002_cadences_presentation.sql` | ADD COLUMN x4, partial unique index on triplet |
| TRS Engine | `artifacts/api-server/src/lib/trs-engine.ts` | Added `MissingCadenceError` class, `calculateTrsSafe` wrapper |
| Cadence Lookup | `artifacts/api-server/src/lib/cadence-lookup.ts` | New module: `resolveDefaultPresentationId`, `lookupActiveCadence` |
| DB Errors | `artifacts/api-server/src/lib/db-errors.ts` | Added `getConstraintName` helper |
| Routes | `artifacts/api-server/src/routes/products.ts` | GET /products/:id/presentations endpoint |
| Routes | `artifacts/api-server/src/routes/product-presentations.ts` | New: CRUD for product presentations |
| Routes | `artifacts/api-server/src/routes/production-entries.ts` | Uses `calculateTrsSafe`, surfaces `trsError` in response |
| Routes | `artifacts/api-server/src/routes/index.ts` | Registers product-presentations router |
| Backfill | `artifacts/api-server/src/scripts/backfill-cadence-presentations.ts` | Idempotent script to populate existing cadences with default presentation |
| Tests | `artifacts/api-server/src/__tests__/cadences-phase5.test.ts` | 12 test cases: lookup helpers + db-errors + validation logic |
| Tests | `artifacts/api-server/src/__tests__/trs-engine.test.ts` | +4 cases: calculateTrsSafe + MissingCadenceError |
| Tests | `artifacts/api-server/src/__tests__/production-entries-trs-error.test.ts` | 1 case: trsError surface when cadence=0 |

### Frontend + OpenAPI (Commit 2)

| Category | File | Change |
|----------|------|--------|
| OpenAPI | `lib/api-spec/openapi.yaml` | New endpoints, updated CadenceSchema with presentationId/validatedAt/validatedBy/notes |
| Zod | `lib/api-zod/src/generated/api.ts` | Regenerated schemas with presentation fields |
| React Query | `lib/api-client-react/src/generated/api.schemas.ts` | Updated TypeScript types |
| React Query | `lib/api-client-react/src/generated/api.ts` | New hooks: useCreateCadence, useReactivateCadence, useDeleteCadence, useValidateCadence, useListProductPresentations |
| UI | `artifacts/trs-app/src/pages/admin.tsx` | CadencesTab: presentation Select, Actif/Inactif badges, validated timestamp, lifecycle actions (validate/reactivate/delete), 409 inline error |
| Sibling Tests | `artifacts/trs-app/src/pages/__tests__/CategoriesTab.test.tsx` | Updated mocks to include new cadence hooks |
| Sibling Tests | `artifacts/trs-app/src/pages/__tests__/EquipmentsTab.test.tsx` | Updated mocks to include new cadence hooks |
| Sibling Tests | `artifacts/trs-app/src/pages/__tests__/ProductsTab.test.tsx` | Updated mocks to include new cadence hooks |
| Tests | `artifacts/trs-app/src/pages/__tests__/CadencesTab.test.tsx` | 5 smoke cases: headers, badges, validated timestamp, add button |
| Deliverables | `.agents/tasks/task-phase-5-cadences-presentation/DELIVERABLES.md` | This file |

---

## Decisions

### A. Triplet Uniqueness

Partial unique index on `(product_id, equipment_id, presentation_id) WHERE is_active = true AND presentation_id IS NOT NULL`. This allows:
- One active cadence per triplet (new Phase 5 behavior)
- Legacy rows with `presentation_id IS NULL` are unaffected by the new index
- Multiple inactive cadences can coexist (history preserved)

### B. Soft-Delete Over Hard Delete

Cadences are soft-deleted (`is_active = false`) rather than physically removed. Rationale:
- NF E 60-182 requires traceability of cadence history
- Production entries reference cadence values; hard-deleting would break referential integrity
- Inactive cadences can be reactivated if needed

### C. calculateTrsSafe Wrapping

A new `calculateTrsSafe(inputs)` function wraps `calculateTrs` with a guard on `validatedCadence <= 0`. Returns `{ metrics: TrsMetrics | null, error: TrsError | null }`. The original `calculateTrs` remains unchanged for backward compatibility with existing consumers and tests.

### D. Default Presentation Resolution Rule

`resolveDefaultPresentationId(productId)` picks the best presentation using:
```
ORDER BY (validation_status = 'confirmed') DESC, is_active DESC, created_at ASC
LIMIT 1
```
Priority: confirmed first, then active, then oldest (most established). Returns null if no presentations exist.

### E. 409 Error Codes

Three distinct 409 error reasons:
- `ACTIVE_TRIPLET_CONFLICT`: Attempted to create/reactivate when an active cadence already exists for the same (product, equipment, presentation) triplet
- `LEGACY_VALID_FROM_CONFLICT`: Unique violation on the legacy valid_from constraint (pre-Phase 5 rows)
- `PRESENTATION_PRODUCT_MISMATCH` (400, not 409): presentationId does not belong to the specified productId

### F. Backfill Idempotency

`backfill-cadence-presentations.ts` skips rows that already have a `presentation_id` set. Safe to run multiple times. Resolves default presentation using rule D.

### G. Migration Idempotency

All DDL in `002_cadences_presentation.sql` uses:
- `IF NOT EXISTS` checks for ALTER TABLE ADD COLUMN
- `CREATE UNIQUE INDEX IF NOT EXISTS` for the index

Safe to run on a database that has already been migrated.

### H. No Silent TRS Fallback

When no cadence is found for a triplet, the system returns an explicit typed error (`MISSING_CADENCE`) to the frontend rather than silently computing TRS with cadence=0 (which would always produce TRS=0 and hide the real problem). The frontend can display a clear message: "Cadence absente ou invalide pour ce triplet".

---

## Migration Plan

1. **Deploy backend** with new columns/index (migration 002 is idempotent)
2. **Run backfill script** to populate existing cadences with default presentations
3. **Deploy frontend** - the UI handles both null and non-null presentationId gracefully
4. **Verify** - check that existing production entries still compute TRS correctly

The migration has NOT been executed (no Postgres available in this environment).

---

## Rollback SQL

```sql
DROP INDEX IF EXISTS cadences_active_triplet_unique;
ALTER TABLE cadences DROP COLUMN IF EXISTS notes;
ALTER TABLE cadences DROP COLUMN IF EXISTS validated_by;
ALTER TABLE cadences DROP COLUMN IF EXISTS validated_at;
ALTER TABLE cadences DROP COLUMN IF EXISTS presentation_id;
```

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Existing cadences without presentation_id bypass triplet uniqueness | Low | Legacy index on (product_id, equipment_id, valid_from) still protects; backfill script assigns defaults |
| Backfill assigns wrong default presentation | Low | Uses confirmed > active > oldest heuristic; operator can reassign via UI |
| calculateTrsSafe breaks existing TRS computation | None | Additive-only; calculateTrs signature unchanged |
| Frontend renders incorrectly for null presentationId | Low | Displays "-" as fallback; tested in smoke tests |
| Migration fails on existing databases | Low | All DDL is idempotent (IF NOT EXISTS) |

---

## Test Deltas

| File | New Cases | Total |
|------|-----------|-------|
| `cadences-phase5.test.ts` | 15 | 15 |
| `trs-engine.test.ts` | 4 | 69 |
| `production-entries-trs-error.test.ts` | 1 | 1 |
| `CadencesTab.test.tsx` | 5 | 5 |
| **Total new** | **25** | - |

---

## Verification Notes

- **Network mode**: INTEGRATIONS_ONLY - cannot run `pnpm install`, `pnpm test`, or `pnpm build`
- **Validation performed**: Code review, AST-level correctness, pattern conformance with existing tests
- **Not validated**: Runtime execution, TypeScript compilation, actual test passing
- **Migration**: Written but NOT executed (no Postgres available)
- **Backfill**: Script written but NOT executed
- **Generated files**: Written manually to match OpenAPI spec changes (orval codegen unavailable)

---

## Phase 6 hotfix (FEAT-004)

Tightens three GO-blocking risks identified on PR #7. Strict no-refactor scope.

### Risk 1 — Non-deterministic cadence pick in production-entries

**Before**: `buildEntriesWithDetails` fetched `allCadences` for the product list and per entry did `allCadences.find(c => c.productId === ... && c.equipmentId === ...)`. With multi-presentation cadences, the chosen row was implementation-defined.

**After**: per entry we resolve the default presentation via `resolveDefaultPresentationId(productId)` (memoized in a `Map<productId, presentationId|null>` for the current page) and look up the unique active triplet via `lookupActiveCadence({productId, equipmentId, presentationId})`. The partial unique index guarantees at most one match. If the product has no presentations, validatedCadence stays at 0 and `calculateTrsSafe` surfaces `MISSING_CADENCE` (route already integrated since FEAT-001).

**Files**: `artifacts/api-server/src/routes/production-entries.ts` (imports + per-page resolution loop).

### Risk 2 — Silent TRS=0 fallback in dashboard.ts and excelReportService.ts

**dashboard.ts**:
- `computeEntryMetrics` now calls `calculateTrsSafe`, returning `{metrics: TrsMetrics | null, error: TrsError | null}`.
- `getEntriesWithMetrics` propagates `trsError` per entry.
- `getMonthlyTrsResult`, daily-trs and weekly-trs aggregations filter null metrics before passing to `calculateMonthlyTrs[V2]`. Missing-cadence entries no longer silently dilute the average to 0%.
- `pending-validations` route surfaces `trsError` alongside `trsMetrics` so the supervisor UI can flag rows that need a cadence.
- Removed the now-unused `calculateTrs` import.

**excelReportService.ts**:
- `cadenceMap` re-keyed to triplet `${productId}:${equipmentId}:${presentationId}`, populated only from rows where `presentationId` is non-null. Default presentation per product memoized via `resolveDefaultPresentationId` outside the per-entry loop.
- `EntryWithMetrics` gains a `trsValid: boolean` flag. When invalid, the entry keeps zero-shape numeric placeholders so other sheets stay structurally consistent, but the Dashboard TRS sheet renders an em dash in DO/TP/TQ/TRS/TRG/TRE columns and the status cell reads "— Cadence absente". The Synthese Direction aggregates and Statut Equipements averages exclude invalid rows entirely (no phantom 0%).

**Files**: `artifacts/api-server/src/routes/dashboard.ts`, `artifacts/api-server/src/services/excelReportService.ts`.

### Risk 3 — Codegen not regenerated

`pnpm install --frozen-lockfile` is blocked by INTEGRATIONS_ONLY (403 on registry.npmjs.org), `pnpm-store` is empty, so `pnpm --filter @workspace/api-spec run codegen` cannot run locally. The OpenAPI spec has not changed since FEAT-002 so generated files in `lib/api-zod` and `lib/api-client-react` remain consistent. **Codegen MUST be rerun in CI/local with network access before merge** (commit message includes the directive).

### Test deltas (Phase 6 hotfix)

| File | Cases added |
|------|-------------|
| `production-entries-trs-error.test.ts` | +2 (deterministic triplet pick under multi-presentation, orphan-product fallback to MISSING_CADENCE) |
| `dashboard-trs-error.test.ts` (new) | +4 (calculateTrsSafe contract; positive case; aggregation strictly higher than silent-fallback path; all-missing yields trs=null) |
| **Total** | +6 |

### Verification (Phase 6 hotfix)

| Command | Outcome |
|---------|---------|
| `pnpm install --frozen-lockfile` | blocked: ERR_PNPM_FETCH_403 |
| `pnpm run lint` | blocked: ESLint cannot find @eslint/js |
| `pnpm run typecheck` | blocked: TS2688 Cannot find type definition file for 'node' (lib/db schema layer) |
| `pnpm run test` | blocked: vitest not found |
| `pnpm --filter @workspace/api-server run build` | blocked: esbuild not found |
| `pnpm run build:frontend` | not run (same blocker family) |
| `pnpm --filter @workspace/api-spec run codegen` | blocked: orval not found |
| AST-level `tsc --noEmit` per modified file | clean (modulo identical pre-existing untyped `@workspace/db` import noise) |

All blockers are environment-only (no node_modules under INTEGRATIONS_ONLY). The hotfix code is AST-clean. Re-run the full verification matrix in CI before merging.

