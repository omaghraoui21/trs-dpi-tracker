import { db, cadencesTable, productPresentationsTable } from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";

/**
 * Resolve the default presentation ID for a product.
 *
 * Resolution rule:
 *   ORDER BY (validation_status = 'confirmed') DESC, is_active DESC, created_at ASC
 *   LIMIT 1
 */
export async function resolveDefaultPresentationId(productId: string): Promise<string | null> {
  const rows = await db
    .select({ id: productPresentationsTable.id })
    .from(productPresentationsTable)
    .where(eq(productPresentationsTable.productId, productId))
    .orderBy(
      desc(sql`CASE WHEN ${productPresentationsTable.validationStatus} = 'confirmed' THEN 1 ELSE 0 END`),
      desc(productPresentationsTable.isActive),
      asc(productPresentationsTable.createdAt),
    )
    .limit(1);

  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Look up the active cadence for a (product, equipment, presentation) triplet.
 */
export async function lookupActiveCadence({
  productId,
  equipmentId,
  presentationId,
}: {
  productId: string;
  equipmentId: string;
  presentationId: string;
}): Promise<typeof cadencesTable.$inferSelect | null> {
  const rows = await db
    .select()
    .from(cadencesTable)
    .where(
      and(
        eq(cadencesTable.productId, productId),
        eq(cadencesTable.equipmentId, equipmentId),
        eq(cadencesTable.presentationId, presentationId),
        eq(cadencesTable.isActive, true),
      ),
    )
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}
