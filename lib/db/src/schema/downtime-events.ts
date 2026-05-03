import { pgTable, uuid, integer, text, boolean, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productionEntriesTable } from "./production-entries";
import { downtimeCategoriesTable } from "./downtime-categories";
import { equipmentsTable } from "./equipments";
import { roomsTable } from "./rooms";
import { usersTable } from "./users";

export const downtimeEventStatusEnum = pgEnum("downtime_event_status", ["open", "closed"]);
export const downtimeEventSeverityEnum = pgEnum("downtime_event_severity", ["low", "medium", "high", "critical"]);

export const downtimeEventsTable = pgTable("downtime_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id").notNull().references(() => productionEntriesTable.id, { onDelete: "cascade" }),
  equipmentId: uuid("equipment_id").references(() => equipmentsTable.id),
  roomId: uuid("room_id").references(() => roomsTable.id),
  categoryId: uuid("category_id").notNull().references(() => downtimeCategoriesTable.id),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  comment: text("comment"),
  severity: downtimeEventSeverityEnum("severity").notNull().default("medium"),
  status: downtimeEventStatusEnum("status").notNull().default("open"),
  createdBy: uuid("created_by").references(() => usersTable.id),
  closedBy: uuid("closed_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  isDeleted: boolean("is_deleted").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_downtime_events_entry").on(t.entryId),
  index("idx_downtime_events_category").on(t.categoryId),
]);

export const insertDowntimeEventSchema = createInsertSchema(downtimeEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDowntimeEvent = z.infer<typeof insertDowntimeEventSchema>;
export type DowntimeEvent = typeof downtimeEventsTable.$inferSelect;
