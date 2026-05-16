import { Router, IRouter } from "express";
import { db, equipmentsTable, roomsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { cache30 } from "../lib/cache-control";
import { mapDbError, isForeignKeyViolation } from "../lib/db-errors";
import { countDependencies } from "../lib/referential-deps";
import { decideDeleteAction } from "../lib/smart-delete";
import { writeAudit } from "../lib/audit";
import {
  CreateEquipmentBody,
  UpdateEquipmentBody,
  UpdateEquipmentParams,
  ListEquipmentsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type EquipmentRow = typeof equipmentsTable.$inferSelect;
type RoomLabelInput = { code: string | null; name: string | null } | null;

function formatEquipmentRow(e: EquipmentRow, room: RoomLabelInput) {
  const roomLabel = room && room.code && room.name ? `${room.code} - ${room.name}` : null;
  return {
    id: e.id,
    name: e.name,
    code: e.code,
    description: e.description ?? null,
    trsObjective: parseFloat(e.trsObjective as unknown as string),
    equipmentType: e.equipmentType ?? null,
    roomId: e.roomId ?? null,
    roomLabel,
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
  };
}

// Resolve roomLabel for write-path responses (POST/PATCH/DELETE-deactivate/
// reactivate) so the body matches the next GET. One extra SELECT only when
// the row actually links to a room; the rooms table is small and these write
// paths are not on the hot path.
//
// Best-effort by design: there is a TOCTOU window between the equipment write
// (already committed when this helper is called) and the room SELECT below.
// If a concurrent transaction deletes the linked room in that window, the
// helper falls through to roomLabel=null even though e.roomId is non-null.
// That body shape is identical to what the next GET would return (the leftJoin
// also yields null on a missing room), so the response is internally
// consistent. Folding the room into the equipment write's RETURNING via a
// joined SELECT would close the window but would still need a manual
// round-trip (Drizzle's update().returning() does not natively join), so we
// accept this best-effort behavior for the admin UX.
async function formatEquipmentRowAsync(e: EquipmentRow) {
  if (!e.roomId) {
    return formatEquipmentRow(e, null);
  }
  const [room] = await db
    .select({ code: roomsTable.code, name: roomsTable.name })
    .from(roomsTable)
    .where(eq(roomsTable.id, e.roomId));
  return formatEquipmentRow(e, room ?? null);
}

router.get(
  "/equipments",
  requireAuth,
  cache30,
  asyncHandler(async (req, res) => {
    const q = ListEquipmentsQueryParams.safeParse(req.query);
    const includeInactive = q.success ? q.data.includeInactive === true : false;

    const baseQuery = db
      .select({
        id: equipmentsTable.id,
        siteId: equipmentsTable.siteId,
        roomId: equipmentsTable.roomId,
        code: equipmentsTable.code,
        name: equipmentsTable.name,
        equipmentType: equipmentsTable.equipmentType,
        description: equipmentsTable.description,
        trsObjective: equipmentsTable.trsObjective,
        isActive: equipmentsTable.isActive,
        createdAt: equipmentsTable.createdAt,
        updatedAt: equipmentsTable.updatedAt,
        roomCode: roomsTable.code,
        roomName: roomsTable.name,
      })
      .from(equipmentsTable)
      .leftJoin(roomsTable, eq(equipmentsTable.roomId, roomsTable.id));

    const rows = includeInactive
      ? await baseQuery.orderBy(equipmentsTable.name)
      : await baseQuery.where(eq(equipmentsTable.isActive, true)).orderBy(equipmentsTable.name);

    res.json(
      rows.map((row: { roomCode: string | null; roomName: string | null } & EquipmentRow) => {
        const { roomCode, roomName, ...equipment } = row;
        const room = roomCode || roomName ? { code: roomCode, name: roomName } : null;
        return formatEquipmentRow(equipment as EquipmentRow, room);
      }),
    );
  }),
);

router.post(
  "/equipments",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = CreateEquipmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // Code is the establishing identifier on create; immutability only applies to subsequent PATCH.
    try {
      const [row] = await db
        .insert(equipmentsTable)
        .values({
          ...parsed.data,
          trsObjective: parsed.data.trsObjective.toString(),
        })
        .returning();
      writeAudit({
        userId: req.user!.id,
        tableName: "equipments",
        recordId: row.id,
        action: "create",
        newValues: row as Record<string, unknown>,
      });
      res.status(201).json(await formatEquipmentRowAsync(row));
    } catch (err) {
      const mapped = mapDbError(err);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }
  }),
);

