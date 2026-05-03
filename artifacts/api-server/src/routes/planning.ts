import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, productionPlansTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { eq, and, gte, lte, desc, sql, max, count } from "drizzle-orm";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- Activity → equipment/room mapping ---
const ACTIVITY_MAP: Record<string, { equipment: string | null; room: string | null }> = {
  "Pesée": { equipment: null, room: "Local A23" },
  "Fabrication": { equipment: null, room: "Local A23" },
  "Mise en gélules": { equipment: "Géluleuse Harro Höfliger", room: "Local A23" },
  "Conditionnement primaire": { equipment: "Blistereuse IMA TR135 S", room: null },
  "Conditionnement secondaire & tertiaire 1ère ligne": { equipment: "Ligne conditionnement secondaire 1", room: null },
  "Conditionnement secondaire & tertiaire 2ème ligne": { equipment: "Ligne conditionnement secondaire 2", room: null },
};

const SPECIAL_KEYWORDS = ["entretien préventif", "nettoyage", "étalonnage", "etalonnage", "laverie"];

function excelDateToISO(serial: number): string {
  // Excel date serial → JS Date (Excel epoch = Jan 1 1900, adjusted for leap year bug)
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

function getCellStr(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return "";
  return String(cell.v ?? "").trim();
}

function parseProductCell(raw: string): { productName: string | null; quantity: number | null; unit: string | null; specialActivity: string | null } {
  if (!raw) return { productName: null, quantity: null, unit: null, specialActivity: null };
  const lower = raw.toLowerCase();
  for (const kw of SPECIAL_KEYWORDS) {
    if (lower.includes(kw)) {
      return { productName: null, quantity: null, unit: null, specialActivity: raw.split("\n")[0].trim() };
    }
  }
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  const productName = lines[0] || null;
  let quantity: number | null = null;
  let unit: string | null = null;
  if (lines[1]) {
    const qMatch = lines[1].replace(/\s/g, "").match(/^([\d]+(?:[.,]\d+)?)([A-Za-z]+)?$/);
    if (qMatch) {
      quantity = parseFloat(qMatch[1].replace(",", "."));
      unit = qMatch[2] ?? "UN";
    } else {
      const qMatch2 = lines[1].match(/([0-9][0-9\s]*(?:[.,]\d+)?)\s*([A-Za-zµ]+[\w\s]*)$/);
      if (qMatch2) {
        quantity = parseFloat(qMatch2[1].replace(/\s/g, "").replace(",", "."));
        unit = qMatch2[2]?.trim() ?? "UN";
      }
    }
  }
  return { productName, quantity, unit, specialActivity: null };
}

function matchActivity(raw: string): string {
  if (!raw) return raw;
  for (const key of Object.keys(ACTIVITY_MAP)) {
    if (raw.startsWith(key.slice(0, 20))) return key;
  }
  return raw;
}

interface PlanRow {
  weekNumber: number;
  year: number;
  date: string;
  dayName: string;
  activityType: string;
  team: string | null;
  equipment: string | null;
  room: string | null;
  productName: string | null;
  lotNumber: string | null;
  plannedQuantity: number | null;
  plannedUnit: string | null;
  specialActivity: string | null;
}

interface ParseResult {
  weekNumber: number;
  year: number;
  rows: PlanRow[];
  anomalies: string[];
}

function parseExcel(buffer: Buffer, fileName: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const maxRow = range.e.r;
  const maxCol = range.e.c;

  const anomalies: string[] = [];

  // --- Step 1: Find week/year from cell A in row that contains "S\d+\n\d{4}" ---
  let weekNumber = 0;
  let year = new Date().getFullYear();
  for (let r = 0; r <= Math.min(5, maxRow); r++) {
    const v = getCellStr(sheet, r, 0);
    const m = v.match(/S(\d+)[^0-9]+(\d{4})/);
    if (m) { weekNumber = parseInt(m[1]); year = parseInt(m[2]); break; }
  }
  if (!weekNumber) anomalies.push("Numéro de semaine non détecté");

  // --- Step 2: Find the day header row ---
  let dayHeaderRow = -1;
  const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  for (let r = 0; r <= Math.min(6, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      if (getCellStr(sheet, r, c) === "Lundi") { dayHeaderRow = r; break; }
    }
    if (dayHeaderRow >= 0) break;
  }
  if (dayHeaderRow < 0) { anomalies.push("En-têtes des jours non trouvés"); return { weekNumber, year, rows: [], anomalies }; }

  // --- Step 3: Build day col → {name, date} mapping ---
  const dayCols: { col: number; name: string; date: string }[] = [];
  for (let c = 0; c <= maxCol; c++) {
    const v = getCellStr(sheet, dayHeaderRow, c);
    if (DAY_NAMES.includes(v)) {
      const dateSerial = getCellStr(sheet, dayHeaderRow + 1, c);
      const date = dateSerial && !isNaN(Number(dateSerial))
        ? excelDateToISO(Number(dateSerial))
        : "";
      dayCols.push({ col: c, name: v, date });
    }
  }
  if (dayCols.length === 0) { anomalies.push("Colonnes jours non parsées"); return { weekNumber, year, rows: [], anomalies }; }

  function colToDay(col: number): { col: number; name: string; date: string } | null {
    let best: { col: number; name: string; date: string } | null = null;
    for (const dc of dayCols) {
      if (dc.col <= col) best = dc;
      else break;
    }
    return best;
  }

  // --- Step 4: Detect format (simple vs. team) ---
  // Simple: col B = "Produit", Team: col B = team name, col C = "Produit"
  const firstDataRow = dayHeaderRow + 2;
  let isTeamFormat = false;
  for (let r = firstDataRow; r <= Math.min(firstDataRow + 4, maxRow); r++) {
    const b = getCellStr(sheet, r, 1);
    const c2 = getCellStr(sheet, r, 2);
    if (b === "Produit" || b === "Lot") { isTeamFormat = false; break; }
    if (c2 === "Produit" || c2 === "Lot") { isTeamFormat = true; break; }
  }

  const labelCol = isTeamFormat ? 2 : 1;
  const dataStartCol = isTeamFormat ? 3 : 2;

  // --- Step 5: Parse activity blocks ---
  const rows: PlanRow[] = [];
  let currentActivity = "";
  const seenLots = new Map<string, string>(); // "lot|day|activity" → true

  for (let r = firstDataRow; r <= maxRow; r++) {
    const actCell = getCellStr(sheet, r, 0);
    if (actCell) currentActivity = matchActivity(actCell);

    const label = getCellStr(sheet, r, labelCol); // "Produit" or "Lot" (or team name in team format)
    const teamName = isTeamFormat ? getCellStr(sheet, r, 1) : null;

    if (label !== "Produit" && label !== "Lot") continue;
    if (!currentActivity) continue;
    if (currentActivity.toLowerCase().includes("date et visa") || currentActivity.toLowerCase().includes("responsable")) continue;

    const isProductRow = label === "Produit";

    if (isProductRow) {
      // Read product data for each day
      for (let c = dataStartCol; c <= maxCol; c++) {
        const raw = getCellStr(sheet, r, c);
        if (!raw) continue;
        const day = colToDay(c);
        if (!day) continue;

        // Also try to get lot from next row at same column
        const nextLabel = getCellStr(sheet, r + 1, labelCol);
        let lot: string | null = null;
        if (nextLabel === "Lot") {
          const rawLot = getCellStr(sheet, r + 1, c);
          if (rawLot) lot = rawLot.trim();
        }

        const parsed = parseProductCell(raw);
        const mapping = ACTIVITY_MAP[currentActivity] ?? { equipment: null, room: null };

        // Anomaly: product without lot (unless special activity)
        if (parsed.productName && !lot && !parsed.specialActivity) {
          anomalies.push(`${currentActivity} — ${day.name}: produit "${parsed.productName}" sans numéro de lot`);
        }
        // Anomaly: lot without product  
        if (!parsed.productName && lot && !parsed.specialActivity) {
          anomalies.push(`${currentActivity} — ${day.name}: lot "${lot}" sans produit`);
        }
        // Anomaly: duplicate lot/day/activity
        if (lot) {
          const key = `${lot}|${day.date}|${currentActivity}`;
          if (seenLots.has(key)) {
            anomalies.push(`Doublon: lot ${lot}, ${day.name}, ${currentActivity}`);
          } else {
            seenLots.set(key, "1");
          }
        }
        // Anomaly: empty (shouldn't happen since raw is non-empty, but check for quantity)
        if (parsed.productName && !parsed.quantity && !parsed.specialActivity) {
          anomalies.push(`${currentActivity} — ${day.name} — "${parsed.productName}": quantité planifiée non détectée`);
        }

        rows.push({
          weekNumber,
          year,
          date: day.date,
          dayName: day.name,
          activityType: currentActivity,
          team: teamName || null,
          equipment: parsed.specialActivity ? null : mapping.equipment,
          room: parsed.specialActivity ? null : mapping.room,
          productName: parsed.productName,
          lotNumber: lot,
          plannedQuantity: parsed.quantity,
          plannedUnit: parsed.unit,
          specialActivity: parsed.specialActivity,
        });
      }
    }
  }

  // Anomaly: rows with no quantity and no special activity
  for (const row of rows) {
    if (!row.plannedQuantity && !row.specialActivity && row.productName) {
      // already reported above
    }
  }

  return { weekNumber, year, rows, anomalies };
}

// POST /planning/parse — parse Excel file, return preview (no DB write)
router.post("/planning/parse", requireAuth, requireRole("supervisor", "admin"), upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "Fichier manquant" }); return; }
  try {
    const result = parseExcel(req.file.buffer, req.file.originalname);
    res.json({ ...result, fileName: req.file.originalname });
  } catch (err) {
    req.log.error({ err }, "Planning parse error");
    res.status(422).json({ error: "Impossible de lire le fichier Excel", detail: String(err) });
  }
});

