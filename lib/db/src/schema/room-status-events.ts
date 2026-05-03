import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { roomsTable } from "./rooms";
import { productsTable } from "./products";
import { usersTable } from "./users";

export const roomStatusEventsTable = pgTable("room_status_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => roomsTable.id),
  status: text("status").notNull(),
  activityType: text("activity_type"),
  productId: uuid("product_id").references(() => productsTable.id),
  lotNumber: text("lot_number"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => usersTable.id),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RoomStatusEvent = typeof roomStatusEventsTable.$inferSelect;
export type InsertRoomStatusEvent = typeof roomStatusEventsTable.$inferInsert;
