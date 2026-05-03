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
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { seedDpiConfig } from "../scripts/seed_dpi";

const router = Router();

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

// GET /admin/config-status — retourne les éléments "À confirmer"
router.get("/config-status", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    // Standards de temps à confirmer
    const pendingStdTimes = await db.select().from(standardTimesTable)
      .where(eq(standardTimesTable.needsConfirmation, true));

    // Présentations à confirmer
    const pendingPresentations = await db.select().from(productPresentationsTable)
      .where(eq(productPresentationsTable.needsConfirmation, true));

    // KPI targets sans valeur d'équipement
    const kpiTargets = await db.select().from(kpiTargetsTable)
      .where(eq(kpiTargetsTable.isActive, true));

    // Cadences
    const cadences = await db.select().from(cadencesTable);
    const equipments = await db.select().from(equipmentsTable)
      .where(eq(equipmentsTable.isActive, true));

    const equipmentsWithoutCadence = equipments.filter(
      eq => !cadences.some(c => c.equipmentId === eq.id)
    );

    const checks = [
      {
        key: "standard_times",
        label: "Standards de temps",
        status: pendingStdTimes.length > 0 ? "provisional" : "confirmed",
        count: pendingStdTimes.length,
        items: pendingStdTimes.map(s => s.comment ?? s.activityType),
      },
      {
        key: "presentations",
        label: "Conversions présentations produits",
        status: pendingPresentations.length > 0 ? "provisional" : "confirmed",
        count: pendingPresentations.length,
        items: pendingPresentations.map(p => p.presentationName),
      },
      {
        key: "cadences",
        label: "Cadences équipements",
        status: equipmentsWithoutCadence.length > 0 ? "provisional" : "confirmed",
        count: equipmentsWithoutCadence.length,
        items: equipmentsWithoutCadence.map(e => `${e.name} — cadence à saisir`),
      },
      {
        key: "kpi_targets",
        label: "Objectifs KPI",
        status: kpiTargets.length === 0 ? "provisional" : "confirmed",
        count: kpiTargets.length,
        items: [],
      },
    ];

    const pendingCount = checks.filter(c => c.status === "provisional").length;

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
