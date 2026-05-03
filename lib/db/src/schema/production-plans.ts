import { pgTable, uuid, integer, text, timestamp, date, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";
import { equipmentsTable } from "./equipments";
import { roomsTable } from "./rooms";
import { productsTable } from "./products";
import { planningImportsTable, planValidationStatusEnum } from "./planning-imports";

export { planValidationStatusEnum };

export const productionPlansTable = pgTable("production_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  planningImportId: uuid("planning_import_id").references(() => planningImportsTable.id),
  siteId: uuid("site_id"),
  weekNumber: integer("week_number").notNull(),
  year: integer("year").notNull(),
  plannedDate: date("planned_date").notNull(),
  dayName: text("day_name").notNull(),
  activityType: text("activity_type").notNull(),
  team: text("team"),
  equipmentId: uuid("equipment_id").references(() => equipmentsTable.id),
  equipmentName: text("equipment_name"),
  roomId: uuid("room_id").references(() => roomsTable.id),
  roomName: text("room_name"),
  productId: uuid("product_id").references(() => productsTable.id),
  productName: text("product_name"),
  lotNumber: text("lot_number"),
  plannedQuantity: numeric("planned_quantity", { precision: 14, scale: 2 }),
  plannedUnit: text("planned_unit"),
  plannedStartTime: text("planned_start_time"),
  plannedEndTime: text("planned_end_time"),
  specialActivity: text("special_activity"),
  sourceFileName: text("source_file_name").notNull(),
  importedById: uuid("imported_by").notNull().references(() => usersTable.id),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  validationStatus: planValidationStatusEnum("validation_status").notNull().default("pending"),
  validatedById: uuid("validated_by").references(() => usersTable.id),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  validationComment: text("validation_comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_production_plans_date").on(t.plannedDate),
  index("idx_production_plans_week_year").on(t.weekNumber, t.year),
  index("idx_production_plans_equipment").on(t.equipmentId),
]);

export const insertProductionPlanSchema = createInsertSchema(productionPlansTable).omit({ id: true, importedAt: true, createdAt: true, updatedAt: true });

export type ProductionPlan = typeof productionPlansTable.$inferSelect;
export type InsertProductionPlan = typeof productionPlansTable.$inferInsert;