// POST /planning/import — save parsed rows to DB
router.post("/planning/import", requireAuth, requireRole("supervisor", "admin"), async (req, res): Promise<void> => {
  const { rows, fileName } = req.body as { rows: PlanRow[]; fileName: string };
  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "Aucune ligne à importer" }); return; }
  const userId = req.user!.id;
  try {
    const inserted = await db.insert(productionPlansTable).values(
      rows.map(r => ({
        weekNumber: r.weekNumber,
        year: r.year,
        plannedDate: r.date,
        dayName: r.dayName,
        activityType: r.activityType,
        team: r.team ?? null,
        equipmentName: r.equipment ?? null,
        roomName: r.room ?? null,
        productName: r.productName ?? null,
        lotNumber: r.lotNumber ?? null,
        plannedQuantity: r.plannedQuantity != null ? String(r.plannedQuantity) : null,
        plannedUnit: r.plannedUnit ?? null,
        specialActivity: r.specialActivity ?? null,
        sourceFileName: fileName,
        importedById: userId,
        validationStatus: "pending" as const,
      }))
    ).returning({ id: productionPlansTable.id });
    res.json({ imported: inserted.length });
  } catch (err) {
    req.log.error({ err }, "Planning import error");
    res.status(500).json({ error: "Erreur lors de l'import" });
  }
});

