-- Phase 3 — Generic key/value store for global app settings.
-- Idempotent: safe to rerun.
-- First use: store the default operator cycle phase order (key = 'operator_cycle_default_order').

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the default cycle order if not already present.
INSERT INTO app_settings (key, value)
VALUES (
  'operator_cycle_default_order',
  '{"order":["VIDE_LIGNE","REMPLISSAGE","LOT","NETTOYAGE","DESINFECTION"]}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
