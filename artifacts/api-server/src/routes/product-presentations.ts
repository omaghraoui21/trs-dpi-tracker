import { Router, IRouter } from "express";
import { db, productPresentationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/products/:id/presentations", requireAuth, async (req, res): Promise<void> => {
  const productId = req.params["id"] as string;
  const rows = await db.select().from(productPresentationsTable).where(eq(productPresentationsTable.productId, productId));
  res.json(rows.map(r => ({
    id: r.id,
    productId: r.productId,
    presentationName: r.presentationName,
    presentationType: r.presentationType,
    unit: r.unit,
    unitsPerBox: r.unitsPerBox,
    blistersPerBox: r.blistersPerBox,
    capsulesPerBlister: r.capsulesPerBlister,
    isCombiforComponent: r.isCombiforComponent,
    isCombiforFinishedProduct: r.isCombiforFinishedProduct,
    needsConfirmation: r.needsConfirmation,
    validationStatus: r.validationStatus,
    comment: r.comment,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

export default router;
