import { Router, IRouter } from "express";
import { db, productsTable, cadencesTable, equipmentsTable, productPresentationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { mapDbError, isForeignKeyViolation, isUniqueViolation, getConstraintName } from "../lib/db-errors";
import { countDependencies } from "../lib/referential-deps";
import { decideDeleteAction } from "../lib/smart-delete";
import { writeAudit } from "../lib/audit";
import { z } from "zod/v4";
import {
  CreateProductBody,
  UpdateProductBody,
  UpdateProductParams,
  ListProductsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatProduct(p: typeof productsTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description ?? null,
    dosage: p.dosage ?? null,
    pharmaceuticalForm: p.pharmaceuticalForm ?? null,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const q = ListProductsQueryParams.safeParse(req.query);
  const includeInactive = q.success ? q.data.includeInactive === true : false;
  const rows = includeInactive
    ? await db.select().from(productsTable).orderBy(productsTable.name)
    : await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.isActive, true))
        .orderBy(productsTable.name);
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
    const [existing] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (parsed.data.code !== undefined && parsed.data.code !== existing.code) {
      const deps = await countDependencies("products", params.data.id);
      if (deps.historical > 0) {
        res.status(409).json({
          error:
            "Le code est immuable: ce produit est référencé par des données historiques (production, présentations, KPI ou cadences).",
        });
        return;
      }
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

    if (existing.isActive === false) {
      res.status(200).json(formatProduct(existing));
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
    const [row] = await db
      .update(productsTable)
      .set({ isActive: false })
      .where(eq(productsTable.id, id))
      .returning();
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
    const [existing] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id));
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

// ─── Local Zod schemas for cadence routes (Phase 5) ─────────────────────────
const ListCadencesQueryParams = z.object({
  productId: z.string().uuid().optional(),
  equipmentId: z.string().uuid().optional(),
  presentationId: z.string().uuid().optional(),
  includeInactive: z.preprocess((v) => v === "true" || v === "1", z.boolean()).optional(),
});

const CreateCadenceBody = z.object({
  productId: z.string().uuid(),
  equipmentId: z.string().uuid(),
  presentationId: z.string().uuid(),
  theoreticalCadence: z.number().min(0),
  validatedCadence: z.number().min(0),
  unit: z.string().optional(),
  notes: z.string().optional(),
});

// Cadences
router.get("/cadences", requireAuth, async (req, res): Promise<void> => {
  const query = ListCadencesQueryParams.safeParse(req.query);
  const includeInactive = query.success && query.data.includeInactive === true;

  const dbQuery = db
    .select({
      id: cadencesTable.id,
      productId: cadencesTable.productId,
      equipmentId: cadencesTable.equipmentId,
      presentationId: cadencesTable.presentationId,
      theoreticalCadence: cadencesTable.theoreticalCadence,
      validatedCadence: cadencesTable.validatedCadence,
      unit: cadencesTable.unit,
      validatedAt: cadencesTable.validatedAt,
      validatedBy: cadencesTable.validatedBy,
      notes: cadencesTable.notes,
      isActive: cadencesTable.isActive,
      createdAt: cadencesTable.createdAt,
      updatedAt: cadencesTable.updatedAt,
      productName: productsTable.name,
      equipmentName: equipmentsTable.name,
      presentationName: productPresentationsTable.presentationName,
    })
    .from(cadencesTable)
    .leftJoin(productsTable, eq(cadencesTable.productId, productsTable.id))
    .leftJoin(equipmentsTable, eq(cadencesTable.equipmentId, equipmentsTable.id))
    .leftJoin(productPresentationsTable, eq(cadencesTable.presentationId, productPresentationsTable.id));

  const conditions = [];
  if (!includeInactive) {
    conditions.push(eq(cadencesTable.isActive, true));
  }
  if (query.success && query.data.productId) {
    conditions.push(eq(cadencesTable.productId, query.data.productId));
  }
  if (query.success && query.data.equipmentId) {
    conditions.push(eq(cadencesTable.equipmentId, query.data.equipmentId));
  }
  if (query.success && query.data.presentationId) {
    conditions.push(eq(cadencesTable.presentationId, query.data.presentationId));
  }

  const rows = conditions.length > 0 ? await dbQuery.where(and(...conditions)) : await dbQuery;

  res.json(
    rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      equipmentId: r.equipmentId,
      presentationId: r.presentationId ?? null,
      theoreticalCadence: parseFloat(r.theoreticalCadence as unknown as string),
      validatedCadence: parseFloat(r.validatedCadence as unknown as string),
      unit: r.unit,
      validatedAt: r.validatedAt ? r.validatedAt.toISOString() : null,
      validatedBy: r.validatedBy ?? null,
      notes: r.notes ?? null,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      productName: r.productName ?? null,
      equipmentName: r.equipmentName ?? null,
      presentationName: r.presentationName ?? null,
    })),
  );
});

