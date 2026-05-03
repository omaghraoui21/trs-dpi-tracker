import { Router, IRouter } from "express";
import { db, calculationFormulasTable, calculationFormulaTestsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const CreateFormulaSchema = z.object({
  indicatorCode:       z.string().min(1),
  indicatorName:       z.string().min(1),
  formulaExpression:   z.string().min(1),
  formulaDescription:  z.string().optional(),
  variablesJson:       z.string().optional(),
  unit:                z.string().optional(),
  changeReason:        z.string().optional(),
});

// Built-in NF E 60-182 formulas seeded at route level if DB is empty
const BUILTIN_FORMULAS = [
  { indicatorCode: "TRS",      indicatorName: "Taux de Rendement Synthétique",      formulaExpression: "tU / tR",     formulaDescription: "TRS = DO × TP × TQ = tU/tR", variablesJson: '["tU","tR"]', unit: "%" },
  { indicatorCode: "TRG",      indicatorName: "Taux de Rendement Global",           formulaExpression: "tU / tO",     formulaDescription: "TRG = tU / tO",               variablesJson: '["tU","tO"]', unit: "%" },
  { indicatorCode: "TRE",      indicatorName: "Taux de Rendement Économique",       formulaExpression: "tU / tT",     formulaDescription: "TRE = tU / tT",               variablesJson: '["tU","tT"]', unit: "%" },
  { indicatorCode: "DO",       indicatorName: "Disponibilité Opérationnelle",       formulaExpression: "tF / tR",     formulaDescription: "DO = tF / tR",                variablesJson: '["tF","tR"]', unit: "%" },
  { indicatorCode: "TP",       indicatorName: "Taux de Performance",                formulaExpression: "tN / tF",     formulaDescription: "TP = tN / tF",                variablesJson: '["tN","tF"]', unit: "%" },
  { indicatorCode: "TQ",       indicatorName: "Taux de Qualité",                   formulaExpression: "tU / tN",     formulaDescription: "TQ = tU / tN",                variablesJson: '["tU","tN"]', unit: "%" },
  { indicatorCode: "tT",       indicatorName: "Temps Calendrier",                  formulaExpression: "1440",        formulaDescription: "24h × 60 min",                variablesJson: '[]',          unit: "min" },
  { indicatorCode: "tO",       indicatorName: "Temps d'Ouverture",                 formulaExpression: "tT - fermetures", formulaDescription: "Durée du poste",            variablesJson: '["tT","fermetures"]', unit: "min" },
  { indicatorCode: "tR",       indicatorName: "Temps Requis",                      formulaExpression: "tO - arrêts_planifiés", formulaDescription: "tO - Σ arrêts planifiés", variablesJson: '["tO","arrêts_planifiés"]', unit: "min" },
  { indicatorCode: "tF",       indicatorName: "Temps de Fonctionnement",            formulaExpression: "tR - arrêts_non_planifiés", formulaDescription: "tR - Σ arrêts non planifiés", variablesJson: '["tR","arrêts_non_planifiés"]', unit: "min" },
  { indicatorCode: "tN",       indicatorName: "Temps Net",                         formulaExpression: "qté_produite / cadence", formulaDescription: "Quantité produite / cadence de référence", variablesJson: '["qté_produite","cadence"]', unit: "min" },
  { indicatorCode: "tU",       indicatorName: "Temps Utile",                       formulaExpression: "qté_conforme / cadence", formulaDescription: "Quantité conforme / cadence de référence", variablesJson: '["qté_conforme","cadence"]', unit: "min" },
  { indicatorCode: "PLANNING", indicatorName: "Respect Planning",                  formulaExpression: "qté_réalisée / qté_planifiée", formulaDescription: "Quantité réalisée / Quantité planifiée", variablesJson: '["qté_réalisée","qté_planifiée"]', unit: "%" },
];

router.get("/formulas", requireAuth, async (req, res): Promise<void> => {
  const formulas = await db
    .select()
    .from(calculationFormulasTable)
    .orderBy(calculationFormulasTable.indicatorCode, desc(calculationFormulasTable.version));

  if (formulas.length === 0) {
    // Seed builtins if DB is empty
    const seeded = await db
      .insert(calculationFormulasTable)
      .values(BUILTIN_FORMULAS.map(f => ({ ...f, version: 1, isActive: true, validationStatus: "validated" })))
      .returning();
    res.json(seeded);
    return;
  }

  res.json(formulas);
});

router.post("/formulas", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateFormulaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }

  // Find current max version for this indicator
  const existing = await db
    .select()
    .from(calculationFormulasTable)
    .where(eq(calculationFormulasTable.indicatorCode, parsed.data.indicatorCode))
    .orderBy(desc(calculationFormulasTable.version));

  const nextVersion = existing.length > 0 ? (existing[0].version + 1) : 1;

  // Deprecate all previous versions
  if (existing.length > 0) {
    await db
      .update(calculationFormulasTable)
      .set({ isActive: false, validationStatus: "deprecated" })
      .where(eq(calculationFormulasTable.indicatorCode, parsed.data.indicatorCode));
  }

  const [created] = await db
    .insert(calculationFormulasTable)
    .values({
      ...parsed.data,
      version: nextVersion,
      isActive: true,
      validationStatus: "draft",
      createdById: req.user!.id,
    })
    .returning();

  res.status(201).json(created);
});

router.post("/formulas/:id/validate", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [updated] = await db
    .update(calculationFormulasTable)
    .set({ validationStatus: "validated", validatedById: req.user!.id })
    .where(eq(calculationFormulasTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Formule non trouvée" }); return; }
  res.json(updated);
});

router.post("/formulas/:id/test", requireAuth, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { inputs } = req.body as { inputs: Record<string, number> };

  const [formula] = await db
    .select()
    .from(calculationFormulasTable)
    .where(eq(calculationFormulasTable.id, id));

  if (!formula) { res.status(404).json({ error: "Formule non trouvée" }); return; }

  try {
    let expr = formula.formulaExpression;
    for (const [key, val] of Object.entries(inputs)) {
      expr = expr.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), String(val));
    }
    if (!/^[\d\s+\-*/().]+$/.test(expr)) {
      throw new Error("Expression non calculable avec les variables fournies");
    }
    // eslint-disable-next-line no-new-func
    const result = (new Function(`"use strict"; return (${expr});`))() as number;
    const isValid = isFinite(result) && !isNaN(result);

    await db.insert(calculationFormulaTestsTable).values({
      formulaId: id,
      testInputJson: JSON.stringify(inputs),
      actualResult: isValid ? String(result) : null,
      testStatus: isValid ? "pass" : "error",
      testedById: req.user!.id,
      testedAt: new Date(),
    });

    res.json({ result: isValid ? result : null, status: isValid ? "pass" : "error", expression: formula.formulaExpression });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur d'évaluation";
    await db.insert(calculationFormulaTestsTable).values({
      formulaId: id,
      testInputJson: JSON.stringify(inputs),
      actualResult: null,
      testStatus: "error",
      testedById: req.user!.id,
      testedAt: new Date(),
    });
    res.status(422).json({ error: msg, status: "error" });
  }
});

export default router;
