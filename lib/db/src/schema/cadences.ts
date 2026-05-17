import { pgTable, uuid, numeric, text, boolean, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { equipmentsTable } from "./equipments";
import { productPresentationsTable } from "./product-presentations";
import { usersTable } from "./users";

export const cadencesTable = pgTable("cadences", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => productsTable.id),
  equipmentId: uuid("equipment_id").notNull().references(() => equipmentsTable.id),
  presentationId: uuid("presentation_id").references(() => productPresentationsTable.id),
  referenceCadence: numeric("reference_cadence", { precision: 10, scale: 2 }),
  theoreticalCadence: numeric("theoretical_cadence", { precision: 10, scale: 2 }).notNull(),
  validatedCadence: numeric("validated_cadence", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("units/hour"),
  validFrom: date("valid_from").notNull().default("2025-01-01"),
  validTo: date("valid_to"),
  source: text("source"),
  isActive: boolean("is_active").notNull().default(true),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  validatedBy: uuid("validated_by").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.productId, t.equipmentId, t.validFrom)]);

export const insertCadenceSchema = createInsertSchema(cadencesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCadence = z.infer<typeof insertCadenceSchema>;
export type Cadence = typeof cadencesTable.$inferSelect;
