
import { Router, IRouter } from "express";
import { db, productsTable, cadencesTable, equipmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { mapDbError, isForeignKeyViolation } from "../lib/db-errors";
import { countDependencies } from "../lib/referential-deps";
import { decideDeleteAction } from "../lib/smart-delete";
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
  const q = z.object({ includeInactive: z.coerce.boolean().optional() }).safeParse(req.query);
  const includeInactive = q.success ? q.data.includeInactive === true : false;
  const rows = includeInactive
    ? await db.select().from(productsTable).orderBy(productsTable.name)
    : await db.select().from(productsTable).where(eq(productsTable.isActive, true)).orderBy(productsTable.name);
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
    writeAudit({
      userId: req.user!.id,
      tableName: "products",
      recordId: row.id,
      action: "create",
      newValues: row as Record<string, unknown>,
    });
    res.status(201).json(formatProduct(row));
  } catch (err) {
    const mapped = mapDbError(err);
    if (mapped) {
      res.status(mapped.status).json(mapped.body);
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
    const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    try {
      const [row] = await db
        .update(productsTable)
        .set(parsed.data)
        .where(eq(productsTable.id, params.data.id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Product not found" });
        return;
      }
      writeAudit({
        userId: req.user!.id,
        tableName: "products",
        recordId: row.id,
        action: "update",
        oldValues: existing as Record<string, unknown>,
        newValues: row as Record<string, unknown>,
      });
      res.json(formatProduct(row));
    } catch (err) {
      const mapped = mapDbError(err);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
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
    const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const deps = await countDependencies("products", id);
    const decision = decideDeleteAction(deps);

    if (decision.kind === "block") {
      res.status(409).json({ error: decision.reason });
      return;
    }

    if (decision.kind === "hard_delete") {
      try {
        await db.delete(productsTable).where(eq(productsTable.id, id));
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          res.status(409).json({ error: "Suppression impossible: dépendance détectée." });
          return;
        }
        throw err;
      }
      writeAudit({
        userId: req.user!.id,
        tableName: "products",
        recordId: id,
        action: "delete",
        oldValues: existing as Record<string, unknown>,
      });
      res.sendStatus(204);
      return;
    }

    // deactivate
    const [row] = await db.update(productsTable).set({ isActive: false }).where(eq(productsTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    writeAudit({
      userId: req.user!.id,
      tableName: "products",
      recordId: row.id,
      action: "deactivate",
      oldValues: existing as Record<string, unknown>,
      newValues: row as Record<string, unknown>,
    });
    res.status(200).json(formatProduct(row));
  },
);

router.post(
  "/products/:id/reactivate",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const params = UpdateProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (existing.isActive === true) {
      res.status(200).json(formatProduct(existing));
      return;
    }
    const [row] = await db
      .update(productsTable)
      .set({ isActive: true })
      .where(eq(productsTable.id, params.data.id))
      .returning();
    writeAudit({
      userId: req.user!.id,
      tableName: "products",
      recordId: row.id,
      action: "reactivate",
      oldValues: existing as Record<string, unknown>,
      newValues: row as Record<string, unknown>,
    });
    res.status(200).json(formatProduct(row));
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
