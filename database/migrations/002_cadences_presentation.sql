-- Migration: Add presentation support to cadences table
-- Phase 5: Cadences x Presentation triplet
-- Idempotent: safe to run multiple times

-- Add presentation_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cadences' AND column_name = 'presentation_id'
  ) THEN
    ALTER TABLE cadences ADD COLUMN presentation_id UUID REFERENCES product_presentations(id);
  END IF;
END $$;

-- Add validated_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cadences' AND column_name = 'validated_at'
  ) THEN
    ALTER TABLE cadences ADD COLUMN validated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add validated_by column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cadences' AND column_name = 'validated_by'
  ) THEN
    ALTER TABLE cadences ADD COLUMN validated_by UUID REFERENCES users(id);
  END IF;
END $$;

-- Add notes column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cadences' AND column_name = 'notes'
  ) THEN
    ALTER TABLE cadences ADD COLUMN notes TEXT;
  END IF;
END $$;

-- Partial unique index: only one active cadence per (product, equipment, presentation)
-- where presentation_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS cadences_active_triplet_unique
  ON cadences(product_id, equipment_id, presentation_id)
  WHERE is_active = true AND presentation_id IS NOT NULL;

-- ============================================================================
-- ROLLBACK (commented out - uncomment to reverse this migration)
-- ============================================================================
-- DROP INDEX IF EXISTS cadences_active_triplet_unique;
-- ALTER TABLE cadences DROP COLUMN IF EXISTS notes;
-- ALTER TABLE cadences DROP COLUMN IF EXISTS validated_by;
-- ALTER TABLE cadences DROP COLUMN IF EXISTS validated_at;
-- ALTER TABLE cadences DROP COLUMN IF EXISTS presentation_id;
