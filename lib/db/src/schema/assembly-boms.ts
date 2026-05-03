import { pgTable, uuid, text, boolean, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productPresentationsTable } from "./product-presentations";

// Bill of Materials for Combifor assembly:
// parent_presentation (Combifor 12/200) requires
//   - component_presentation_1 (Pochette Aerofor 12) × quantity_required
//   - component_presentation_2 (Pochette Aeronide 200) × quantity_required

export const assemblyBomsTable = pgTable("assembly_boms", {
  id: uuid("id").primaryKey().defaultRandom(),

  parentPresentationId: uuid("parent_presentation_id").notNull()
    .references(() => productPresentationsTable.id),
  componentPresentationId: uuid("component_presentation_id").notNull()
    .references(() => productPresentationsTable.id),

  quantityRequired: integer("quantity_required").notNull().default(1),
  unit: text("unit").notNull().default("pochette"),

  isActive: boolean("is_active").notNull().default(true),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  comment: text("comment"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAssemblyBomSchema = createInsertSchema(assemblyBomsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertAssemblyBom = z.infer<typeof insertAssemblyBomSchema>;
export type AssemblyBom = typeof assemblyBomsTable.$inferSelect;
