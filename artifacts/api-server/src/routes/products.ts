import { Router, IRouter } from "express";
import {
  db,
  productsTable,
  cadencesTable,
  equipmentsTable,
  productPresentationsTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { isUniqueViolation } from "../lib/db-errors";
import { writeAudit } from "../lib/audit";
import {
  CreateProductBody,
  UpdateProductBody,
  UpdateProductParams,
  ListCadencesQueryParams,
  UpsertCadenceBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatProduct(p: typeof productsTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description ?? null,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const includeInactive = req.query["includeInactive"] === "true";
  const productsQuery = db.select().from(productsTable).$dynamic();
  const rows = includeInactive
    ? await productsQuery.orderBy(productsTable.name)
    : await productsQuery.where(eq(productsTable.isActive, true)).orderBy(productsTable.name);

  // Group active presentations by product (1 extra query total)
  const allPresentations = await db
    .select({
      id: productPresentationsTable.id,
      productId: productPresentationsTable.productId,
      name: productPresentationsTable.presentationName,
    })
    .from(productPresentationsTable)
    .where(eq(productPresentationsTable.isActive, true));
  const presentationsByProduct = new Map<string, Array<{ id: string; name: string }>>();
  for (const p of allPresentations) {
    const arr = presentationsByProduct.get(p.productId) ?? [];
    arr.push({ id: p.id, name: p.name });
    presentationsByProduct.set(p.productId, arr);
  }

  res.json(
    rows.map((r) => ({
      ...formatProduct(r),
      presentations: presentationsByProduct.get(r.id) ?? [],
    })),
  );
});

router.post("/products", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db.insert(productsTable).values(parsed.data).returning();
    writeAudit({
      userId: req.user?.id,
      tableName: "products",
      recordId: row.id,
      action: "create",
      newValues: row as unknown as Record<string, unknown>,
    });
    res.status(201).json(formatProduct(row));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Un produit avec ce code existe déjà" });
      return;
    }
    throw err;
  }
});

router.patch(
  "/products/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const params = UpdateProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [before] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id));
    if (!before) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    try {
      const [row] = await db
        .update(productsTable)
        .set(parsed.data)
        .where(eq(productsTable.id, params.data.id))
        .returning();
      writeAudit({
        userId: req.user?.id,
        tableName: "products",
        recordId: row.id,
        action: "update",
        oldValues: before as unknown as Record<string, unknown>,
        newValues: row as unknown as Record<string, unknown>,
      });
      res.json(formatProduct(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Un produit avec ce code existe déjà" });
        return;
      }
      throw err;
    }
  },
);

router.delete(
  "/products/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "ID requis" });
      return;
    }
    const [before] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!before) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const [row] = await db
      .update(productsTable)
      .set({ isActive: false })
      .where(eq(productsTable.id, id))
      .returning();
    writeAudit({
      userId: req.user?.id,
      tableName: "products",
      recordId: row.id,
      action: "delete",
      oldValues: before as unknown as Record<string, unknown>,
      reason: "soft-delete via DELETE /products/:id",
    });
    res.sendStatus(204);
  },
);

// ─── Cadences ────────────────────────────────────────────────────────────────
function formatCadence(r: {
  id: string;
  productId: string;
  equipmentId: string;
  presentationId: string | null;
  theoreticalCadence: unknown;
  validatedCadence: unknown;
  unit: string;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  productName: string | null;
  equipmentName: string | null;
  presentationName: string | null;
}) {
  return {
    id: r.id,
    productId: r.productId,
    equipmentId: r.equipmentId,
    presentationId: r.presentationId,
    theoreticalCadence: parseFloat(r.theoreticalCadence as string),
    validatedCadence: parseFloat(r.validatedCadence as string),
    unit: r.unit,
    validFrom: r.validFrom,
    validTo: r.validTo,
    isActive: r.isActive,
    productName: r.productName,
    equipmentName: r.equipmentName,
    presentationName: r.presentationName,
  };
}

const cadenceSelect = {
  id: cadencesTable.id,
  productId: cadencesTable.productId,
  equipmentId: cadencesTable.equipmentId,
  presentationId: cadencesTable.presentationId,
  theoreticalCadence: cadencesTable.theoreticalCadence,
  validatedCadence: cadencesTable.validatedCadence,
  unit: cadencesTable.unit,
  validFrom: cadencesTable.validFrom,
  validTo: cadencesTable.validTo,
  isActive: cadencesTable.isActive,
  productName: productsTable.name,
  equipmentName: equipmentsTable.name,
  presentationName: productPresentationsTable.presentationName,
};

