/**
 * Admin configuration routes — load DPI preset config.
 *
 * POST /admin/load-dpi-config   → runs the DPI seed (idempotent)
 * GET  /admin/config-status     → returns confirmation status of critical settings
 */
import { Router } from "express";
import {
  db,
  equipmentsTable,
  cadencesTable,
  kpiTargetsTable,
  standardTimesTable,
  productPresentationsTable,
  appSettingsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, requireRole } from "../middlewares/auth";
import { seedDpiConfig } from "../scripts/seed_dpi";

const RESET_TABLES = [
  "audit_log", "notifications", "kpi_daily", "kpi_monthly",
  "downtime_events", "activity_downtimes", "production_entries", "activities",
  "daily_entries", "equipment_status_events", "room_status_events",
  "planning_imports", "production_plans", "monthly_closures", "annual_calendar_events",
  "notification_rules", "kpi_targets", "standard_times", "assembly_boms",
  "product_presentations", "planning_activity_mappings", "cadences",
  "downtime_categories", "equipments", "rooms", "products", "users",
  "sites", "app_settings", "roles",
] as const;

const router = Router();

const PHASE_VALUES = ["VIDE_LIGNE", "REMPLISSAGE", "LOT", "NETTOYAGE", "DESINFECTION"] as const;
type CyclePhase = (typeof PHASE_VALUES)[number];
const CYCLE_ORDER_KEY = "operator_cycle_default_order";
const DEFAULT_CYCLE_ORDER: CyclePhase[] = [...PHASE_VALUES];

const cycleOrderSchema = z.object({
  order: z
    .array(z.enum(PHASE_VALUES))
    .length(5)
    .refine((a) => new Set(a).size === 5, { message: "phases must be unique" }),
});

// GET /admin/cycle-order — readable by any authenticated user (operators need it)
router.get("/cycle-order", requireAuth, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, CYCLE_ORDER_KEY));
    const stored = rows[0]?.value as { order?: CyclePhase[] } | undefined;
    const order = stored?.order && stored.order.length === 5 ? stored.order : DEFAULT_CYCLE_ORDER;
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: "Impossible de récupérer l'ordre du cycle" });
  }
});

// PUT /admin/cycle-order — admin only
router.put("/cycle-order", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = cycleOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ordre invalide", details: parsed.error.issues });
    return;
  }
  try {
    await db
      .insert(appSettingsTable)
      .values({ key: CYCLE_ORDER_KEY, value: { order: parsed.data.order } })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: { order: parsed.data.order } },
      });
    res.json({ order: parsed.data.order });
  } catch (err) {
    res.status(500).json({ error: "Impossible de sauvegarder l'ordre du cycle" });
  }
});

// POST /admin/load-dpi-config — charge la configuration DPI TERIAK EF (idempotent)
router.post("/load-dpi-config", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    req.log.info("Loading DPI TERIAK EF configuration…");
    const result = await seedDpiConfig();
    res.json({
      success: true,
      message: "Configuration DPI TERIAK EF chargée avec succès",
      data: result,
    });
  } catch (err) {
    req.log.error(err, "Failed to load DPI config");
    res.status(500).json({ error: "Échec du chargement de la configuration DPI" });
  }
});

// POST /admin/reset-all-data — vide toutes les données (admin uniquement)
router.post("/reset-all-data", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    req.log.warn("RESET ALL DATA — initiated by admin");
    for (const table of RESET_TABLES) {
      await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
    }
    req.log.info("RESET ALL DATA — completed");
    res.json({ success: true, message: "Toutes les données ont été supprimées." });
  } catch (err) {
    req.log.error(err, "RESET ALL DATA — failed");
    res.status(500).json({ error: "Échec du reset" });
  }
});

// GET /admin/config-status — retourne les éléments "À confirmer"
router.get("/config-status", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    // Standards de temps à confirmer
    const pendingStdTimes = await db
      .select()
      .from(standardTimesTable)
      .where(eq(standardTimesTable.needsConfirmation, true));

    // Présentations à confirmer
    const pendingPresentations = await db
      .select()
      .from(productPresentationsTable)
      .where(eq(productPresentationsTable.needsConfirmation, true));

    // KPI targets sans valeur d'équipement
    const kpiTargets = await db
      .select()
      .from(kpiTargetsTable)
      .where(eq(kpiTargetsTable.isActive, true));

    // Cadences
    const cadences = await db.select().from(cadencesTable);
    const equipments = await db
      .select()
      .from(equipmentsTable)
      .where(eq(equipmentsTable.isActive, true));

    const equipmentsWithoutCadence = equipments.filter(
      (eq) => !cadences.some((c) => c.equipmentId === eq.id),
    );

    const checks = [
      {
        key: "standard_times",
        label: "Standards de temps",
        status: pendingStdTimes.length > 0 ? "provisional" : "confirmed",
        count: pendingStdTimes.length,
        items: pendingStdTimes.map((s) => s.comment ?? s.activityType),
      },
      {
        key: "presentations",
        label: "Conversions présentations produits",
        status: pendingPresentations.length > 0 ? "provisional" : "confirmed",
        count: pendingPresentations.length,
        items: pendingPresentations.map((p) => p.presentationName),
      },
      {
        key: "cadences",
        label: "Cadences équipements",
        status: equipmentsWithoutCadence.length > 0 ? "provisional" : "confirmed",
        count: equipmentsWithoutCadence.length,
        items: equipmentsWithoutCadence.map((e) => `${e.name} — cadence à saisir`),
      },
      {
        key: "kpi_targets",
        label: "Objectifs KPI",
        status: kpiTargets.length === 0 ? "provisional" : "confirmed",
        count: kpiTargets.length,
        items: [],
      },
    ];

    const pendingCount = checks.filter((c) => c.status === "provisional").length;

    res.json({
      ready: pendingCount === 0,
      pendingCount,
      checks,
    });
  } catch (err) {
    req.log.error(err, "Failed to get config status");
    res.status(500).json({ error: "Impossible de récupérer le statut de configuration" });
  }
});

export default router;