router.patch(
  "/equipments/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const params = UpdateEquipmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateEquipmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(equipmentsTable)
      .where(eq(equipmentsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    if (parsed.data.code !== undefined && parsed.data.code !== existing.code) {
      const deps = await countDependencies("equipments", params.data.id);
      if (deps.historical > 0) {
        res.status(409).json({
          error:
            "Le code est immuable: cet équipement est référencé par des données historiques (production, saisies journalières, arrêts, KPI ou cadences).",
        });
        return;
      }
    }
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.trsObjective !== undefined) {
      updateData.trsObjective = parsed.data.trsObjective.toString();
    }
    try {
      const [row] = await db
        .update(equipmentsTable)
        .set(updateData)
        .where(eq(equipmentsTable.id, params.data.id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Equipment not found" });
        return;
      }
      writeAudit({
        userId: req.user!.id,
        tableName: "equipments",
        recordId: row.id,
        action: "update",
        oldValues: existing as Record<string, unknown>,
        newValues: row as Record<string, unknown>,
      });
      res.json(await formatEquipmentRowAsync(row));
    } catch (err) {
      const mapped = mapDbError(err);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }
  }),
);

router.delete(
  "/equipments/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "ID requis" });
      return;
    }
    const [existing] = await db.select().from(equipmentsTable).where(eq(equipmentsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }

    if (existing.isActive === false) {
      res.status(200).json(await formatEquipmentRowAsync(existing));
      return;
    }

    const deps = await countDependencies("equipments", id);
    const decision = decideDeleteAction(deps);

    if (decision.kind === "block") {
      res.status(409).json({ error: decision.reason });
      return;
    }

    if (decision.kind === "hard_delete") {
      try {
        await db.delete(equipmentsTable).where(eq(equipmentsTable.id, id));
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          res.status(409).json({ error: "Suppression impossible: dépendance détectée." });
          return;
        }
        throw err;
      }
      writeAudit({
        userId: req.user!.id,
        tableName: "equipments",
        recordId: id,
        action: "delete",
        oldValues: existing as Record<string, unknown>,
      });
      res.sendStatus(204);
      return;
    }

    // deactivate
    const [row] = await db
      .update(equipmentsTable)
      .set({ isActive: false })
      .where(eq(equipmentsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    writeAudit({
      userId: req.user!.id,
      tableName: "equipments",
      recordId: row.id,
      action: "deactivate",
      oldValues: existing as Record<string, unknown>,
      newValues: row as Record<string, unknown>,
    });
    res.status(200).json(await formatEquipmentRowAsync(row));
  }),
);

router.post(
  "/equipments/:id/reactivate",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const params = UpdateEquipmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(equipmentsTable)
      .where(eq(equipmentsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Equipment not found" });
      return;
    }
    if (existing.isActive === true) {
      res.status(200).json(await formatEquipmentRowAsync(existing));
      return;
    }
    const [row] = await db
      .update(equipmentsTable)
      .set({ isActive: true })
      .where(eq(equipmentsTable.id, params.data.id))
      .returning();
    writeAudit({
      userId: req.user!.id,
      tableName: "equipments",
      recordId: row.id,
      action: "reactivate",
      oldValues: existing as Record<string, unknown>,
      newValues: row as Record<string, unknown>,
    });
    res.status(200).json(await formatEquipmentRowAsync(row));
  }),
);

export default router;