router.get("/cadences", requireAuth, async (req, res): Promise<void> => {
  const query = ListCadencesQueryParams.safeParse(req.query);
  const includeInactive = req.query["includeInactive"] === "true";
  const conditions = [];
  if (!includeInactive) conditions.push(eq(cadencesTable.isActive, true));
  if (query.success && query.data.productId) {
    conditions.push(eq(cadencesTable.productId, query.data.productId));
  }
  if (query.success && query.data.equipmentId) {
    conditions.push(eq(cadencesTable.equipmentId, query.data.equipmentId));
  }
  const dbQuery = db
    .select(cadenceSelect)
    .from(cadencesTable)
    .leftJoin(productsTable, eq(cadencesTable.productId, productsTable.id))
    .leftJoin(equipmentsTable, eq(cadencesTable.equipmentId, equipmentsTable.id))
    .leftJoin(
      productPresentationsTable,
      eq(cadencesTable.presentationId, productPresentationsTable.id),
    );
  const rows = conditions.length > 0 ? await dbQuery.where(and(...conditions)) : await dbQuery;
  res.json(rows.map(formatCadence));
});

router.post("/cadences", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = UpsertCadenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const presentationId = (req.body as { presentationId?: string | null })?.presentationId ?? null;
  const validFrom = (req.body as { validFrom?: string })?.validFrom;

  // Find an existing ACTIVE cadence for the same (product, equipment, presentation) triplet.
  const presentationFilter = presentationId
    ? eq(cadencesTable.presentationId, presentationId)
    : isNull(cadencesTable.presentationId);
  const existing = await db
    .select()
    .from(cadencesTable)
    .where(
      and(
        eq(cadencesTable.isActive, true),
        eq(cadencesTable.productId, parsed.data.productId),
        eq(cadencesTable.equipmentId, parsed.data.equipmentId),
        presentationFilter,
      ),
    );

  let row;
  try {
    if (existing.length > 0) {
      [row] = await db
        .update(cadencesTable)
        .set({
          theoreticalCadence: parsed.data.theoreticalCadence.toString(),
          validatedCadence: parsed.data.validatedCadence.toString(),
          unit: parsed.data.unit,
          ...(validFrom ? { validFrom } : {}),
        })
        .where(eq(cadencesTable.id, existing[0].id))
        .returning();
      writeAudit({
        userId: req.user?.id,
        tableName: "cadences",
        recordId: row.id,
        action: "update",
        oldValues: existing[0] as unknown as Record<string, unknown>,
        newValues: row as unknown as Record<string, unknown>,
      });
    } else {
      [row] = await db
        .insert(cadencesTable)
        .values({
          productId: parsed.data.productId,
          equipmentId: parsed.data.equipmentId,
          presentationId,
          theoreticalCadence: parsed.data.theoreticalCadence.toString(),
          validatedCadence: parsed.data.validatedCadence.toString(),
          unit: parsed.data.unit,
          ...(validFrom ? { validFrom } : {}),
        })
        .returning();
      writeAudit({
        userId: req.user?.id,
        tableName: "cadences",
        recordId: row.id,
        action: "create",
        newValues: row as unknown as Record<string, unknown>,
      });
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({
        error: "Une cadence active existe déjà pour cet équipement, produit et présentation",
      });
      return;
    }
    throw err;
  }

  const [full] = await db
    .select(cadenceSelect)
    .from(cadencesTable)
    .leftJoin(productsTable, eq(cadencesTable.productId, productsTable.id))
    .leftJoin(equipmentsTable, eq(cadencesTable.equipmentId, equipmentsTable.id))
    .leftJoin(
      productPresentationsTable,
      eq(cadencesTable.presentationId, productPresentationsTable.id),
    )
    .where(eq(cadencesTable.id, row.id));
  res.json(formatCadence(full));
});

router.delete(
  "/cadences/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "ID requis" });
      return;
    }
    const [before] = await db.select().from(cadencesTable).where(eq(cadencesTable.id, id));
    if (!before) {
      res.status(404).json({ error: "Cadence not found" });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await db
      .update(cadencesTable)
      .set({ isActive: false, validTo: today })
      .where(eq(cadencesTable.id, id))
      .returning();
    writeAudit({
      userId: req.user?.id,
      tableName: "cadences",
      recordId: row.id,
      action: "delete",
      oldValues: before as unknown as Record<string, unknown>,
      reason: "soft-delete via DELETE /cadences/:id",
    });
    res.sendStatus(204);
  },
);

export default router;
