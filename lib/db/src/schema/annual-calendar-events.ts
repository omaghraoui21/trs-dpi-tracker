import { pgTable, uuid, date, text, integer, boolean, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { equipmentsTable } from "./equipments";
import { sitesTable } from "./sites";

/**
 * Types d'événements calendaires annuels — impact sur TO/TR
 *
 * Impact sur la chaîne tT → tO → tR :
 *   CLOSURE  → réduit tO  (fermeture site : congés, jours fériés, WE non travaillés)
 *   HOLIDAY  → réduit tO  (jour férié légal)
 *   QUALIFICATION → réduit tR depuis tO  (qualification équipement, validation procédé)
 *   TRIAL    → réduit tR depuis tO  (essai TO, essai TR, essai technologique)
 *   CLEANING_MAJOR → réduit tR depuis tO  (nettoyage majeur, désinfection, CIP prolongé)
 */
export const calendarEventTypeEnum = pgEnum("calendar_event_type", [
  "CLOSURE",
  "HOLIDAY",
  "QUALIFICATION",
  "TRIAL",
  "CLEANING_MAJOR",
]);

export const calendarEventScopeEnum = pgEnum("calendar_event_scope", [
  "SITE",
  "EQUIPMENT",
]);

export const annualCalendarEventsTable = pgTable("annual_calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").references(() => sitesTable.id),
  equipmentId: uuid("equipment_id").references(() => equipmentsTable.id),
  scope: calendarEventScopeEnum("scope").notNull().default("SITE"),
  eventType: calendarEventTypeEnum("event_type").notNull(),
  label: text("label").notNull(),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  durationMinutesPerDay: integer("duration_minutes_per_day"),
  allDay: boolean("all_day").notNull().default(true),
  isRecurringAnnual: boolean("is_recurring_annual").notNull().default(false),
  plannedByUserId: uuid("planned_by_user_id").references(() => usersTable.id),
  confirmedByUserId: uuid("confirmed_by_user_id").references(() => usersTable.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_ace_date_from").on(t.dateFrom),
  index("idx_ace_date_to").on(t.dateTo),
  index("idx_ace_event_type").on(t.eventType),
  index("idx_ace_equipment").on(t.equipmentId),
]);

export const insertAnnualCalendarEventSchema = createInsertSchema(annualCalendarEventsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AnnualCalendarEvent = typeof annualCalendarEventsTable.$inferSelect;
export type InsertAnnualCalendarEvent = z.infer<typeof insertAnnualCalendarEventSchema>;
