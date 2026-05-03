import {
  pgTable, uuid, text, boolean, integer, timestamp, index
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { activitiesTable } from "./activities";
import { downtimeCategoriesTable } from "./downtime-categories";
import { usersTable } from "./users";

// Quick-type labels used by the simplified UI
// (stored as free text — user picks from preset list)

export const activityDowntimesTable = pgTable("activity_downtimes", {
  id: uuid("id").primaryKey().defaultRandom(),

  activityId: uuid("activity_id").notNull().references(() => activitiesTable.id),
  categoryId: uuid("category_id").references(() => downtimeCategoriesTable.id),

  // Quick type label (preset button: "Panne", "Nettoyage supplémentaire", …)
  quickType: text("quick_type"),

  // Start/end as full timestamps for multi-day downtimes
  startDatetime: timestamp("start_datetime", { withTimezone: true }).notNull(),
  endDatetime: timestamp("end_datetime", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),

  comment: text("comment"),
  severity: text("severity").notNull().default("medium"),
  isDeleted: boolean("is_deleted").notNull().default(false),

  createdBy: uuid("created_by").references(() => usersTable.id),
  closedBy: uuid("closed_by").references(() => usersTable.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_activity_downtimes_activity").on(t.activityId),
]);

export const insertActivityDowntimeSchema = createInsertSchema(activityDowntimesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertActivityDowntime = z.infer<typeof insertActivityDowntimeSchema>;
export type ActivityDowntime = typeof activityDowntimesTable.$inferSelect;
