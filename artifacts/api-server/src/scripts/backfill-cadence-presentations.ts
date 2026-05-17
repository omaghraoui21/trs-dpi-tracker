/**
 * Backfill script: assign default presentations to cadences with NULL presentation_id.
 *
 * Resolution rule for default presentation:
 *   ORDER BY (validation_status = 'confirmed') DESC, is_active DESC, created_at ASC
 *   LIMIT 1
 *
 * If a product has NO presentations at all, deactivate the cadence and log a warning.
 *
 * Deduplication: groups cadences by (product_id, equipment_id). For each group with
 * multiple active rows, keeps only the most recent (by created_at DESC) active and
 * deactivates the rest BEFORE assigning presentations. This prevents the partial
 * unique index (cadences_active_triplet_unique) from being violated when multiple
 * active cadences for the same pair would receive the same default presentation.
 *
 * Idempotent: only processes cadences where presentation_id IS NULL.
 * Does NOT run automatically - execute manually when ready.
 */

import { db, cadencesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { resolveDefaultPresentationId } from "../lib/cadence-lookup";

async function backfillCadencePresentations() {
  console.log("[backfill] Starting cadence presentations backfill...");

  // Find all cadences with NULL presentation_id
  const cadencesWithoutPresentation = await db
    .select()
    .from(cadencesTable)
    .where(isNull(cadencesTable.presentationId));

  console.log(`[backfill] Found ${cadencesWithoutPresentation.length} cadences without presentation_id`);

  // Group active cadences by (product_id, equipment_id) to detect duplicates
  const activeByPair = new Map<string, typeof cadencesWithoutPresentation>();
  for (const cadence of cadencesWithoutPresentation) {
    if (!cadence.isActive) continue;
    const key = `${cadence.productId}::${cadence.equipmentId}`;
    if (!activeByPair.has(key)) activeByPair.set(key, []);
    activeByPair.get(key)!.push(cadence);
  }

  // Deactivate duplicates: for each group with multiple active rows, keep only the
  // most recent one (by created_at DESC) and deactivate the rest
  let deduped = 0;
  for (const [key, group] of activeByPair.entries()) {
    if (group.length <= 1) continue;

    // Sort by created_at descending - keep the first (most recent)
    group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const toDeactivate = group.slice(1);

    for (const cadence of toDeactivate) {
      console.log(
        `[backfill] Deactivating duplicate cadence ${cadence.id} for pair ${key} ` +
        `(keeping ${group[0].id} as most recent)`
      );
      await db
        .update(cadencesTable)
        .set({ isActive: false })
        .where(eq(cadencesTable.id, cadence.id));
      // Mark it as inactive in our local data so we skip it in the main loop
      cadence.isActive = false;
      deduped++;
    }
  }

  if (deduped > 0) {
    console.log(`[backfill] Deactivated ${deduped} duplicate active cadences`);
  }

  let updated = 0;
  let deactivated = 0;
  let skipped = 0;

  for (const cadence of cadencesWithoutPresentation) {
    // Skip cadences that were deactivated during deduplication
    if (!cadence.isActive) {
      skipped++;
      continue;
    }

    // Use the shared resolution helper
    const defaultPresentationId = await resolveDefaultPresentationId(cadence.productId);

    if (!defaultPresentationId) {
      // No presentations for this product - deactivate cadence
      console.warn(
        `[backfill] WARNING: Product ${cadence.productId} has no presentations. ` +
        `Deactivating cadence ${cadence.id} (product=${cadence.productId}, equipment=${cadence.equipmentId})`
      );
      await db
        .update(cadencesTable)
        .set({ isActive: false })
        .where(eq(cadencesTable.id, cadence.id));
      deactivated++;
      continue;
    }

    await db
      .update(cadencesTable)
      .set({ presentationId: defaultPresentationId })
      .where(eq(cadencesTable.id, cadence.id));

    updated++;
    console.log(
      `[backfill] Cadence ${cadence.id}: assigned presentation ${defaultPresentationId}`
    );
  }

  console.log(
    `[backfill] Complete. Updated: ${updated}, Deactivated: ${deactivated}, ` +
    `Deduped: ${deduped}, Skipped: ${skipped}`
  );
}

// Execute if run directly
backfillCadencePresentations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] Fatal error:", err);
    process.exit(1);
  });
