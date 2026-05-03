import { pgTable, uuid, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const productPresentationsTable = pgTable("product_presentations", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => productsTable.id),

  presentationName: text("presentation_name").notNull(),
  presentationType: text("presentation_type").notNull(), // 'boite' | 'pochette' | 'blister' | 'vrac'
  unit: text("unit").notNull(), // 'boite' | 'blister' | 'gelule' | 'pochette' | 'kit'

  // Conversion factors (nullable = À confirmer)
  unitsPerBox: integer("units_per_box"),           // blisters per box
  blistersPerBox: integer("blisters_per_box"),
  capsulesPerBlister: integer("capsules_per_blister"),

  // Combifor flags
  isCombiforComponent: boolean("is_combifor_component").notNull().default(false),
  isCombiforFinishedProduct: boolean("is_combifor_finished_product").notNull().default(false),

  // Admin validation state
  needsConfirmation: boolean("needs_confirmation").notNull().default(false),
  validationStatus: text("validation_status").notNull().default("provisional"), // 'provisional' | 'confirmed' | 'deprecated'

  comment: text("comment"),
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductPresentationSchema = createInsertSchema(productPresentationsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertProductPresentation = z.infer<typeof insertProductPresentationSchema>;
export type ProductPresentation = typeof productPresentationsTable.$inferSelect;
