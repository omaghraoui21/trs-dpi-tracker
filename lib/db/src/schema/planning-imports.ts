import { pgTable, uuid, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const planValidationStatusEnum = pgEnum("plan_validation_status", ["pending", "validated", "rejected"]);

export const planningImportsTable = pgTable("planning_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  weekNumber: integer("week_number").notNull(),
  year: integer("year").notNull(),
  importedById: uuid("imported_by").notNull().references(() => usersTable.id),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  validationStatus: planValidationStatusEnum("validation_status").notNull().default("pending"),
  validatedById: uuid("validated_by").references(() => usersTable.id),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  comments: text("comments"),
});

export const insertPlanningImportSchema = createInsertSchema(planningImportsTable).omit({ id: true, importedAt: true });
export type InsertPlanningImport = z.infer<typeof insertPlanningImportSchema>;
export type PlanningImport = typeof planningImportsTable.$inferSelect;
