import { pgTable, uuid, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const calculationFormulasTable = pgTable("calculation_formulas", {
  id: uuid("id").primaryKey().defaultRandom(),
  indicatorCode: text("indicator_code").notNull(),      // TRS | DO | TP | TQ | etc.
  indicatorName: text("indicator_name").notNull(),
  formulaExpression: text("formula_expression").notNull(),
  formulaDescription: text("formula_description"),
  variablesJson: text("variables_json"),               // JSON string: ["tU","tR"]
  unit: text("unit"),                                  // % | min | ratio
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  validationStatus: text("validation_status").notNull().default("draft"), // draft | validated | deprecated
  changeReason: text("change_reason"),
  createdById: uuid("created_by_id").references(() => usersTable.id),
  validatedById: uuid("validated_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const calculationFormulaTestsTable = pgTable("calculation_formula_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  formulaId: uuid("formula_id").notNull().references(() => calculationFormulasTable.id),
  testInputJson: text("test_input_json").notNull(),
  expectedResult: text("expected_result"),
  actualResult: text("actual_result"),
  testStatus: text("test_status").notNull().default("pending"), // pending | pass | fail | error
  testedById: uuid("tested_by_id").references(() => usersTable.id),
  testedAt: timestamp("tested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCalculationFormulaSchema = createInsertSchema(calculationFormulasTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCalculationFormula = z.infer<typeof insertCalculationFormulaSchema>;
export type CalculationFormula = typeof calculationFormulasTable.$inferSelect;
