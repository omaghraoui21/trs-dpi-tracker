import {
  pgTable, uuid, text, boolean, integer, timestamp, pgEnum, index
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sitesTable } from "./sites";
import { roomsTable } from "./rooms";
import { equipmentsTable } from "./equipments";
import { productsTable } from "./products";
import { usersTable } from "./users";
import { planningImportsTable } from "./planning-imports";

// ─── Enums ────────────────────────────────────────────────

export const activityTypeEnum = pgEnum("activity_type", [
  "production",
  "nettoyage_local",
  "nettoyage_equipement",
  "nettoyage_complet",
  "nettoyage_majeur",
  "changement_serie",
  "maintenance_preventive",
  "maintenance_corrective",
  "qualification",
  "calibration",
  "attente_matiere",
  "attente_qualite",
  "attente_maintenance",
  "hors_production",
  "jour_off",
]);

export const activityFamilyEnum = pgEnum("activity_family", [
  "productive",
  "planned_non_productive",
  "unplanned_non_productive",
  "quality",
  "maintenance",
  "cleaning",
  "planning_gap",
]);

export const activityStatusEnum = pgEnum("activity_status", [
  "planned",
  "ready",
  "in_progress",
  "paused",
  "completed",
  "delayed",
  "blocked",
  "cancelled",
  "validated",
  "rejected",
]);

export const activitySourceEnum = pgEnum("activity_source", [
  "manual",
  "planning_import",
  "system",
]);

export const planningOriginEnum = pgEnum("planning_origin", [
  "planned",
  "unplanned",
]);

// ─── Table ────────────────────────────────────────────────

export const activitiesTable = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Localisation
  siteId: uuid("site_id").references(() => sitesTable.id),
  roomId: uuid("room_id").references(() => roomsTable.id),
  equipmentId: uuid("equipment_id").references(() => equipmentsTable.id),

  // Classification
  activityType: activityTypeEnum("activity_type").notNull(),
  activityFamily: activityFamilyEnum("activity_family").notNull(),
  title: text("title").notNull(),
  description: text("description"),

  // Temporal — full datetime for multi-day support
  plannedStartDatetime: timestamp("planned_start_datetime", { withTimezone: true }).notNull(),
  plannedEndDatetime: timestamp("planned_end_datetime", { withTimezone: true }).notNull(),
  actualStartDatetime: timestamp("actual_start_datetime", { withTimezone: true }),
  actualEndDatetime: timestamp("actual_end_datetime", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),

  // Planning origin
  plannedOrUnplanned: planningOriginEnum("planned_or_unplanned").notNull().default("planned"),
  productive: boolean("productive").notNull().default(false),
  impactsTrs: boolean("impacts_trs").notNull().default(true),
  impactsPlanning: boolean("impacts_planning").notNull().default(true),

  // Production data (nullable for non-production activities)
  productId: uuid("product_id").references(() => productsTable.id),
  lotNumber: text("lot_number"),
  plannedQuantity: integer("planned_quantity"),
  actualQuantity: integer("actual_quantity").default(0),
  goodQuantity: integer("good_quantity").default(0),
  rejectedQuantity: integer("rejected_quantity").default(0),
  unit: text("unit"),

  // Workflow
  status: activityStatusEnum("status").notNull().default("planned"),
  source: activitySourceEnum("source").notNull().default("manual"),
  sourcePlanningImportId: uuid("source_planning_import_id").references(() => planningImportsTable.id),

  // People
  createdBy: uuid("created_by").references(() => usersTable.id),
  operatorId: uuid("operator_id").references(() => usersTable.id),
  supervisorId: uuid("supervisor_id").references(() => usersTable.id),
  supervisorComment: text("supervisor_comment"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_activities_planned_start").on(t.plannedStartDatetime),
  index("idx_activities_planned_end").on(t.plannedEndDatetime),
  index("idx_activities_equipment").on(t.equipmentId),
  index("idx_activities_status").on(t.status),
  index("idx_activities_operator").on(t.operatorId),
  index("idx_activities_type").on(t.activityType),
]);

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