router.post("/cadences", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateCadenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productId, equipmentId, presentationId, theoreticalCadence, validatedCadence, unit, notes } = parsed.data;

  // Validate that presentationId belongs to the specified product
  const [presentation] = await db
    .select()
    .from(productPresentationsTable)
    .where(
      and(
        eq(productPresentationsTable.id, presentationId),
        eq(productPresentationsTable.productId, productId),
      ),
    );

  if (!presentation) {
    res.status(400).json({ error: "PRESENTATION_PRODUCT_MISMATCH", message: "La presentation ne correspond pas au produit" });
    return;
  }

  try {
    const row = await db.transaction(async (tx) => {
      // Deactivate any prior active cadence for the same triplet
      await tx
        .update(cadencesTable)
        .set({ isActive: false })
        .where(
          and(
            eq(cadencesTable.productId, productId),
            eq(cadencesTable.equipmentId, equipmentId),
            eq(cadencesTable.presentationId, presentationId),
            eq(cadencesTable.isActive, true),
          ),
        );

      // Insert new cadence
      const [inserted] = await tx
        .insert(cadencesTable)
        .values({
          productId,
          equipmentId,
          presentationId,
          theoreticalCadence: theoreticalCadence.toString(),
          validatedCadence: validatedCadence.toString(),
          unit: unit ?? "units/hour",
          notes: notes ?? null,
          isActive: true,
        })
        .returning();

      return inserted;
    });

    writeAudit({
      userId: req.user!.id,
      tableName: "cadences",
      recordId: row.id,
      action: "create",
      newValues: { productId, equipmentId, presentationId, theoreticalCadence, validatedCadence } as Record<string, unknown>,
    });

    // Fetch with joined names
    const [full] = await db
      .select({
        id: cadencesTable.id,
        productId: cadencesTable.productId,
        equipmentId: cadencesTable.equipmentId,
        presentationId: cadencesTable.presentationId,
        theoreticalCadence: cadencesTable.theoreticalCadence,
        validatedCadence: cadencesTable.validatedCadence,
        unit: cadencesTable.unit,
        validatedAt: cadencesTable.validatedAt,
        validatedBy: cadencesTable.validatedBy,
        notes: cadencesTable.notes,
        isActive: cadencesTable.isActive,
        createdAt: cadencesTable.createdAt,
        updatedAt: cadencesTable.updatedAt,
        productName: productsTable.name,
        equipmentName: equipmentsTable.name,
        presentationName: productPresentationsTable.presentationName,
      })
      .from(cadencesTable)
      .leftJoin(productsTable, eq(cadencesTable.productId, productsTable.id))
      .leftJoin(equipmentsTable, eq(cadencesTable.equipmentId, equipmentsTable.id))
      .leftJoin(productPresentationsTable, eq(cadencesTable.presentationId, productPresentationsTable.id))
      .where(eq(cadencesTable.id, row.id));

    res.status(201).json({
      id: full.id,
      productId: full.productId,
      equipmentId: full.equipmentId,
      presentationId: full.presentationId ?? null,
      theoreticalCadence: parseFloat(full.theoreticalCadence as unknown as string),
      validatedCadence: parseFloat(full.validatedCadence as unknown as string),
      unit: full.unit,
      validatedAt: full.validatedAt ? full.validatedAt.toISOString() : null,
      validatedBy: full.validatedBy ?? null,
      notes: full.notes ?? null,
      isActive: full.isActive,
      createdAt: full.createdAt.toISOString(),
      updatedAt: full.updatedAt.toISOString(),
      productName: full.productName ?? null,
      equipmentName: full.equipmentName ?? null,
      presentationName: full.presentationName ?? null,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const constraint = getConstraintName(err);
      if (constraint === "cadences_active_triplet_unique") {
        res.status(409).json({ error: "ACTIVE_TRIPLET_CONFLICT", message: "Une cadence active existe deja pour ce triplet produit/equipement/presentation" });
      } else {
        res.status(409).json({ error: "LEGACY_VALID_FROM_CONFLICT", message: "Un conflit d'unicite a ete detecte (product, equipment, validFrom)" });
      }
      return;
    }
    throw err;
  }
});

