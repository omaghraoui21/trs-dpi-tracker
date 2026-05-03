CREATE TYPE "public"."role" AS ENUM('operator', 'supervisor', 'admin');
CREATE TYPE "public"."impact_type" AS ENUM('tO', 'tR', 'tF', 'tN', 'tU', 'TQ');
CREATE TYPE "public"."plan_validation_status" AS ENUM('pending', 'validated', 'rejected');
CREATE TYPE "public"."entry_status" AS ENUM('draft', 'submitted', 'validated', 'rejected');
CREATE TYPE "public"."downtime_event_severity" AS ENUM('low', 'medium', 'high', 'critical');
CREATE TYPE "public"."downtime_event_status" AS ENUM('open', 'closed');
CREATE TYPE "public"."equipment_status" AS ENUM('available', 'in_production', 'cleaning', 'maintenance', 'breakdown', 'waiting', 'blocked');
CREATE TYPE "public"."notification_severity" AS ENUM('info', 'warning', 'critical');
CREATE TYPE "public"."notification_status" AS ENUM('open', 'acknowledged', 'closed');
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);

CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_code_unique" UNIQUE("code")
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"full_name" text,
	"department" text,
	"role" "role" DEFAULT 'operator' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"dosage" text,
	"pharmaceutical_form" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);

CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"room_type" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "equipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"room_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"equipment_type" text,
	"description" text,
	"trs_objective" numeric(5, 2) DEFAULT '75' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipments_code_unique" UNIQUE("code")
);

CREATE TABLE "downtime_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"impact_type" "impact_type" NOT NULL,
	"impact_kpi" text,
	"is_planned" boolean DEFAULT false NOT NULL,
	"requires_comment" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "downtime_categories_code_unique" UNIQUE("code")
);

CREATE TABLE "cadences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"reference_cadence" numeric(10, 2),
	"theoretical_cadence" numeric(10, 2) NOT NULL,
	"validated_cadence" numeric(10, 2) NOT NULL,
	"unit" text DEFAULT 'units/hour' NOT NULL,
	"valid_from" date DEFAULT '2025-01-01' NOT NULL,
	"valid_to" date,
	"source" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cadences_product_id_equipment_id_valid_from_unique" UNIQUE("product_id","equipment_id","valid_from")
);

CREATE TABLE "planning_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text,
	"week_number" integer NOT NULL,
	"year" integer NOT NULL,
	"imported_by" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validation_status" "plan_validation_status" DEFAULT 'pending' NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"comments" text
);

CREATE TABLE "production_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planning_import_id" uuid,
	"site_id" uuid,
	"week_number" integer NOT NULL,
	"year" integer NOT NULL,
	"planned_date" date NOT NULL,
	"day_name" text NOT NULL,
	"activity_type" text NOT NULL,
	"team" text,
	"equipment_id" uuid,
	"equipment_name" text,
	"room_id" uuid,
	"room_name" text,
	"product_id" uuid,
	"product_name" text,
	"lot_number" text,
	"planned_quantity" numeric(14, 2),
	"planned_unit" text,
	"planned_start_time" text,
	"planned_end_time" text,
	"special_activity" text,
	"source_file_name" text NOT NULL,
	"imported_by" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validation_status" "plan_validation_status" DEFAULT 'pending' NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"validation_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "production_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_plan_id" uuid,
	"site_id" uuid,
	"equipment_id" uuid NOT NULL,
	"room_id" uuid,
	"product_id" uuid NOT NULL,
	"batch_number" text NOT NULL,
	"date" date NOT NULL,
	"shift" text NOT NULL,
	"shift_start" text NOT NULL,
	"shift_end" text NOT NULL,
	"quantity_produced" integer DEFAULT 0 NOT NULL,
	"quantity_conforming" integer DEFAULT 0 NOT NULL,
	"quantity_rejected" integer DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'unités' NOT NULL,
	"status" "entry_status" DEFAULT 'draft' NOT NULL,
	"operator_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"supervisor_id" uuid,
	"supervisor_comment" text,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "downtime_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"equipment_id" uuid,
	"room_id" uuid,
	"category_id" uuid NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"comment" text,
	"severity" "downtime_event_severity" DEFAULT 'medium' NOT NULL,
	"status" "downtime_event_status" DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "equipment_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"room_id" uuid,
	"status" "equipment_status" NOT NULL,
	"product_id" uuid,
	"lot_number" text,
	"activity_type" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_by" uuid,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "room_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"status" text NOT NULL,
	"activity_type" text,
	"product_id" uuid,
	"lot_number" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_by" uuid,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"site_id" uuid,
	"equipment_id" uuid,
	"room_id" uuid,
	"product_id" uuid,
	"lot_number" text,
	"message" text NOT NULL,
	"status" "notification_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"closure_comment" text
);

CREATE TABLE "monthly_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"equipment_id" uuid,
	"status" text DEFAULT 'closed' NOT NULL,
	"locked_by_id" uuid NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"comment" text
);

