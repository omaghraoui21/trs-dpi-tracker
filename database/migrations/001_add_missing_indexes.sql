-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001 — Indexes manquants identifiés par audit
--
-- À exécuter dans Supabase SQL Editor.
-- Chaque CREATE INDEX CONCURRENTLY est non-bloquant en production.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. monthly_closures — filtrages par période (mois + année)
--    Utilisé par : GET /api/monthly-closures?year=...
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_monthly_closures_period"
  ON "monthly_closures" USING btree ("year", "month");

-- 2. cadences — lookup par equipment_id pour les calculs TRS
--    Le UK actuel est sur (product_id, equipment_id, valid_from) — bon pour
--    le lookup exact mais pas pour les scans par equipment seul.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cadences_equipment"
  ON "cadences" USING btree ("equipment_id");

-- 3. daily_entries — filtrage par equipment + date (route mensuelle)
--    Utilisé intensément par : getDailyBase() dans dashboard.ts
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_daily_entries_equipment_date"
  ON "daily_entries" USING btree ("equipment_id", "entry_date");

-- 4. production_entries — composite (date + status) pour les requêtes dashboard
--    Le dashboard filtre toujours sur date range + status simultaneously.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_production_entries_date_status"
  ON "production_entries" USING btree ("date", "status");
