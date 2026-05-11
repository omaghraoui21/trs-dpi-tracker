-- Production hotfix for deployed API/schema drift.
-- Idempotent: safe to rerun.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE daily_entry_status AS ENUM ('draft', 'validated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE calendar_event_type AS ENUM ('CLOSURE', 'HOLIDAY', 'QUALIFICATION', 'TRIAL', 'CLEANING_MAJOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE calendar_event_scope AS ENUM ('SITE', 'EQUIPMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE downtime_categories
  ADD COLUMN IF NOT EXISTS famille text,
  ADD COLUMN IF NOT EXISTS is_quick_shortcut boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shortcut_equipments text;

CREATE TABLE IF NOT EXISTS calculation_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  indicator_code text NOT NULL,
  indicator_name text NOT NULL,
  formula_expression text NOT NULL,
  formula_description text,
  variables_json text,
  unit text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  validation_status text NOT NULL DEFAULT 'draft',
  change_reason text,
  created_by_id uuid REFERENCES users(id),
  validated_by_id uuid REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calculation_formula_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  formula_id uuid NOT NULL REFERENCES calculation_formulas(id),
  test_input_json text NOT NULL,
  expected_result text,
  actual_result text,
  test_status text NOT NULL DEFAULT 'pending',
  tested_by_id uuid REFERENCES users(id),
  tested_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  site_id uuid REFERENCES sites(id),
  equipment_id uuid REFERENCES equipments(id),
  product_id uuid REFERENCES products(id),
  kpi_code text NOT NULL,
  target_value numeric(8, 4) NOT NULL,
  warning_threshold numeric(8, 4),
  critical_threshold numeric(8, 4),
  valid_from date NOT NULL,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planning_activity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  activity_label text NOT NULL,
  mapped_activity_type text,
  equipment_id uuid REFERENCES equipments(id),
  room_id uuid REFERENCES rooms(id),
  default_unit text,
  is_productive boolean NOT NULL DEFAULT true,
  excluded_from_trs boolean NOT NULL DEFAULT false,
  triggers_status boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  rule_code text NOT NULL UNIQUE,
  rule_name text NOT NULL,
  condition_expression text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  threshold_value numeric(8, 4),
  target_roles text NOT NULL DEFAULT 'supervisor',
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS annual_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  site_id uuid REFERENCES sites(id),
  equipment_id uuid REFERENCES equipments(id),
  scope calendar_event_scope NOT NULL DEFAULT 'SITE',
  event_type calendar_event_type NOT NULL,
  label text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  duration_minutes_per_day integer,
  all_day boolean NOT NULL DEFAULT true,
  is_recurring_annual boolean NOT NULL DEFAULT false,
  planned_by_user_id uuid REFERENCES users(id),
  confirmed_by_user_id uuid REFERENCES users(id),
  confirmed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  site_id uuid REFERENCES sites(id),
  equipment_id uuid NOT NULL REFERENCES equipments(id),
  entry_date date NOT NULL,
  t_opening_min integer NOT NULL DEFAULT 0,
  pause_min integer NOT NULL DEFAULT 0,
  chsg_min integer NOT NULL DEFAULT 0,
  apr_min integer NOT NULL DEFAULT 0,
  mqch_min integer NOT NULL DEFAULT 0,
  notes text,
  status daily_entry_status NOT NULL DEFAULT 'draft',
  created_by_id uuid NOT NULL REFERENCES users(id),
  validated_by_id uuid REFERENCES users(id),
  validated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uq_daily_entry_equipment_date UNIQUE (equipment_id, entry_date)
);

ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS daily_entry_id uuid REFERENCES daily_entries(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS standard_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  activity_type text NOT NULL,
  equipment_id uuid REFERENCES equipments(id),
  room_id uuid REFERENCES rooms(id),
  product_id uuid REFERENCES products(id),
  standard_duration_minutes integer,
  warning_duration_minutes integer,
  critical_duration_minutes integer,
  valid_from date,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  needs_confirmation boolean NOT NULL DEFAULT true,
  validation_status text NOT NULL DEFAULT 'provisional',
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id),
  presentation_name text NOT NULL,
  presentation_type text NOT NULL,
  unit text NOT NULL,
  units_per_box integer,
  blisters_per_box integer,
  capsules_per_blister integer,
  is_combifor_component boolean NOT NULL DEFAULT false,
  is_combifor_finished_product boolean NOT NULL DEFAULT false,
  needs_confirmation boolean NOT NULL DEFAULT false,
  validation_status text NOT NULL DEFAULT 'provisional',
  comment text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assembly_boms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  parent_presentation_id uuid NOT NULL REFERENCES product_presentations(id),
  component_presentation_id uuid NOT NULL REFERENCES product_presentations(id),
  quantity_required integer NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'pochette',
  is_active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_to date,
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ace_date_from ON annual_calendar_events(date_from);
CREATE INDEX IF NOT EXISTS idx_ace_date_to ON annual_calendar_events(date_to);
CREATE INDEX IF NOT EXISTS idx_ace_event_type ON annual_calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ace_equipment ON annual_calendar_events(equipment_id);
CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_daily_entries_equipment ON daily_entries(equipment_id);
CREATE INDEX IF NOT EXISTS idx_daily_entries_status ON daily_entries(status);
CREATE INDEX IF NOT EXISTS idx_pe_daily_entry ON production_entries(daily_entry_id);
