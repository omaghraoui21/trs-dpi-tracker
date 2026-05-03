import { Router, IRouter } from "express";
import { db, notificationRulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const CreateRuleSchema = z.object({
  ruleCode:            z.string().min(1),
  ruleName:            z.string().min(1),
  conditionExpression: z.string().min(1),
  severity:            z.enum(["info", "warning", "critical"]).default("warning"),
  thresholdValue:      z.number().optional(),
  targetRoles:         z.string().default("supervisor"),
  inAppEnabled:        z.boolean().default(true),
  emailEnabled:        z.boolean().default(false),
  isActive:            z.boolean().default(true),
});

type RuleInsert = {
  ruleCode: string;
  ruleName: string;
  conditionExpression: string;
  severity: "info" | "warning" | "critical";
  thresholdValue: string | null;
  targetRoles: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  isActive: boolean;
};

const DEFAULT_RULES: RuleInsert[] = [
  { ruleCode: "TRS_BELOW_TARGET",   ruleName: "TRS inférieur à l'objectif",     conditionExpression: "TRS < target",          severity: "warning",  thresholdValue: "0.85", targetRoles: "supervisor,admin", inAppEnabled: true, emailEnabled: false, isActive: true  },
  { ruleCode: "TP_BELOW_70",        ruleName: "Performance inférieure à 70%",   conditionExpression: "TP < 0.70",             severity: "warning",  thresholdValue: "0.70", targetRoles: "supervisor",      inAppEnabled: true, emailEnabled: false, isActive: true  },
  { ruleCode: "DO_BELOW_80",        ruleName: "Disponibilité inférieure à 80%", conditionExpression: "DO < 0.80",             severity: "warning",  thresholdValue: "0.80", targetRoles: "supervisor",      inAppEnabled: true, emailEnabled: false, isActive: true  },
  { ruleCode: "STOP_ACTIVE_15MIN",  ruleName: "Arrêt actif > 15 min",           conditionExpression: "active_stop > 15",      severity: "critical", thresholdValue: "15",   targetRoles: "supervisor,admin", inAppEnabled: true, emailEnabled: false, isActive: true  },
  { ruleCode: "PANNE_DECLARED",     ruleName: "Panne déclarée",                 conditionExpression: "category = 'AB'",       severity: "critical", thresholdValue: null,   targetRoles: "supervisor,admin", inAppEnabled: true, emailEnabled: false, isActive: true  },
  { ruleCode: "PLANNING_BELOW_75",  ruleName: "Respect planning < 75%",         conditionExpression: "planning_respect < 0.75", severity: "warning", thresholdValue: "0.75", targetRoles: "supervisor",     inAppEnabled: true, emailEnabled: false, isActive: true  },
  { ruleCode: "TQ_BELOW_95",        ruleName: "Qualité inférieure à 95%",       conditionExpression: "TQ < 0.95",             severity: "warning",  thresholdValue: "0.95", targetRoles: "supervisor",      inAppEnabled: true, emailEnabled: false, isActive: false },
];

router.get("/notification-rules", requireAuth, async (req, res): Promise<void> => {
  const rules = await db
    .select()
    .from(notificationRulesTable)
    .orderBy(notificationRulesTable.severity, notificationRulesTable.ruleCode);

  if (rules.length === 0) {
    const seeded = await db
      .insert(notificationRulesTable)
      .values(DEFAULT_RULES)
      .returning();
    res.json(seeded);
    return;
  }

  res.json(rules);
});

router.post("/notification-rules", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }

  const [created] = await db
    .insert(notificationRulesTable)
    .values({
      ...parsed.data,
      thresholdValue: parsed.data.thresholdValue !== undefined ? String(parsed.data.thresholdValue) : null,
    })
    .returning();

  res.status(201).json(created);
});

router.patch("/notification-rules/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = CreateRuleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
    return;
  }

  const patch: Partial<typeof notificationRulesTable.$inferInsert> = {};
  if (parsed.data.ruleCode !== undefined)            patch.ruleCode = parsed.data.ruleCode;
  if (parsed.data.ruleName !== undefined)            patch.ruleName = parsed.data.ruleName;
  if (parsed.data.conditionExpression !== undefined) patch.conditionExpression = parsed.data.conditionExpression;
  if (parsed.data.severity !== undefined)            patch.severity = parsed.data.severity;
  if (parsed.data.targetRoles !== undefined)         patch.targetRoles = parsed.data.targetRoles;
  if (parsed.data.inAppEnabled !== undefined)        patch.inAppEnabled = parsed.data.inAppEnabled;
  if (parsed.data.emailEnabled !== undefined)        patch.emailEnabled = parsed.data.emailEnabled;
  if (parsed.data.isActive !== undefined)            patch.isActive = parsed.data.isActive;
  if (parsed.data.thresholdValue !== undefined)      patch.thresholdValue = String(parsed.data.thresholdValue);

  const [updated] = await db
    .update(notificationRulesTable)
    .set(patch)
    .where(eq(notificationRulesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Règle non trouvée" }); return; }
  res.json(updated);
});

router.delete("/notification-rules/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [updated] = await db
    .update(notificationRulesTable)
    .set({ isActive: false })
    .where(eq(notificationRulesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Règle non trouvée" }); return; }
  res.json({ success: true });
});

export default router;
