import { Router, IRouter } from "express";
import { db, productsTable, cadencesTable, equipmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { isUniqueViolation } from "../lib/db-errors";
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

router.get("/products", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(productsTable).orderBy(productsTable.name);
  res.json(rows.map(formatProduct));
});

router.post("/products", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db.insert(productsTable).values(parsed.data).returning();
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
    const [row] = await db
      .update(productsTable)
      .set(parsed.data)
      .where(eq(productsTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(formatProduct(row));
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
    const [row] = await db
      .update(productsTable)
      .set({ isActive: false })
      .where(eq(productsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.sendStatus(204);
  },
);

// Cadences
router.get("/cadences", requireAuth, async (req, res): Promise<void> => {
  const query = ListCadencesQueryParams.safeParse(req.query);
  const dbQuery = db
    .select({
      id: cadencesTable.id,
      productId: cadencesTable.productId,
      equipmentId: cadencesTable.equipmentId,
      theoreticalCadence: cadencesTable.theoreticalCadence,
      validatedCadence: cadencesTable.validatedCadence,
      unit: cadencesTable.unit,
      productName: productsTable.name,
      equipmentName: equipmentsTable.name,
    })
    .from(cadencesTable)
    .leftJoin(productsTable, eq(cadencesTable.productId, productsTable.id))
    .leftJoin(equipmentsTable, eq(cadencesTable.equipmentId, equipmentsTable.id));

  const conditions = [];
  if (query.success && query.data.productId) {
    conditions.push(eq(cadencesTable.productId, query.data.productId));
  }
  if (query.success && query.data.equipmentId) {
    conditions.push(eq(cadencesTable.equipmentId, query.data.equipmentId));
  }

  const rows = conditions.length > 0 ? await dbQuery.where(and(...conditions)) : await dbQuery;

  res.json(
    rows.map((r) => ({
      ...r,
      theoreticalCadence: parseFloat(r.theoreticalCadence as unknown as string),
      validatedCadence: parseFloat(r.validatedCadence as unknown as string),
    })),
  );
});

router.post("/cadences", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = UpsertCadenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(cadencesTable)
    .where(
      and(
        eq(cadencesTable.productId, parsed.data.productId),
        eq(cadencesTable.equipmentId, parsed.data.equipmentId),
      ),
    );

  let row;
  if (existing.length > 0) {
    [row] = await db
      .update(cadencesTable)
      .set({
        theoreticalCadence: parsed.data.theoreticalCadence.toString(),
        validatedCadence: parsed.data.validatedCadence.toString(),
        unit: parsed.data.unit,
      })
      .where(eq(cadencesTable.id, existing[0].id))
      .returning();
  } else {
    [row] = await db
      .insert(cadencesTable)
      .values({
        productId: parsed.data.productId,
        equipmentId: parsed.data.equipmentId,
        theoreticalCadence: parsed.data.theoreticalCadence.toString(),
        validatedCadence: parsed.data.validatedCadence.toString(),
        unit: parsed.data.unit,
      })
      .returning();
  }

  // fetch with names
  const [full] = await db
    .select({
      id: cadencesTable.id,
      productId: cadencesTable.productId,
      equipmentId: cadencesTable.equipmentId,
      theoreticalCadence: cadencesTable.theoreticalCadence,
      validatedCadence: cadencesTable.validatedCadence,
      unit: cadencesTable.unit,
      productName: productsTable.name,
      equipmentName: equipmentsTable.name,
    })
    .from(cadencesTable)
    .leftJoin(productsTable, eq(cadencesTable.productId, productsTable.id))
    .leftJoin(equipmentsTable, eq(cadencesTable.equipmentId, equipmentsTable.id))
    .where(eq(cadencesTable.id, row.id));

  res.json({
    ...full,
    theoreticalCadence: parseFloat(full.theoreticalCadence as unknown as string),
    validatedCadence: parseFloat(full.validatedCadence as unknown as string),
  });
});

export default router;
