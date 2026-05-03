import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { equipmentsTable } from "./equipments";
import { roomsTable } from "./rooms";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const equipmentStatusEnum = pgEnum("equipment_status", [
  "available",
  "in_production",
  "cleaning",
  "maintenance",
  "breakdown",
  "waiting",
  "blocked",
]);

export const equipmentStatusEventsTable = pgTable("equipment_status_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  equipmentId: uuid("equipment_id").notNull().references(() => equipmentsTable.id),
  roomId: uuid("room_id").references(() => roomsTable.id),
  status: equipmentStatusEnum("status").notNull(),
  productId: uuid("product_id").references(() => productsTable.id),
  lotNumber: text("lot_number"),
  activityType: text("activity_type"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => usersTable.id),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EquipmentStatusEvent = typeof equipmentStatusEventsTable.$inferSelect;
export type InsertEquipmentStatusEvent = typeof equipmentStatusEventsTable.$inferInsert;