CREATE TABLE "kpi_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"equipment_id" uuid NOT NULL,
	"product_id" uuid,
	"date" date NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"week_number" integer NOT NULL,
	"planned_quantity" numeric(14, 2),
	"produced_quantity" numeric(14, 2),
	"good_quantity" numeric(14, 2),
	"rejected_quantity" numeric(14, 2),
	"t_t" numeric(10, 2),
	"t_o" numeric(10, 2),
	"t_r" numeric(10, 2),
	"t_f" numeric(10, 2),
	"t_n" numeric(10, 2),
	"t_u" numeric(10, 2),
	"do_rate" numeric(7, 6),
	"tp_rate" numeric(7, 6),
	"tq_rate" numeric(7, 6),
	"trs" numeric(7, 6),
	"trg" numeric(7, 6),
	"tre" numeric(7, 6),
	"planning_adherence_rate" numeric(7, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_daily_equipment_id_product_id_date_unique" UNIQUE("equipment_id","product_id","date")
);

CREATE TABLE "kpi_monthly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"equipment_id" uuid NOT NULL,
	"product_id" uuid,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"planned_quantity" numeric(14, 2),
	"produced_quantity" numeric(14, 2),
	"good_quantity" numeric(14, 2),
	"rejected_quantity" numeric(14, 2),
	"t_t_total" numeric(12, 2),
	"t_o_total" numeric(12, 2),
	"t_r_total" numeric(12, 2),
	"t_f_total" numeric(12, 2),
	"t_n_total" numeric(12, 2),
	"t_u_total" numeric(12, 2),
	"do_rate" numeric(7, 6),
	"tp_rate" numeric(7, 6),
	"tq_rate" numeric(7, 6),
	"trs" numeric(7, 6),
	"trg" numeric(7, 6),
	"tre" numeric(7, 6),
	"planning_adherence_rate" numeric(7, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_monthly_equipment_id_product_id_year_month_unique" UNIQUE("equipment_id","product_id","year","month")
);

CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"action" text NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "cadences" ADD CONSTRAINT "cadences_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "cadences" ADD CONSTRAINT "cadences_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "planning_imports" ADD CONSTRAINT "planning_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "planning_imports" ADD CONSTRAINT "planning_imports_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_planning_import_id_planning_imports_id_fk" FOREIGN KEY ("planning_import_id") REFERENCES "public"."planning_imports"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_production_plan_id_production_plans_id_fk" FOREIGN KEY ("production_plan_id") REFERENCES "public"."production_plans"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "downtime_events" ADD CONSTRAINT "downtime_events_entry_id_production_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."production_entries"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "downtime_events" ADD CONSTRAINT "downtime_events_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "downtime_events" ADD CONSTRAINT "downtime_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "downtime_events" ADD CONSTRAINT "downtime_events_category_id_downtime_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."downtime_categories"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "downtime_events" ADD CONSTRAINT "downtime_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "downtime_events" ADD CONSTRAINT "downtime_events_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "equipment_status_events" ADD CONSTRAINT "equipment_status_events_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "equipment_status_events" ADD CONSTRAINT "equipment_status_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "equipment_status_events" ADD CONSTRAINT "equipment_status_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "equipment_status_events" ADD CONSTRAINT "equipment_status_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "room_status_events" ADD CONSTRAINT "room_status_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "room_status_events" ADD CONSTRAINT "room_status_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "room_status_events" ADD CONSTRAINT "room_status_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "monthly_closures" ADD CONSTRAINT "monthly_closures_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "monthly_closures" ADD CONSTRAINT "monthly_closures_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "monthly_closures" ADD CONSTRAINT "monthly_closures_locked_by_id_users_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "kpi_daily" ADD CONSTRAINT "kpi_daily_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "kpi_daily" ADD CONSTRAINT "kpi_daily_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "kpi_daily" ADD CONSTRAINT "kpi_daily_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "kpi_monthly" ADD CONSTRAINT "kpi_monthly_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "kpi_monthly" ADD CONSTRAINT "kpi_monthly_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "kpi_monthly" ADD CONSTRAINT "kpi_monthly_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "idx_production_plans_date" ON "production_plans" USING btree ("planned_date");
CREATE INDEX "idx_production_plans_week_year" ON "production_plans" USING btree ("week_number","year");
CREATE INDEX "idx_production_plans_equipment" ON "production_plans" USING btree ("equipment_id");
CREATE INDEX "idx_production_entries_date" ON "production_entries" USING btree ("date");
CREATE INDEX "idx_production_entries_equipment" ON "production_entries" USING btree ("equipment_id");
CREATE INDEX "idx_production_entries_product" ON "production_entries" USING btree ("product_id");
CREATE INDEX "idx_production_entries_status" ON "production_entries" USING btree ("status");
CREATE INDEX "idx_production_entries_operator" ON "production_entries" USING btree ("operator_id");
CREATE INDEX "idx_downtime_events_entry" ON "downtime_events" USING btree ("entry_id");
CREATE INDEX "idx_downtime_events_category" ON "downtime_events" USING btree ("category_id");
CREATE INDEX "idx_notifications_status" ON "notifications" USING btree ("status");
CREATE INDEX "idx_notifications_severity" ON "notifications" USING btree ("severity");
CREATE INDEX "idx_notifications_equipment" ON "notifications" USING btree ("equipment_id");
CREATE INDEX "idx_audit_log_table_record" ON "audit_log" USING btree ("table_name","record_id");
CREATE INDEX "idx_audit_log_user" ON "audit_log" USING btree ("user_id");
CREATE INDEX "idx_audit_log_created" ON "audit_log" USING btree ("created_at");