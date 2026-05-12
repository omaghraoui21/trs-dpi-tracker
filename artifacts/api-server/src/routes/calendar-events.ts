import { Router, type IRouter } from "express";
import { db, annualCalendarEventsTable, equipmentsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../lib/async-handler";
import { eq, and, gte, lte, or } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const EVENT_TYPES = ["CLOSURE", "HOLIDAY", "QUALIFICATION", "TRIAL", "CLEANING_MAJOR"] as const;
const SCOPES = ["SITE", "EQUIPMENT"] as const;

const CreateEventSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  scope: z.enum(SCOPES).default("SITE"),
  label: z.string().min(1).max(200),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutesPerDay: z.number().int().min(0).max(1440).optional().nullable(),
  allDay: z.boolean().default(true),
  isRecurringAnnual: z.boolean().default(false),
  equipmentId: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const UpdateEventSchema = CreateEventSchema.partial();

/**
 * GET /api/calendar-events
 * Query: year, dateFrom, dateTo, eventType, equipmentId, scope
 */
router.get(
  "/calendar-events",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { year, dateFrom, dateTo, eventType, equipmentId } = req.query as Record<string, string>;

    const filters: ReturnType<typeof eq>[] = [];

    if (dateFrom)
      filters.push(gte(annualCalendarEventsTable.dateFrom, dateFrom) as ReturnType<typeof eq>);
    if (dateTo)
      filters.push(lte(annualCalendarEventsTable.dateTo, dateTo) as ReturnType<typeof eq>);
    if (!dateFrom && !dateTo && year) {
      const y = parseInt(year);
      filters.push(gte(annualCalendarEventsTable.dateTo, `${y}-01-01`) as ReturnType<typeof eq>);
      filters.push(lte(annualCalendarEventsTable.dateFrom, `${y}-12-31`) as ReturnType<typeof eq>);
    }
    if (eventType)
      filters.push(
        eq(
          annualCalendarEventsTable.eventType,
          eventType as (typeof EVENT_TYPES)[number],
        ) as ReturnType<typeof eq>,
      );
    if (equipmentId) {
      filters.push(
        or(
          eq(annualCalendarEventsTable.equipmentId, equipmentId),
          eq(annualCalendarEventsTable.scope, "SITE"),
        ) as ReturnType<typeof eq>,
      );
    }

    const rows = await db
      .select({
        id: annualCalendarEventsTable.id,
        eventType: annualCalendarEventsTable.eventType,
        scope: annualCalendarEventsTable.scope,
        label: annualCalendarEventsTable.label,
        dateFrom: annualCalendarEventsTable.dateFrom,
        dateTo: annualCalendarEventsTable.dateTo,
        durationMinutesPerDay: annualCalendarEventsTable.durationMinutesPerDay,
        allDay: annualCalendarEventsTable.allDay,
        isRecurringAnnual: annualCalendarEventsTable.isRecurringAnnual,
        equipmentId: annualCalendarEventsTable.equipmentId,
        notes: annualCalendarEventsTable.notes,
        createdAt: annualCalendarEventsTable.createdAt,
        equipmentName: equipmentsTable.name,
      })
      .from(annualCalendarEventsTable)
      .leftJoin(equipmentsTable, eq(annualCalendarEventsTable.equipmentId, equipmentsTable.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(annualCalendarEventsTable.dateFrom);

    res.json(rows);
  }),
);

/**
 * GET /api/calendar-events/impact
 * Returns TO/TR deduction summary for a given month/year (and optional equipmentId)
 * Used by dashboard to adjust tO and tR calculations
 */
router.get(
  "/calendar-events/impact",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { year, month, equipmentId } = req.query as Record<string, string>;
    if (!year || !month) {
      res.status(400).json({ error: "year and month are required" });
      return;
    }

    const y = parseInt(year);
    const m = parseInt(month);
    const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
    const daysInMonth = new Date(y, m, 0).getDate();
    const dateTo = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const rows = await db
      .select()
      .from(annualCalendarEventsTable)
      .where(
        and(
          lte(annualCalendarEventsTable.dateFrom, dateTo),
          gte(annualCalendarEventsTable.dateTo, dateFrom),
        ),
      );

    const relevant = equipmentId
      ? rows.filter((r) => r.scope === "SITE" || r.equipmentId === equipmentId)
      : rows;

    let closureMinutes = 0;
    let qualificationMinutes = 0;
    let trialMinutes = 0;
    let cleaningMajorMinutes = 0;
    let holidayMinutes = 0;

    const eventsByDate: Record<string, { type: string; label: string }[]> = {};

    for (const event of relevant) {
      const start = new Date(event.dateFrom + "T00:00:00Z");
      const end = new Date(event.dateTo + "T00:00:00Z");
      const rangeStart = new Date(dateFrom + "T00:00:00Z");
      const rangeEnd = new Date(dateTo + "T00:00:00Z");
      const effectiveStart = start < rangeStart ? rangeStart : start;
      const effectiveEnd = end > rangeEnd ? rangeEnd : end;

      const cur = new Date(effectiveStart);
      while (cur <= effectiveEnd) {
        const dateStr = cur.toISOString().slice(0, 10);
        const minPerDay = event.allDay ? 1440 : (event.durationMinutesPerDay ?? 1440);
        switch (event.eventType) {
          case "CLOSURE":
            closureMinutes += minPerDay;
            break;
          case "HOLIDAY":
            holidayMinutes += minPerDay;
            break;
          case "QUALIFICATION":
            qualificationMinutes += minPerDay;
            break;
          case "TRIAL":
            trialMinutes += minPerDay;
            break;
          case "CLEANING_MAJOR":
            cleaningMajorMinutes += minPerDay;
            break;
        }
        if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
        eventsByDate[dateStr].push({ type: event.eventType, label: event.label });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    const totalCalendarMinutes = daysInMonth * 1440;
    const tODeductionMinutes = closureMinutes + holidayMinutes;
    const tRDeductionMinutes = qualificationMinutes + trialMinutes + cleaningMajorMinutes;
    const totalTO = Math.max(0, totalCalendarMinutes - tODeductionMinutes);
    const totalTR = Math.max(0, totalTO - tRDeductionMinutes);

    res.json({
      year: y,
      month: m,
      daysInMonth,
      totalCalendarMinutes,
      closureMinutes,
      holidayMinutes,
      qualificationMinutes,
      trialMinutes,
      cleaningMajorMinutes,
      tODeductionMinutes,
      tRDeductionMinutes,
      totalTO,
      totalTR,
      eventsByDate,
      eventCount: relevant.length,
    });
  }),
);

/**
 * POST /api/calendar-events
 */
router.post(
  "/calendar-events",
  requireAuth,
  requireRole("supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const parsed = CreateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    if (data.dateTo < data.dateFrom) {
      res.status(400).json({ error: "dateTo doit être >= dateFrom" });
      return;
    }

    const [row] = await db
      .insert(annualCalendarEventsTable)
      .values({
        eventType: data.eventType,
        scope: data.scope,
        label: data.label,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        durationMinutesPerDay: data.durationMinutesPerDay ?? null,
        allDay: data.allDay,
        isRecurringAnnual: data.isRecurringAnnual,
        equipmentId: data.equipmentId ?? null,
        notes: data.notes ?? null,
        plannedByUserId: (req as { user?: { id: string } }).user?.id ?? null,
      })
      .returning();

    res.status(201).json(row);
  }),
);

