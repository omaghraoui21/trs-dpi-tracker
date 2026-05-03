import { pgTable, uuid, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationRulesTable = pgTable("notification_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleCode: text("rule_code").notNull().unique(),
  ruleName: text("rule_name").notNull(),
  conditionExpression: text("condition_expression").notNull(),   // e.g. "TRS < target"
  severity: text("severity").notNull().default("warning"),       // info | warning | critical
  thresholdValue: numeric("threshold_value", { precision: 8, scale: 4 }),
  targetRoles: text("target_roles").notNull().default("supervisor"), // comma-separated roles
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNotificationRuleSchema = createInsertSchema(notificationRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationRule = z.infer<typeof insertNotificationRuleSchema>;
export type NotificationRule = typeof notificationRulesTable.$inferSelect;
