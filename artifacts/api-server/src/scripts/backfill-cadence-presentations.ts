/**
 * Backfill script: assign default presentations to cadences with NULL presentation_id.
 *
 * Resolution rule for default presentation:
 *   ORDER BY (validation_status = 'confirmed') DESC, is_active DESC, created_at ASC
 *   LIMIT 1
 *
 * If a product has NO presentations at all, deactivate the cadence and log a warning.
 *
 * Idempotent: only processes cadences where presentation_id IS NULL.
 * Does NOT run automatically - execute manually when ready.
 */

import { db, cadencesTable, productPresentationsTable } from "@workspace/db";
import { eq, isNull, and, desc, asc, sql } from "drizzle-orm";

async function backfillCadencePresentations() {
  console.log("[backfill] Starting cadence presentations backfill...");

  // Find all cadences with NULL presentation_id
  const cadencesWithoutPresentation = await db
    .select()
    .from(cadencesTable)
    .where(isNull(cadencesTable.presentationId));

  console.log(`[backfill] Found ${cadencesWithoutPresentation.length} cadences without presentation_id`);

  let updated = 0;
  let deactivated = 0;
  let skipped = 0;

  for (const cadence of cadencesWithoutPresentation) {
    // Find the default presentation for this product
    const presentations = await db
      .select()
      .from(productPresentationsTable)
      .where(eq(productPresentationsTable.productId, cadence.productId))
      .orderBy(
        desc(sql`CASE WHEN ${productPresentationsTable.validationStatus} = 'confirmed' THEN 1 ELSE 0 END`),
        desc(productPresentationsTable.isActive),
        asc(productPresentationsTable.createdAt),
      )
      .limit(1);

    if (presentations.length === 0) {
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

    const defaultPresentation = presentations[0];

    await db
      .update(cadencesTable)
      .set({ presentationId: defaultPresentation.id })
      .where(eq(cadencesTable.id, cadence.id));

    updated++;
    console.log(
      `[backfill] Cadence ${cadence.id}: assigned presentation ${defaultPresentation.id} ` +
      `(${defaultPresentation.presentationName})`
    );
  }

  console.log(
    `[backfill] Complete. Updated: ${updated}, Deactivated: ${deactivated}, Skipped: ${skipped}`
  );
}

// Execute if run directly
backfillCadencePresentations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] Fatal error:", err);
    process.exit(1);
  });
