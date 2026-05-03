import { Router, IRouter } from "express";
import { db, monthlyClosuresTable, usersTable, equipmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  ListMonthlyClosuresQueryParams,
  CreateMonthlyClosureBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/monthly-closures", requireAuth, async (req, res): Promise<void> => {
  const query = ListMonthlyClosuresQueryParams.safeParse(req.query);
  const rows = await db
    .select({
      id: monthlyClosuresTable.id,
      month: monthlyClosuresTable.month,
      year: monthlyClosuresTable.year,
      equipmentId: monthlyClosuresTable.equipmentId,
      lockedById: monthlyClosuresTable.lockedById,
      lockedAt: monthlyClosuresTable.lockedAt,
      comment: monthlyClosuresTable.comment,
      lockedByFirstName: usersTable.firstName,
      lockedByLastName: usersTable.lastName,
    })
    .from(monthlyClosuresTable)
    .leftJoin(usersTable, eq(monthlyClosuresTable.lockedById, usersTable.id))
    .orderBy(monthlyClosuresTable.year, monthlyClosuresTable.month);

  res.json(rows.map(r => ({
    id: r.id,
    month: r.month,
    year: r.year,
    equipmentId: r.equipmentId ?? null,
    lockedById: r.lockedById,
    lockedByName: r.lockedByFirstName && r.lockedByLastName ? `${r.lockedByFirstName} ${r.lockedByLastName}` : null,
    lockedAt: r.lockedAt.toISOString(),
    comment: r.comment ?? null,
  })));
});

router.post("/monthly-closures", requireAuth, requireRole("supervisor", "admin"), async (req, res): Promise<void> => {
  const parsed = CreateMonthlyClosureBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(monthlyClosuresTable).values({
    month: parsed.data.month,
    year: parsed.data.year,
    equipmentId: parsed.data.equipmentId ?? null,
    lockedById: req.user!.id,
    comment: parsed.data.comment ?? null,
  }).returning();

  const [full] = await db
    .select({
      id: monthlyClosuresTable.id,
      month: monthlyClosuresTable.month,
      year: monthlyClosuresTable.year,
      equipmentId: monthlyClosuresTable.equipmentId,
      lockedById: monthlyClosuresTable.lockedById,
      lockedAt: monthlyClosuresTable.lockedAt,
      comment: monthlyClosuresTable.comment,
      lockedByFirstName: usersTable.firstName,
      lockedByLastName: usersTable.lastName,
    })
    .from(monthlyClosuresTable)
    .leftJoin(usersTable, eq(monthlyClosuresTable.lockedById, usersTable.id))
    .where(eq(monthlyClosuresTable.id, row.id));

  res.status(201).json({
    id: full.id,
    month: full.month,
    year: full.year,
    equipmentId: full.equipmentId ?? null,
    lockedById: full.lockedById,
    lockedByName: full.lockedByFirstName && full.lockedByLastName ? `${full.lockedByFirstName} ${full.lockedByLastName}` : null,
    lockedAt: full.lockedAt.toISOString(),
    comment: full.comment ?? null,
  });
});

export default router;
