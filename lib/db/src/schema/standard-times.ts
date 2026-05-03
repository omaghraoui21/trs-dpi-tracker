import { pgTable, uuid, text, boolean, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { equipmentsTable } from "./equipments";
import { roomsTable } from "./rooms";
import { productsTable } from "./products";

// Parametrable time standards per activity type / equipment / room / product.
// All durations in minutes.
// needsConfirmation = true means admin must validate before use in TRS calculations.

export const standardTimesTable = pgTable("standard_times", {
  id: uuid("id").primaryKey().defaultRandom(),

  activityType: text("activity_type").notNull(),
  equipmentId: uuid("equipment_id").references(() => equipmentsTable.id),
  roomId: uuid("room_id").references(() => roomsTable.id),
  productId: uuid("product_id").references(() => productsTable.id),

  standardDurationMinutes: integer("standard_duration_minutes"),
  warningDurationMinutes: integer("warning_duration_minutes"),
  criticalDurationMinutes: integer("critical_duration_minutes"),

  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  isActive: boolean("is_active").notNull().default(true),

  // If true, admin badge "À confirmer" is shown and value is not used in strict mode
  needsConfirmation: boolean("needs_confirmation").notNull().default(true),
  validationStatus: text("validation_status").notNull().default("provisional"), // 'provisional' | 'confirmed'

  comment: text("comment"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStandardTimeSchema = createInsertSchema(standardTimesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertStandardTime = z.infer<typeof insertStandardTimeSchema>;
export type StandardTime = typeof standardTimesTable.$inferSelect;
