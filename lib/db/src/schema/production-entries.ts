import { pgTable, uuid, integer, text, timestamp, date, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { equipmentsTable } from "./equipments";
import { productsTable } from "./products";
import { roomsTable } from "./rooms";
import { sitesTable } from "./sites";
import { productionPlansTable } from "./production-plans";
import { dailyEntriesTable } from "./daily-entries";
import { productPresentationsTable } from "./product-presentations";

export const entryStatusEnum = pgEnum("entry_status", [
  "draft",
  "submitted",
  "validated",
  "rejected",
]);

export const productionEntriesTable = pgTable(
  "production_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionPlanId: uuid("production_plan_id").references(() => productionPlansTable.id),
    siteId: uuid("site_id").references(() => sitesTable.id),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipmentsTable.id),
    roomId: uuid("room_id").references(() => roomsTable.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id),
    presentationId: uuid("presentation_id").references(() => productPresentationsTable.id, {
      onDelete: "set null",
    }),
    batchNumber: text("batch_number").notNull(),
    date: date("date").notNull(),
    shift: text("shift").notNull(),
    shiftStart: text("shift_start").notNull(),
    shiftEnd: text("shift_end").notNull(),
    quantityProduced: integer("quantity_produced").notNull().default(0),
    quantityConforming: integer("quantity_conforming").notNull().default(0),
    quantityRejected: integer("quantity_rejected").notNull().default(0),
    unit: text("unit").notNull().default("unités"),
    status: entryStatusEnum("status").notNull().default("draft"),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => usersTable.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    supervisorId: uuid("supervisor_id").references(() => usersTable.id),
    supervisorComment: text("supervisor_comment"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    dailyEntryId: uuid("daily_entry_id").references(() => dailyEntriesTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_production_entries_date").on(t.date),
    index("idx_production_entries_equipment").on(t.equipmentId),
    index("idx_production_entries_product").on(t.productId),
    index("idx_production_entries_status").on(t.status),
    index("idx_production_entries_operator").on(t.operatorId),
    index("idx_pe_daily_entry").on(t.dailyEntryId),
    index("idx_pe_presentation").on(t.presentationId),
  ],
);

export const insertProductionEntrySchema = createInsertSchema(productionEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProductionEntry = z.infer<typeof insertProductionEntrySchema>;
export type ProductionEntry = typeof productionEntriesTable.$inferSelect;
