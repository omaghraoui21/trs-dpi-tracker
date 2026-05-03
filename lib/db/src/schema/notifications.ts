import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { equipmentsTable } from "./equipments";
import { roomsTable } from "./rooms";
import { productsTable } from "./products";
import { sitesTable } from "./sites";

export const notificationSeverityEnum = pgEnum("notification_severity", ["info", "warning", "critical"]);
export const notificationStatusEnum = pgEnum("notification_status", ["open", "acknowledged", "closed"]);

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  severity: notificationSeverityEnum("severity").notNull().default("info"),
  siteId: uuid("site_id").references(() => sitesTable.id),
  equipmentId: uuid("equipment_id").references(() => equipmentsTable.id),
  roomId: uuid("room_id").references(() => roomsTable.id),
  productId: uuid("product_id").references(() => productsTable.id),
  lotNumber: text("lot_number"),
  message: text("message").notNull(),
  status: notificationStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedById: uuid("acknowledged_by").references(() => usersTable.id),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  closedById: uuid("closed_by").references(() => usersTable.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closureComment: text("closure_comment"),
}, (t) => [
  index("idx_notifications_status").on(t.status),
  index("idx_notifications_severity").on(t.severity),
  index("idx_notifications_equipment").on(t.equipmentId),
]);

export type Notification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