/**
 * PATCH /api/calendar-events/:id
 */
router.patch(
  "/calendar-events/:id",
  requireAuth,
  requireRole("supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const parsed = UpdateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error.issues });
      return;
    }

    const [existing] = await db
      .select()
      .from(annualCalendarEventsTable)
      .where(eq(annualCalendarEventsTable.id, String(id)));
    if (!existing) {
      res.status(404).json({ error: "Événement non trouvé" });
      return;
    }

    const data = parsed.data;
    if (data.dateFrom && data.dateTo && data.dateTo < data.dateFrom) {
      res.status(400).json({ error: "dateTo doit être >= dateFrom" });
      return;
    }

    const [updated] = await db
      .update(annualCalendarEventsTable)
      .set({ ...data })
      .where(eq(annualCalendarEventsTable.id, String(id)))
      .returning();

    res.json(updated);
  }),
);

/**
 * DELETE /api/calendar-events/:id
 */
router.delete(
  "/calendar-events/:id",
  requireAuth,
  requireRole("supervisor", "admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [existing] = await db
      .select()
      .from(annualCalendarEventsTable)
      .where(eq(annualCalendarEventsTable.id, String(id)));
    if (!existing) {
      res.status(404).json({ error: "Événement non trouvé" });
      return;
    }

    await db.delete(annualCalendarEventsTable).where(eq(annualCalendarEventsTable.id, String(id)));
    res.status(204).send();
  }),
);

export default router;
