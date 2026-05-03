import { pgTable, uuid, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { equipmentsTable } from "./equipments";
import { sitesTable } from "./sites";

export const monthlyClosuresTable = pgTable("monthly_closures", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").references(() => sitesTable.id),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  equipmentId: uuid("equipment_id").references(() => equipmentsTable.id),
  status: text("status").notNull().default("closed"),
  lockedById: uuid("locked_by_id").notNull().references(() => usersTable.id),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  comment: text("comment"),
});

export const insertMonthlyClosureSchema = createInsertSchema(monthlyClosuresTable).omit({ id: true, lockedAt: true });
export type InsertMonthlyClosure = z.infer<typeof insertMonthlyClosureSchema>;
export type MonthlyClosure = typeof monthlyClosuresTable.$inferSelect;
