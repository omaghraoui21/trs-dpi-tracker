import { Router, type IRouter } from "express";
import { db, roomsTable, equipmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache30 } from "../lib/cache-control";

const router: IRouter = Router();

router.get(
  "/rooms",
  requireAuth,
  cache30,
  asyncHandler(async (_req, res) => {
    const rooms = await db
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.status, "active"))
      .orderBy(roomsTable.code);

    const equipments = await db
      .select()
      .from(equipmentsTable)
      .where(eq(equipmentsTable.isActive, true))
      .orderBy(equipmentsTable.name);

    const result = rooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      roomType: r.roomType ?? null,
      equipments: equipments
        .filter((e) => e.roomId === r.id)
        .map((e) => ({
          id: e.id,
          code: e.code,
          name: e.name,
          trsObjective: parseFloat(e.trsObjective as unknown as string),
        })),
    }));

    res.json(result);
  }),
);

export default router;