// GET /planning — list plans (filter by week, year, date)
router.get("/planning", requireAuth, async (req, res): Promise<void> => {
  const { week, year, date, dateFrom, dateTo } = req.query as Record<string, string>;
  const filters = [];
  if (week && year) {
    filters.push(eq(productionPlansTable.weekNumber, parseInt(week)));
    filters.push(eq(productionPlansTable.year, parseInt(year)));
  }
  if (date) filters.push(eq(productionPlansTable.plannedDate, date));
  if (dateFrom) filters.push(gte(productionPlansTable.plannedDate, dateFrom));
  if (dateTo) filters.push(lte(productionPlansTable.plannedDate, dateTo));

  const plans = await db
    .select({
      id: productionPlansTable.id,
      weekNumber: productionPlansTable.weekNumber,
      year: productionPlansTable.year,
      date: productionPlansTable.plannedDate,
      dayName: productionPlansTable.dayName,
      activityType: productionPlansTable.activityType,
      team: productionPlansTable.team,
      equipment: productionPlansTable.equipmentName,
      room: productionPlansTable.roomName,
      productName: productionPlansTable.productName,
      lotNumber: productionPlansTable.lotNumber,
      plannedQuantity: productionPlansTable.plannedQuantity,
      plannedUnit: productionPlansTable.plannedUnit,
      specialActivity: productionPlansTable.specialActivity,
      sourceFileName: productionPlansTable.sourceFileName,
      importedAt: productionPlansTable.importedAt,
      validationStatus: productionPlansTable.validationStatus,
      importedByName: usersTable.firstName,
    })
    .from(productionPlansTable)
    .leftJoin(usersTable, eq(productionPlansTable.importedById, usersTable.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(productionPlansTable.plannedDate, productionPlansTable.activityType);

  res.json(plans.map(p => ({
    ...p,
    importedAt: p.importedAt instanceof Date ? p.importedAt.toISOString() : String(p.importedAt),
    plannedQuantity: p.plannedQuantity != null ? Number(p.plannedQuantity) : null,
  })));
});

// GET /planning/today — today's plans (convenience endpoint for dashboard)
router.get("/planning/today", requireAuth, async (req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const plans = await db
    .select()
    .from(productionPlansTable)
    .where(eq(productionPlansTable.plannedDate, today))
    .orderBy(productionPlansTable.activityType);
  res.json(plans.map(p => ({
    ...p,
    date: p.plannedDate,
    importedAt: p.importedAt instanceof Date ? p.importedAt.toISOString() : String(p.importedAt),
    validatedAt: p.validatedAt instanceof Date ? p.validatedAt.toISOString() : (p.validatedAt ?? null),
    plannedQuantity: p.plannedQuantity != null ? Number(p.plannedQuantity) : null,
  })));
});

// PATCH /planning/:id/validate — validate or reject a plan row
router.patch("/planning/:id/validate", requireAuth, requireRole("supervisor", "admin"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const { status, comment } = req.body as { status: "validated" | "rejected"; comment?: string };
  if (!["validated", "rejected"].includes(status)) { res.status(400).json({ error: "Statut invalide" }); return; }
  const userId = req.user!.id;
  const [updated] = await db.update(productionPlansTable)
    .set({ validationStatus: status, validatedById: userId, validatedAt: new Date(), validationComment: comment ?? null })
    .where(eq(productionPlansTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Plan non trouvé" }); return; }
  res.json({ id: updated.id, validationStatus: updated.validationStatus });
});

// POST /planning/entry — create a single manual entry
router.post("/planning/entry", requireAuth, requireRole("supervisor", "admin"), async (req, res): Promise<void> => {
  const { date, activityType, productName, lotNumber, plannedQuantity, plannedUnit, specialActivity, team } = req.body as {
    date: string; activityType: string; productName?: string; lotNumber?: string;
    plannedQuantity?: number; plannedUnit?: string; specialActivity?: string; team?: string;
  };
  if (!date || !activityType) { res.status(400).json({ error: "date et activityType requis" }); return; }

  // Calculate ISO week number from date
  const d = new Date(date + "T12:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - jan4.getDay() + 1);
  const diffMs = d.getTime() - startOfWeek1.getTime();
  const weekNumber = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  const year = d.getFullYear();

  const DAY_NAMES_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const dayName = DAY_NAMES_FR[d.getDay()];
  const mapping = ACTIVITY_MAP[activityType] ?? { equipment: null, room: null };

  const [row] = await db.insert(productionPlansTable).values({
    weekNumber,
    year,
    plannedDate: date,
    dayName,
    activityType,
    team: team ?? null,
    equipmentName: specialActivity ? null : mapping.equipment,
    roomName: specialActivity ? null : mapping.room,
    productName: productName ?? null,
    lotNumber: lotNumber ?? null,
    plannedQuantity: plannedQuantity != null ? String(plannedQuantity) : null,
    plannedUnit: plannedUnit ?? null,
    specialActivity: specialActivity ?? null,
    sourceFileName: "Saisie manuelle",
    importedById: req.user!.id,
    validationStatus: "pending",
  }).returning({ id: productionPlansTable.id });
  res.status(201).json({ id: row.id });
});

// PATCH /planning/:id — update a plan entry fields
router.patch("/planning/:id", requireAuth, requireRole("supervisor", "admin"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const { productName, lotNumber, plannedQuantity, plannedUnit, specialActivity, activityType, team, date } = req.body as {
    productName?: string | null; lotNumber?: string | null; plannedQuantity?: number | null;
    plannedUnit?: string | null; specialActivity?: string | null; activityType?: string; team?: string | null; date?: string;
  };
  const patch: Record<string, unknown> = {};
  if (productName !== undefined) patch.productName = productName;
  if (lotNumber !== undefined) patch.lotNumber = lotNumber;
  if (plannedQuantity !== undefined) patch.plannedQuantity = plannedQuantity != null ? String(plannedQuantity) : null;
  if (plannedUnit !== undefined) patch.plannedUnit = plannedUnit;
  if (specialActivity !== undefined) patch.specialActivity = specialActivity;
  if (activityType !== undefined) {
    patch.activityType = activityType;
    const mapping = ACTIVITY_MAP[activityType] ?? { equipment: null, room: null };
    patch.equipmentName = mapping.equipment;
    patch.roomName = mapping.room;
  }
  if (team !== undefined) patch.team = team;
  if (date !== undefined) {
    const d = new Date(date + "T12:00:00");
    const DAY_NAMES_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    patch.plannedDate = date;
    patch.dayName = DAY_NAMES_FR[d.getDay()];
    // Recalculate week
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const startOfWeek1 = new Date(jan4);
    startOfWeek1.setDate(jan4.getDate() - jan4.getDay() + 1);
    patch.weekNumber = Math.floor((d.getTime() - startOfWeek1.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    patch.year = d.getFullYear();
  }
  if (Object.keys(patch).length === 0) { res.status(400).json({ error: "Aucun champ à modifier" }); return; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [updated] = await db.update(productionPlansTable).set(patch as any).where(eq(productionPlansTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Entrée non trouvée" }); return; }
  res.json(updated);
});

// DELETE /planning/:id — delete a plan entry
router.delete("/planning/:id", requireAuth, requireRole("supervisor", "admin"), async (req, res): Promise<void> => {
  const id = req.params["id"] as string;
  const [deleted] = await db.delete(productionPlansTable).where(eq(productionPlansTable.id, id)).returning({ id: productionPlansTable.id });
  if (!deleted) { res.status(404).json({ error: "Entrée non trouvée" }); return; }
  res.sendStatus(204);
});

// GET /planning/weeks — list weeks with entry counts (deduplicated by week+year)
router.get("/planning/weeks", requireAuth, async (req, res): Promise<void> => {
  const result = await db
    .select({
      weekNumber: productionPlansTable.weekNumber,
      year: productionPlansTable.year,
      entryCount: count(),
      importedAt: max(productionPlansTable.importedAt),
      // Most recent source file name for this week
      sourceFileName: sql<string>`(array_agg(${productionPlansTable.sourceFileName} ORDER BY ${productionPlansTable.importedAt} DESC))[1]`,
    })
    .from(productionPlansTable)
    .groupBy(productionPlansTable.weekNumber, productionPlansTable.year)
    .orderBy(desc(productionPlansTable.year), desc(productionPlansTable.weekNumber));
  res.json(result.map(r => ({
    weekNumber: r.weekNumber,
    year: r.year,
    entryCount: r.entryCount,
    sourceFileName: r.sourceFileName,
    importedAt: r.importedAt instanceof Date ? r.importedAt.toISOString() : String(r.importedAt),
  })));
});

export default router;