router.post("/cadences/:id/reactivate", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const cadenceId = req.params["id"] as string;

  const [existing] = await db.select().from(cadencesTable).where(eq(cadencesTable.id, cadenceId));
  if (!existing) {
    res.status(404).json({ error: "Cadence introuvable" });
    return;
  }

  if (existing.isActive) {
    res.status(200).json({ message: "Cadence deja active" });
    return;
  }

  // Check for active conflict on the same triplet
  if (existing.presentationId) {
    const [conflict] = await db
      .select()
      .from(cadencesTable)
      .where(
        and(
          eq(cadencesTable.productId, existing.productId),
          eq(cadencesTable.equipmentId, existing.equipmentId),
          eq(cadencesTable.presentationId, existing.presentationId),
          eq(cadencesTable.isActive, true),
        ),
      );

    if (conflict) {
      res.status(409).json({ error: "ACTIVE_TRIPLET_CONFLICT", message: "Une cadence active existe deja pour ce triplet" });
      return;
    }
  }

  await db
    .update(cadencesTable)
    .set({ isActive: true })
    .where(eq(cadencesTable.id, cadenceId));

  writeAudit({
    userId: req.user!.id,
    tableName: "cadences",
    recordId: cadenceId,
    action: "reactivate",
    oldValues: { isActive: false } as Record<string, unknown>,
    newValues: { isActive: true } as Record<string, unknown>,
  });

  res.status(200).json({ message: "Cadence reactivee" });
});

router.delete("/cadences/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const cadenceId = req.params["id"] as string;

  const [existing] = await db.select().from(cadencesTable).where(eq(cadencesTable.id, cadenceId));
  if (!existing) {
    res.status(404).json({ error: "Cadence introuvable" });
    return;
  }

  await db
    .update(cadencesTable)
    .set({ isActive: false })
    .where(eq(cadencesTable.id, cadenceId));

  writeAudit({
    userId: req.user!.id,
    tableName: "cadences",
    recordId: cadenceId,
    action: "deactivate",
    oldValues: { isActive: true } as Record<string, unknown>,
    newValues: { isActive: false } as Record<string, unknown>,
  });

  res.status(200).json({ message: "Cadence desactivee" });
});

router.post("/cadences/:id/validate", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const cadenceId = req.params["id"] as string;

  const [existing] = await db.select().from(cadencesTable).where(eq(cadencesTable.id, cadenceId));
  if (!existing) {
    res.status(404).json({ error: "Cadence introuvable" });
    return;
  }

  await db
    .update(cadencesTable)
    .set({ validatedAt: new Date(), validatedBy: req.user!.id })
    .where(eq(cadencesTable.id, cadenceId));

  writeAudit({
    userId: req.user!.id,
    tableName: "cadences",
    recordId: cadenceId,
    action: "validate",
    oldValues: { validatedAt: existing.validatedAt, validatedBy: existing.validatedBy } as Record<string, unknown>,
    newValues: { validatedAt: new Date().toISOString(), validatedBy: req.user!.id } as Record<string, unknown>,
  });

  res.status(200).json({ message: "Cadence validee" });
});

export default router;
