import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { equipmentsTable } from "./equipments";
import { roomsTable } from "./rooms";

export const planningActivityMappingsTable = pgTable("planning_activity_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityLabel: text("activity_label").notNull(),           // raw label from Excel import
  mappedActivityType: text("mapped_activity_type"),         // production | cleaning | maintenance | off
  equipmentId: uuid("equipment_id").references(() => equipmentsTable.id),
  roomId: uuid("room_id").references(() => roomsTable.id),
  defaultUnit: text("default_unit"),                        // gélules | blisters | boites | kg
  isProductive: boolean("is_productive").notNull().default(true),
  excludedFromTrs: boolean("excluded_from_trs").notNull().default(false),
  triggersStatus: boolean("triggers_status").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlanningActivityMappingSchema = createInsertSchema(planningActivityMappingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlanningActivityMapping = z.infer<typeof insertPlanningActivityMappingSchema>;
export type PlanningActivityMapping = typeof planningActivityMappingsTable.$inferSelect;
