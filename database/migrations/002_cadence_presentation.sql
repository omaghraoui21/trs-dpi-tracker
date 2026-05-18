-- Phase 1 — Cadences integrity: link cadences and production_entries to product_presentations.
-- Idempotent: safe to rerun. Already applied on prod (vbgdtvbnnqxzdsoztmwv) on 2026-05-18.

ALTER TABLE cadences
  ADD COLUMN IF NOT EXISTS presentation_id uuid REFERENCES product_presentations(id) ON DELETE SET NULL;

ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS presentation_id uuid REFERENCES product_presentations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cadences_presentation ON cadences(presentation_id);
CREATE INDEX IF NOT EXISTS idx_pe_presentation ON production_entries(presentation_id);

-- Prevent two active "current" cadences for the same (equipment, product, presentation).
-- COALESCE treats NULL presentation_id as a sentinel UUID so legacy (no-presentation) rows
-- still get uniqueness — they collapse to a single "default" cadence per (equipment, product).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cadence_active
  ON cadences (
    equipment_id,
    product_id,
    COALESCE(presentation_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_active = true AND valid_to IS NULL;
