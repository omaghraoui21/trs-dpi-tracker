import { pgTable, uuid, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const impactTypeEnum = pgEnum("impact_type", ["tO", "tR", "tF", "tN", "tU", "TQ"]);

export const FAMILLE_VALUES = [
  "Arrêts non planifiés",
  "Problèmes de qualité",
  "Arrêt technique",
  "Attente et transition",
  "Utilités",
] as const;
export type Famille = (typeof FAMILLE_VALUES)[number];

export const downtimeCategoriesTable = pgTable("downtime_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  famille: text("famille"),
  impactType: impactTypeEnum("impact_type").notNull(),
  impactKpi: text("impact_kpi"),
  isPlanned: boolean("is_planned").notNull().default(false),
  requiresComment: boolean("requires_comment").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  isQuickShortcut: boolean("is_quick_shortcut").notNull().default(false),
  shortcutEquipments: text("shortcut_equipments"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDowntimeCategorySchema = createInsertSchema(downtimeCategoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDowntimeCategory = z.infer<typeof insertDowntimeCategorySchema>;
export type DowntimeCategory = typeof downtimeCategoriesTable.$inferSelect;
