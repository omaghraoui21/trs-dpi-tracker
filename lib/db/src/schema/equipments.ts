import { pgTable, uuid, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sitesTable } from "./sites";
import { roomsTable } from "./rooms";

export const equipmentsTable = pgTable("equipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").references(() => sitesTable.id),
  roomId: uuid("room_id").references(() => roomsTable.id),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  equipmentType: text("equipment_type"),
  description: text("description"),
  trsObjective: numeric("trs_objective", { precision: 5, scale: 2 }).notNull().default("75"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEquipmentSchema = createInsertSchema(equipmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipmentsTable.$inferSelect;
