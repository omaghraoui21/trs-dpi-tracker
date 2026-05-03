import { pgTable, uuid, numeric, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { sitesTable } from "./sites";
import { equipmentsTable } from "./equipments";
import { productsTable } from "./products";

export const kpiMonthlyTable = pgTable("kpi_monthly", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").references(() => sitesTable.id),
  equipmentId: uuid("equipment_id").notNull().references(() => equipmentsTable.id),
  productId: uuid("product_id").references(() => productsTable.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  plannedQuantity: numeric("planned_quantity", { precision: 14, scale: 2 }),
  producedQuantity: numeric("produced_quantity", { precision: 14, scale: 2 }),
  goodQuantity: numeric("good_quantity", { precision: 14, scale: 2 }),
  rejectedQuantity: numeric("rejected_quantity", { precision: 14, scale: 2 }),
  tTTotal: numeric("t_t_total", { precision: 12, scale: 2 }),
  tOTotal: numeric("t_o_total", { precision: 12, scale: 2 }),
  tRTotal: numeric("t_r_total", { precision: 12, scale: 2 }),
  tFTotal: numeric("t_f_total", { precision: 12, scale: 2 }),
  tNTotal: numeric("t_n_total", { precision: 12, scale: 2 }),
  tUTotal: numeric("t_u_total", { precision: 12, scale: 2 }),
  doRate: numeric("do_rate", { precision: 7, scale: 6 }),
  tpRate: numeric("tp_rate", { precision: 7, scale: 6 }),
  tqRate: numeric("tq_rate", { precision: 7, scale: 6 }),
  trs: numeric("trs", { precision: 7, scale: 6 }),
  trg: numeric("trg", { precision: 7, scale: 6 }),
  tre: numeric("tre", { precision: 7, scale: 6 }),
  planningAdherenceRate: numeric("planning_adherence_rate", { precision: 7, scale: 6 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.equipmentId, t.productId, t.year, t.month)]);

export type KpiMonthly = typeof kpiMonthlyTable.$inferSelect;
export type InsertKpiMonthly = typeof kpiMonthlyTable.$inferInsert;
