import { pgTable, uuid, text, numeric, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sitesTable } from "./sites";
import { equipmentsTable } from "./equipments";
import { productsTable } from "./products";

export const kpiTargetsTable = pgTable("kpi_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").references(() => sitesTable.id),
  equipmentId: uuid("equipment_id").references(() => equipmentsTable.id),
  productId: uuid("product_id").references(() => productsTable.id),
  kpiCode: text("kpi_code").notNull(),       // TRS | DO | TP | TQ | TRG | TRE | PLANNING
  targetValue: numeric("target_value", { precision: 8, scale: 4 }).notNull(),
  warningThreshold: numeric("warning_threshold", { precision: 8, scale: 4 }),
  criticalThreshold: numeric("critical_threshold", { precision: 8, scale: 4 }),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertKpiTargetSchema = createInsertSchema(kpiTargetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKpiTarget = z.infer<typeof insertKpiTargetSchema>;
export type KpiTarget = typeof kpiTargetsTable.$inferSelect;
