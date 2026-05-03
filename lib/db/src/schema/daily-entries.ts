import { pgTable, uuid, date, text, integer, timestamp, pgEnum, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { equipmentsTable } from "./equipments";
import { sitesTable } from "./sites";

/**
 * Fiche Journalière — Cadre OEE quotidien par équipement (NF E 60-182)
 *
 * Chaque ligne représente 1 journée × 1 équipement.
 * Elle capture le temps d'ouverture (tO) et les 4 sous-types d'arrêts planifiés
 * AVANT toute entrée de production, conformément à la logique Excel :
 *
 *   tT  = 1440 min (24h, constant)
 *   tO  = t_opening_min  (déclaré par l'opérateur/superviseur)
 *   tAP = pause_min + chsg_min + apr_min + mqch_min
 *   tR  = tO − tAP   (stocké en lecture seule dans t_req_min)
 *
 * Les entrées de production (production_entries) se rattachent à cette fiche
 * via daily_entry_id pour hériter de tO/tR journalier.
 *
 * Sous-types d'arrêts planifiés (tAP) :
 *   pause_min  — Pauses réglementaires (repas, café)
 *   chsg_min   — Changement de série/Gélules (CHSG) : nettoyage inter-lot
 *   apr_min    — Arrêt Programmé Réglementaire (APR) : EHS, sécurité, réunions
 *   mqch_min   — Mise en Quarantaine / Changement (MQCH) : blocage qualité
 *
 * Statuts :
 *   draft     — saisie opérateur, modifiable
 *   validated — validé superviseur, verrouillé
 */

export const dailyEntryStatusEnum = pgEnum("daily_entry_status", [
  "draft",
  "validated",
]);

export const dailyEntriesTable = pgTable("daily_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").references(() => sitesTable.id),
  equipmentId: uuid("equipment_id").notNull().references(() => equipmentsTable.id),
  entryDate: date("entry_date").notNull(),

  tOpeningMin: integer("t_opening_min").notNull().default(0),

  pauseMin: integer("pause_min").notNull().default(0),
  chsgMin: integer("chsg_min").notNull().default(0),
  aprMin: integer("apr_min").notNull().default(0),
  mqchMin: integer("mqch_min").notNull().default(0),

  notes: text("notes"),
  status: dailyEntryStatusEnum("status").notNull().default("draft"),

  createdById: uuid("created_by_id").notNull().references(() => usersTable.id),
  validatedById: uuid("validated_by_id").references(() => usersTable.id),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("uq_daily_entry_equipment_date").on(t.equipmentId, t.entryDate),
  index("idx_daily_entries_date").on(t.entryDate),
  index("idx_daily_entries_equipment").on(t.equipmentId),
  index("idx_daily_entries_status").on(t.status),
]);

export const insertDailyEntrySchema = createInsertSchema(dailyEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  validatedById: true,
  validatedAt: true,
});

export type DailyEntry = typeof dailyEntriesTable.$inferSelect;
export type InsertDailyEntry = z.infer<typeof insertDailyEntrySchema>;
